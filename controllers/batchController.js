import crypto from "crypto";
import Batch from "../models/Batch.js";
import BatchMembership from "../models/BatchMembership.js";
import User from "../models/User.js";
import Organization from "../models/Organization.js";
import { isSuperAdmin, toId } from "../utils/access.js";

// Active-batch limits per plan. Teachers without an organization use "free".
// Override with BATCH_LIMITS='{"free":30}' in the environment.
const DEFAULT_LIMITS = { free: 20, basic: 50, premium: 200, enterprise: Infinity };
function batchLimits() {
  try {
    return { ...DEFAULT_LIMITS, ...JSON.parse(process.env.BATCH_LIMITS || "{}") };
  } catch {
    return DEFAULT_LIMITS;
  }
}

const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fail = (res, status, message) => res.status(status).json({ success: false, message });

function newCode() {
  return crypto.randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
}

async function uniqueCode() {
  for (let i = 0; i < 10; i++) {
    const c = newCode();
    if (!(await Batch.exists({ code: c }))) return c;
  }
  throw new Error("Could not generate a unique batch code");
}

/** Loads a batch the current teacher owns (or any batch for super admin). */
async function ownBatch(req, res) {
  const id = toId(req.params.id);
  if (!id) {
    fail(res, 400, "Invalid batch id.");
    return null;
  }
  const batch = await Batch.findById(id);
  if (!batch) {
    fail(res, 404, "Batch not found.");
    return null;
  }
  if (!isSuperAdmin(req.user) && String(batch.ownerId) !== String(req.user._id)) {
    fail(res, 403, "You can only manage your own batches.");
    return null;
  }
  return batch;
}

function shape(b, count = 0) {
  return {
    _id: b._id,
    name: b.name,
    classLevel: b.classLevel,
    academicYear: b.academicYear,
    subject: b.subject,
    description: b.description,
    code: b.code,
    status: b.status,
    studentCount: count,
    createdAt: b.createdAt,
  };
}

// GET /api/batches
export const listBatches = async (req, res) => {
  try {
    const filter = isSuperAdmin(req.user) && req.query.all === "1" ? {} : { ownerId: req.user._id };
    if (req.query.status === "archived") filter.status = "archived";
    else if (req.query.status !== "any") filter.status = { $ne: "archived" };
    const batches = await Batch.find(filter).sort({ createdAt: -1 }).lean();
    const counts = await BatchMembership.aggregate([
      { $match: { batchId: { $in: batches.map((b) => b._id) }, status: "active" } },
      { $group: { _id: "$batchId", n: { $sum: 1 } } },
    ]);
    const cMap = new Map(counts.map((c) => [String(c._id), c.n]));
    return res.json({ success: true, batches: batches.map((b) => shape(b, cMap.get(String(b._id)) || 0)) });
  } catch (e) {
    console.error("listBatches:", e.message);
    return fail(res, 500, "Could not load batches.");
  }
};

// POST /api/batches
export const createBatch = async (req, res) => {
  try {
    const { name, classLevel = "", academicYear = "", subject = "", description = "" } = req.body || {};
    if (!name || !String(name).trim()) return fail(res, 400, "Batch name is required.");
    if (String(name).trim().length > 120) return fail(res, 400, "Batch name is too long.");

    const org = await Organization.findOne({ ownerId: req.user._id }).select("plan").lean();
    const limit = batchLimits()[org?.plan || "free"] ?? DEFAULT_LIMITS.free;
    const active = await Batch.countDocuments({ ownerId: req.user._id, status: { $ne: "archived" } });
    if (!isSuperAdmin(req.user) && active >= limit) {
      return fail(res, 403, `Your plan allows ${limit} active batches. Archive a batch or upgrade your plan.`);
    }

    const batch = await Batch.create({
      ownerId: req.user._id,
      organizationId: null,
      name: String(name).trim(),
      classLevel: String(classLevel).trim(),
      academicYear: String(academicYear || new Date().getFullYear()).trim(),
      subject: String(subject).trim(),
      description: String(description).trim(),
      code: await uniqueCode(),
    });
    return res.status(201).json({ success: true, batch: shape(batch, 0) });
  } catch (e) {
    if (e.code === 11000) return fail(res, 409, "You already have a batch with this name.");
    if (e.name === "ValidationError") return fail(res, 400, e.message);
    console.error("createBatch:", e.message);
    return fail(res, 500, "Could not create batch.");
  }
};

