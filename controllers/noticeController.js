import Notice from "../models/Notice.js";
import NoticeRead from "../models/NoticeRead.js";
import Batch from "../models/Batch.js";
import User from "../models/User.js";
import { isSuperAdmin, studentNoticeFilter, toId } from "../utils/access.js";
import { imagePublicUrl } from "../middleware/upload.js";

const fail = (res, status, message) => res.status(status).json({ success: false, message });

function parseList(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [v];
    } catch {
      return v.split(",");
    }
  }
  return [];
}

async function buildAudience(body, user) {
  const all = body.audienceAll === true || body.audienceAll === "true";
  if (all) return { all: true, batchIds: [], studentIds: [] };
  const batchIds = parseList(body.batchIds).map(toId).filter(Boolean);
  const studentIds = parseList(body.studentIds).map(toId).filter(Boolean);
  if (!batchIds.length && !studentIds.length) throw Object.assign(new Error("Choose who should see this notice."), { status: 400 });
  if (batchIds.length) {
    const filter = { _id: { $in: batchIds } };
    if (!isSuperAdmin(user)) filter.ownerId = user._id;
    if ((await Batch.countDocuments(filter)) !== batchIds.length) throw Object.assign(new Error("You can only target your own batches."), { status: 403 });
  }
  if (studentIds.length && (await User.countDocuments({ _id: { $in: studentIds }, role: "student" })) !== studentIds.length) {
    throw Object.assign(new Error("Some selected students do not exist."), { status: 400 });
  }
  return { all: false, batchIds, studentIds };
}

function parseDate(v, fallback = null) {
  if (v === undefined || v === null || v === "") return fallback;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw Object.assign(new Error("Invalid date."), { status: 400 });
  return d;
}

// POST /api/notices (multipart: optional "attachment")
export const createNotice = async (req, res) => {
  try {
    const { title, body = "", priority = "normal" } = req.body || {};
    if (!title || !String(title).trim()) return fail(res, 400, "Title is required.");
    if (!["normal", "important", "urgent"].includes(priority)) return fail(res, 400, "Invalid priority.");
    const audience = await buildAudience(req.body, req.user);
    const publishAt = parseDate(req.body.publishAt, new Date());
    const expiresAt = parseDate(req.body.expiresAt, null);
    if (expiresAt && expiresAt <= publishAt) return fail(res, 400, "Expiry must be after the publish date.");
    const notice = await Notice.create({
      title: String(title).trim(),
      body: String(body).trim(),
      priority,
      authorId: req.user._id,
      audience,
      publishAt,
      expiresAt,
      attachmentUrl: req.file ? req.file.filename : "",
      attachmentName: req.file ? req.file.originalname.slice(0, 120) : "",
    });
    return res.status(201).json({ success: true, notice });
  } catch (e) {
    if (e.status) return fail(res, e.status, e.message);
    console.error("createNotice:", e.message);
    return fail(res, 500, "Could not publish notice.");
  }
};

// GET /api/notices/manage — teacher's own notices with read counts
export const listMyNotices = async (req, res) => {
  try {
    const filter = isSuperAdmin(req.user) && req.query.all === "1" ? {} : { authorId: req.user._id };
    filter.archivedAt = null;
    const notices = await Notice.find(filter).sort({ publishAt: -1 }).limit(200).populate("audience.batchIds", "name").lean();
    const reads = await NoticeRead.aggregate([{ $match: { noticeId: { $in: notices.map((n) => n._id) } } }, { $group: { _id: "$noticeId", n: { $sum: 1 } } }]);
    const rMap = new Map(reads.map((r) => [String(r._id), r.n]));
    return res.json({
      success: true,
      notices: notices.map((n) => ({ ...n, attachmentUrl: imagePublicUrl(n.attachmentUrl), readCount: rMap.get(String(n._id)) || 0 })),
    });
  } catch (e) {
    console.error("listMyNotices:", e.message);
    return fail(res, 500, "Could not load notices.");
  }
};