// PUT /api/batches/:id
export const updateBatch = async (req, res) => {
  try {
    const batch = await ownBatch(req, res);
    if (!batch) return;
    for (const f of ["name", "classLevel", "academicYear", "subject", "description"]) {
      if (req.body[f] !== undefined) batch[f] = String(req.body[f]).trim();
    }
    if (!batch.name) return fail(res, 400, "Batch name is required.");
    await batch.save();
    const count = await BatchMembership.countDocuments({ batchId: batch._id, status: "active" });
    return res.json({ success: true, batch: shape(batch, count) });
  } catch (e) {
    if (e.code === 11000) return fail(res, 409, "You already have a batch with this name.");
    console.error("updateBatch:", e.message);
    return fail(res, 500, "Could not update batch.");
  }
};

// POST /api/batches/:id/archive  and  /restore
export const setBatchArchived = (archived) => async (req, res) => {
  try {
    const batch = await ownBatch(req, res);
    if (!batch) return;
    batch.status = archived ? "archived" : "active";
    batch.isActive = !archived;
    await batch.save();
    return res.json({ success: true, batch: shape(batch) });
  } catch (e) {
    console.error("archiveBatch:", e.message);
    return fail(res, 500, "Could not update batch.");
  }
};

// POST /api/batches/:id/regenerate-code
export const regenerateCode = async (req, res) => {
  try {
    const batch = await ownBatch(req, res);
    if (!batch) return;
    batch.code = await uniqueCode();
    await batch.save();
    return res.json({ success: true, code: batch.code });
  } catch (e) {
    console.error("regenerateCode:", e.message);
    return fail(res, 500, "Could not regenerate code.");
  }
};

// GET /api/batches/:id/students
export const listBatchStudents = async (req, res) => {
  try {
    const batch = await ownBatch(req, res);
    if (!batch) return;
    const rows = await BatchMembership.find({ batchId: batch._id, status: "active" })
      .populate("studentId", "name email phone rollNumber avatar isActive")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({
      success: true,
      batch: shape(batch, rows.length),
      students: rows
        .filter((r) => r.studentId)
        .map((r) => ({ ...r.studentId, joinedAt: r.createdAt, joinedVia: r.joinedVia })),
    });
  } catch (e) {
    console.error("listBatchStudents:", e.message);
    return fail(res, 500, "Could not load students.");
  }
};

async function addMembers(batch, studentIds, addedBy, via = "teacher") {
  const ids = [...new Set(studentIds.map(String))].map(toId).filter(Boolean);
  const valid = await User.find({ _id: { $in: ids }, role: "student" }).select("_id").lean();
  const validIds = valid.map((v) => v._id);
  let added = 0;
  let already = 0;
  const activeNow = new Set(
    (await BatchMembership.find({ batchId: batch._id, studentId: { $in: validIds }, status: "active" }).distinct("studentId")).map(String)
  );
  for (const sid of validIds) {
    if (activeNow.has(String(sid))) {
      already += 1;
      continue;
    }
    // Insert, or re-activate a previously removed membership (unique index prevents duplicates).
    await BatchMembership.updateOne(
      { batchId: batch._id, studentId: sid },
      { $set: { status: "active", removedAt: null }, $setOnInsert: { addedBy, joinedVia: via } },
      { upsert: true }
    );
    added += 1;
  }
  return { added, already, invalid: ids.length - validIds.length };
}

// POST /api/batches/:id/students  { studentIds: [] }
export const addBatchStudents = async (req, res) => {
  try {
    const batch = await ownBatch(req, res);
    if (!batch) return;
    if (batch.status === "archived") return fail(res, 400, "This batch is archived.");
    const { studentIds } = req.body || {};
    if (!Array.isArray(studentIds) || !studentIds.length) return fail(res, 400, "Select at least one student.");
    if (studentIds.length > 500) return fail(res, 400, "Add at most 500 students at once.");
    const result = await addMembers(batch, studentIds, req.user._id);
    return res.json({ success: true, ...result });
  } catch (e) {
    console.error("addBatchStudents:", e.message);
    return fail(res, 500, "Could not add students.");
  }
};

// DELETE /api/batches/:id/students/:studentId
export const removeBatchStudent = async (req, res) => {
  try {
    const batch = await ownBatch(req, res);
    if (!batch) return;
    const sid = toId(req.params.studentId);
    const r = await BatchMembership.updateOne({ batchId: batch._id, studentId: sid, status: "active" }, { $set: { status: "removed", removedAt: new Date() } });
    if (!r.matchedCount) return fail(res, 404, "Student is not in this batch.");
    return res.json({ success: true });
  } catch (e) {
    console.error("removeBatchStudent:", e.message);
    return fail(res, 500, "Could not remove student.");
  }
};

// POST /api/batches/:id/move  { studentIds: [], toBatchId }
export const moveBatchStudents = async (req, res) => {
  try {
    const from = await ownBatch(req, res);
    if (!from) return;
    const toId_ = toId(req.body?.toBatchId);
    if (!toId_ || String(toId_) === String(from._id)) return fail(res, 400, "Choose a different target batch.");
    const to = await Batch.findById(toId_);
    if (!to || (!isSuperAdmin(req.user) && String(to.ownerId) !== String(req.user._id))) return fail(res, 403, "You can only move students into your own batches.");
    if (to.status === "archived") return fail(res, 400, "The target batch is archived.");
    const ids = (req.body.studentIds || []).map(toId).filter(Boolean);
    if (!ids.length) return fail(res, 400, "Select at least one student.");
    const members = await BatchMembership.find({ batchId: from._id, studentId: { $in: ids }, status: "active" }).select("studentId").lean();
    const memberIds = members.map((m) => m.studentId);
    const result = await addMembers(to, memberIds, req.user._id);
    await BatchMembership.updateMany({ batchId: from._id, studentId: { $in: memberIds } }, { $set: { status: "removed", removedAt: new Date() } });
    return res.json({ success: true, moved: memberIds.length, ...result });
  } catch (e) {
    console.error("moveBatchStudents:", e.message);
    return fail(res, 500, "Could not move students.");
  }
};

// GET /api/batches/students/search?q=&batchId=&page=
export const searchStudents = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 80);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const filter = { role: "student", isActive: { $ne: false } };
    if (q) {
      const rx = new RegExp(escapeRx(q), "i");
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { rollNumber: rx }];
    }
    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).select("name email phone rollNumber avatar createdAt").sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    // Which of my batches each student is already in
    const myBatches = await Batch.find({ ownerId: req.user._id, status: { $ne: "archived" } }).select("_id name").lean();
    const memberships = await BatchMembership.find({ studentId: { $in: users.map((u) => u._id) }, batchId: { $in: myBatches.map((b) => b._id) }, status: "active" }).lean();
    const nameMap = new Map(myBatches.map((b) => [String(b._id), b.name]));
    const byStudent = new Map();
    memberships.forEach((m) => {
      const k = String(m.studentId);
      if (!byStudent.has(k)) byStudent.set(k, []);
      byStudent.get(k).push({ _id: m.batchId, name: nameMap.get(String(m.batchId)) });
    });
    return res.json({
      success: true,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      students: users.map((u) => ({ ...u, batches: byStudent.get(String(u._id)) || [] })),
    });
  } catch (e) {
    console.error("searchStudents:", e.message);
    return fail(res, 500, "Could not search students.");
  }
};

// ---------------- Student side ----------------

// GET /api/batches/mine
export const myBatches = async (req, res) => {
  try {
    const rows = await BatchMembership.find({ studentId: req.user._id, status: "active" }).populate("batchId").lean();
    const batches = rows.map((r) => r.batchId).filter((b) => b && b.status !== "archived");
    const owners = await User.find({ _id: { $in: batches.map((b) => b.ownerId) } }).select("name").lean();
    const oMap = new Map(owners.map((o) => [String(o._id), o.name]));
    return res.json({
      success: true,
      batches: batches.map((b) => ({
        _id: b._id,
        name: b.name,
        classLevel: b.classLevel,
        academicYear: b.academicYear,
        subject: b.subject,
        description: b.description,
        teacherName: oMap.get(String(b.ownerId)) || "",
      })),
    });
  } catch (e) {
    console.error("myBatches:", e.message);
    return fail(res, 500, "Could not load your batches.");
  }
};

// POST /api/batches/join  { code }
export const joinBatch = async (req, res) => {
  try {
    if (req.user.role !== "student") return fail(res, 403, "Only student accounts can join batches.");
    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) return fail(res, 400, "Enter a valid batch code.");
    const batch = await Batch.findOne({ code, status: { $ne: "archived" } });
    if (!batch) return fail(res, 404, "No active batch has this code.");
    const r = await addMembers(batch, [req.user._id], null, "code");
    return res.json({ success: true, alreadyMember: r.added === 0, batch: { _id: batch._id, name: batch.name } });
  } catch (e) {
    console.error("joinBatch:", e.message);
    return fail(res, 500, "Could not join batch.");
  }
};