// PUT /api/notices/:id
export const updateNotice = async (req, res) => {
  try {
    const n = await Notice.findById(toId(req.params.id));
    if (!n || n.archivedAt) return fail(res, 404, "Notice not found.");
    if (!isSuperAdmin(req.user) && String(n.authorId) !== String(req.user._id)) return fail(res, 403, "You can only edit your own notices.");
    if (req.body.title !== undefined) n.title = String(req.body.title).trim() || n.title;
    if (req.body.body !== undefined) n.body = String(req.body.body).trim();
    if (req.body.priority !== undefined) {
      if (!["normal", "important", "urgent"].includes(req.body.priority)) return fail(res, 400, "Invalid priority.");
      n.priority = req.body.priority;
    }
    if (req.body.publishAt !== undefined) n.publishAt = parseDate(req.body.publishAt, new Date());
    if (req.body.expiresAt !== undefined) n.expiresAt = parseDate(req.body.expiresAt, null);
    if (req.body.audienceAll !== undefined || req.body.batchIds !== undefined || req.body.studentIds !== undefined) {
      n.audience = await buildAudience(req.body, req.user);
    }
    await n.save();
    return res.json({ success: true, notice: n });
  } catch (e) {
    if (e.status) return fail(res, e.status, e.message);
    console.error("updateNotice:", e.message);
    return fail(res, 500, "Could not update notice.");
  }
};

// DELETE /api/notices/:id  (archives; read history is kept)
export const archiveNotice = async (req, res) => {
  try {
    const n = await Notice.findById(toId(req.params.id));
    if (!n || n.archivedAt) return fail(res, 404, "Notice not found.");
    if (!isSuperAdmin(req.user) && String(n.authorId) !== String(req.user._id)) return fail(res, 403, "You can only remove your own notices.");
    n.archivedAt = new Date();
    await n.save();
    return res.json({ success: true });
  } catch (e) {
    console.error("archiveNotice:", e.message);
    return fail(res, 500, "Could not remove notice.");
  }
};

// GET /api/notices — notices visible to the signed-in student
export const listStudentNotices = async (req, res) => {
  try {
    const filter = await studentNoticeFilter(req.user);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const notices = await Notice.find(filter).sort({ priority: -1, publishAt: -1 }).limit(limit).populate("authorId", "name").lean();
    const reads = await NoticeRead.find({ userId: req.user._id, noticeId: { $in: notices.map((n) => n._id) } }).select("noticeId readAt").lean();
    const rMap = new Map(reads.map((r) => [String(r.noticeId), r.readAt]));
    const out = notices
      .map((n) => ({
        _id: n._id,
        title: n.title,
        body: n.body,
        priority: n.priority,
        publishAt: n.publishAt,
        expiresAt: n.expiresAt,
        attachmentUrl: imagePublicUrl(n.attachmentUrl),
        attachmentName: n.attachmentName,
        authorName: n.authorId?.name || "",
        readAt: rMap.get(String(n._id)) || null,
      }))
      .sort((a, b) => new Date(b.publishAt) - new Date(a.publishAt));
    return res.json({ success: true, unread: out.filter((n) => !n.readAt).length, notices: out });
  } catch (e) {
    console.error("listStudentNotices:", e.message);
    return fail(res, 500, "Could not load notices.");
  }
};

// POST /api/notices/:id/read
export const markNoticeRead = async (req, res) => {
  try {
    const id = toId(req.params.id);
    const filter = await studentNoticeFilter(req.user);
    const visible = await Notice.exists({ _id: id, ...filter });
    if (!visible) return fail(res, 404, "Notice not found.");
    await NoticeRead.updateOne({ userId: req.user._id, noticeId: id }, { $setOnInsert: { readAt: new Date() } }, { upsert: true });
    return res.json({ success: true });
  } catch (e) {
    console.error("markNoticeRead:", e.message);
    return fail(res, 500, "Could not update notice.");
  }
};
