// Platform administration (super admin only) and organization administration (org admin).
// Every change is written to AdminAuditLog. Nothing is hard-deleted.

import User from "../models/User.js";
import Organization from "../models/Organization.js";
import OrganizationMembership from "../models/OrganizationMembership.js";
import Exam from "../models/Exam.js";
import Submission from "../models/Submission.js";
import Question from "../models/Question.js";
import Batch from "../models/Batch.js";
import Battle from "../models/Battle.js";
import QuestionReport from "../models/QuestionReport.js";
import AdminAuditLog from "../models/AdminAuditLog.js";
import { isSuperAdmin, toId } from "../utils/access.js";

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const DAY = 86400000;

function dailySeries(rows, days) {
  const map = new Map(rows.map((r) => [r._id, r.n]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    out.push({ day: d, count: map.get(d) || 0 });
  }
  return out;
}
const perDay = (Model, match, days) =>
  Model.aggregate([
    { $match: { ...match, createdAt: { $gte: new Date(Date.now() - days * DAY) } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, n: { $sum: 1 } } },
  ]).then((r) => dailySeries(r, days));

const userView = (u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  phone: u.phone || "",
  role: u.role,
  globalRole: u.globalRole,
  isActive: u.isActive !== false,
  createdAt: u.createdAt,
});

// ---------------------------------------------------------------- platform

// GET /api/admin/overview
export const platformOverview = async (req, res) => {
  try {
    const [byRole, inactive, exams, submissions, questions, hiddenQuestions, batches, battles, orgs, openReports, signups, subsPerDay] = await Promise.all([
      User.aggregate([{ $group: { _id: "$role", n: { $sum: 1 } } }]),
      User.countDocuments({ isActive: false }),
      Exam.countDocuments({ archivedAt: null }),
      Submission.countDocuments({}),
      Question.countDocuments({}),
      Question.countDocuments({ hidden: true }),
      Batch.countDocuments({ status: { $ne: "archived" } }),
      Battle.countDocuments({ status: "finished" }),
      Organization.countDocuments({}),
      QuestionReport.countDocuments({ status: "open" }),
      perDay(User, {}, 30),
      perDay(Submission, {}, 30),
    ]);
    const roles = Object.fromEntries(byRole.map((r) => [r._id || "unknown", r.n]));
    return res.json({
      success: true,
      users: { total: Object.values(roles).reduce((a, b) => a + b, 0), byRole: roles, inactive },
      content: { questions, hiddenQuestions, exams, submissions, batches, battles, organizations: orgs, openReports },
      series: { signups, submissions: subsPerDay },
    });
  } catch (e) {
    console.error("platformOverview:", e.message);
    return fail(res, 500, "Could not load the overview.");
  }
};

// GET /api/admin/users?role=&q=&status=&page=
export const listUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit) || 25));
    const filter = {};
    if (["student", "tutor", "org_admin"].includes(req.query.role)) filter.role = req.query.role;
    if (req.query.status === "active") filter.isActive = { $ne: false };
    if (req.query.status === "inactive") filter.isActive = false;
    const q = String(req.query.q || "").trim().slice(0, 80);
    if (q) {
      const rx = new RegExp(escapeRx(q), "i");
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }
    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    const ids = users.map((u) => u._id);
    const [subs, mships] = await Promise.all([
      Submission.aggregate([{ $match: { studentId: { $in: ids } } }, { $group: { _id: "$studentId", n: { $sum: 1 }, last: { $max: "$createdAt" } } }]),
      OrganizationMembership.find({ userId: { $in: ids }, status: "active" }).populate("organizationId", "name").lean(),
    ]);
    const sMap = new Map(subs.map((s) => [String(s._id), s]));
    const oMap = new Map();
    mships.forEach((m) => oMap.set(String(m.userId), [...(oMap.get(String(m.userId)) || []), { name: m.organizationId?.name, role: m.role }]));
    return res.json({
      success: true,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      users: users.map((u) => ({ ...userView(u), submissions: sMap.get(String(u._id))?.n || 0, lastSubmissionAt: sMap.get(String(u._id))?.last || null, organizations: oMap.get(String(u._id)) || [] })),
    });
  } catch (e) {
    console.error("listUsers:", e.message);
    return fail(res, 500, "Could not load users.");
  }
};

// PATCH /api/admin/users/:id  { role?, isActive? }
export const updateUser = async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return fail(res, 400, "Invalid user id.");
    if (String(id) === String(req.user._id)) return fail(res, 400, "You can't change your own role or status here.");
    const u = await User.findById(id);
    if (!u) return fail(res, 404, "User not found.");
    if (u.globalRole === "super_admin") return fail(res, 403, "Super admin accounts can't be changed from the portal.");
    const before = userView(u);
    const { role, isActive } = req.body || {};
    if (role !== undefined) {
      if (!["student", "tutor", "org_admin"].includes(role)) return fail(res, 400, "Role must be student, tutor or org_admin.");
      u.role = role;
    }
    if (isActive !== undefined) u.isActive = Boolean(isActive);
    await u.save();
    await AdminAuditLog.create({ actorId: req.user._id, scope: "platform", action: "user.update", targetType: "User", targetId: u._id, before, after: userView(u) });
    return res.json({ success: true, user: userView(u) });
  } catch (e) {
    console.error("updateUser:", e.message);
    return fail(res, 500, "Could not update the user.");
  }
};

// GET /api/admin/organizations
export const listOrganizations = async (req, res) => {
  try {
    const orgs = await Organization.find({}).sort({ createdAt: -1 }).populate("ownerId", "name email").lean();
    const counts = await OrganizationMembership.aggregate([
      { $match: { organizationId: { $in: orgs.map((o) => o._id) }, status: "active" } },
      { $group: { _id: { o: "$organizationId", r: "$role" }, n: { $sum: 1 } } },
    ]);
    const c = {};
    counts.forEach((x) => {
      const k = String(x._id.o);
      c[k] = c[k] || {};
      c[k][x._id.r] = x.n;
    });
    return res.json({
      success: true,
      organizations: orgs.map((o) => ({
        _id: o._id,
        name: o.name,
        code: o.code,
        slug: o.slug,
        status: o.status,
        plan: o.plan,
        location: o.location,
        contactEmail: o.contactEmail,
        owner: o.ownerId ? { name: o.ownerId.name, email: o.ownerId.email } : null,
        members: c[String(o._id)] || {},
        createdAt: o.createdAt,
      })),
    });
  } catch (e) {
    console.error("listOrganizations:", e.message);
    return fail(res, 500, "Could not load organizations.");
  }
};

// PATCH /api/admin/organizations/:id  { status?, plan? }
export const updateOrganization = async (req, res) => {
  try {
    const org = await Organization.findById(toId(req.params.id));
    if (!org) return fail(res, 404, "Organization not found.");
    const before = { status: org.status, plan: org.plan };
    const { status, plan } = req.body || {};
    if (status !== undefined) {
      if (!["active", "suspended", "trial"].includes(status)) return fail(res, 400, "Invalid status.");
      org.status = status;
    }
    if (plan !== undefined) {
      if (!["free", "basic", "premium", "enterprise"].includes(plan)) return fail(res, 400, "Invalid plan.");
      org.plan = plan;
    }
    await org.save();
    await AdminAuditLog.create({ actorId: req.user._id, scope: "platform", action: "organization.update", targetType: "Organization", targetId: org._id, before, after: { status: org.status, plan: org.plan } });
    return res.json({ success: true, organization: { _id: org._id, status: org.status, plan: org.plan } });
  } catch (e) {
    console.error("updateOrganization:", e.message);
    return fail(res, 500, "Could not update the organization.");
  }
};

// GET /api/admin/audit-log
export const auditLog = async (req, res) => {
  try {
    const filter = isSuperAdmin(req.user) ? {} : { organizationId: req.orgAdminOrg?._id || null };
    const rows = await AdminAuditLog.find(filter).sort({ createdAt: -1 }).limit(200).populate("actorId", "name email").lean();
    return res.json({ success: true, entries: rows });
  } catch (e) {
    return fail(res, 500, "Could not load the audit log.");
  }
};

// ---------------------------------------------------------------- organization admin

/** Middleware: resolves the organization the caller administers (org_admin membership or owner). */
export const requireOrgAdmin = async (req, res, next) => {
  try {
    const wanted = toId(req.query.orgId || req.body?.orgId);
    let org = null;
    if (isSuperAdmin(req.user) && wanted) org = await Organization.findById(wanted);
    if (!org) {
      const m = await OrganizationMembership.findOne({ userId: req.user._id, role: "org_admin", status: "active", ...(wanted ? { organizationId: wanted } : {}) });
      org = m ? await Organization.findById(m.organizationId) : await Organization.findOne({ ownerId: req.user._id, ...(wanted ? { _id: wanted } : {}) });
    }
    if (!org) return fail(res, 403, "You don't administer an organization.");
    if (org.status === "suspended" && !isSuperAdmin(req.user)) return fail(res, 403, "This organization is suspended.");
    req.orgAdminOrg = org;
    next();
  } catch (e) {
    return fail(res, 500, "Could not resolve your organization.");
  }
};

// GET /api/org/overview
export const orgOverview = async (req, res) => {
  try {
    const org = req.orgAdminOrg;
    const members = await OrganizationMembership.find({ organizationId: org._id, status: "active" }).lean();
    const byRole = members.reduce((a, m) => ((a[m.role] = (a[m.role] || 0) + 1), a), {});
    const staffIds = members.filter((m) => m.role !== "student").map((m) => m.userId);
    const studentIds = members.filter((m) => m.role === "student").map((m) => m.userId);
    const exams = await Exam.find({ $or: [{ organizationId: org._id }, { authorId: { $in: staffIds } }], archivedAt: null }).select("_id title examCode createdAt").sort({ createdAt: -1 }).lean();
    const examIds = exams.map((e) => e._id);
    const [submissions, avg, batches, subsPerDay] = await Promise.all([
      Submission.countDocuments({ examId: { $in: examIds } }),
      Submission.aggregate([{ $match: { examId: { $in: examIds }, totalQuestions: { $gt: 0 } } }, { $group: { _id: null, p: { $avg: { $divide: ["$score", "$totalQuestions"] } } } }]),
      Batch.countDocuments({ ownerId: { $in: staffIds }, status: { $ne: "archived" } }),
      perDay(Submission, { examId: { $in: examIds } }, 30),
    ]);
    return res.json({
      success: true,
      organization: { _id: org._id, name: org.name, code: org.code, status: org.status, plan: org.plan, location: org.location },
      members: { byRole, total: members.length, students: studentIds.length },
      content: { exams: exams.length, submissions, averagePct: avg[0] ? Math.round(avg[0].p * 100) : null, batches },
      recentExams: exams.slice(0, 5),
      series: { submissions: subsPerDay },
    });
  } catch (e) {
    console.error("orgOverview:", e.message);
    return fail(res, 500, "Could not load the organization overview.");
  }
};

// GET /api/org/members?role=&q=
export const orgMembers = async (req, res) => {
  try {
    const filter = { organizationId: req.orgAdminOrg._id };
    if (["org_admin", "teacher", "student"].includes(req.query.role)) filter.role = req.query.role;
    if (req.query.status !== "all") filter.status = { $ne: "inactive" };
    const rows = await OrganizationMembership.find(filter).populate("userId", "name email phone role isActive createdAt").sort({ createdAt: -1 }).lean();
    const q = String(req.query.q || "").trim().toLowerCase();
    const list = rows
      .filter((m) => m.userId)
      .filter((m) => !q || `${m.userId.name} ${m.userId.email} ${m.userId.phone || ""}`.toLowerCase().includes(q))
      .map((m) => ({ membershipId: m._id, role: m.role, status: m.status, studentRoll: m.studentRoll, joinedAt: m.createdAt, user: userView(m.userId) }));
    return res.json({ success: true, members: list });
  } catch (e) {
    console.error("orgMembers:", e.message);
    return fail(res, 500, "Could not load members.");
  }
};

// PATCH /api/org/members/:membershipId  { role?, status? }
export const updateOrgMember = async (req, res) => {
  try {
    const m = await OrganizationMembership.findOne({ _id: toId(req.params.membershipId), organizationId: req.orgAdminOrg._id });
    if (!m) return fail(res, 404, "Member not found in your organization.");
    if (String(m.userId) === String(req.user._id)) return fail(res, 400, "You can't change your own membership.");
    if (String(m.userId) === String(req.orgAdminOrg.ownerId)) return fail(res, 403, "The organization owner can't be changed.");
    const before = { role: m.role, status: m.status };
    const { role, status } = req.body || {};
    if (role !== undefined) {
      if (!["org_admin", "teacher", "student"].includes(role)) return fail(res, 400, "Invalid role.");
      m.role = role;
    }
    if (status !== undefined) {
      if (!["active", "inactive"].includes(status)) return fail(res, 400, "Invalid status.");
      m.status = status;
    }
    await m.save();
    await AdminAuditLog.create({ actorId: req.user._id, scope: "organization", organizationId: req.orgAdminOrg._id, action: "member.update", targetType: "OrganizationMembership", targetId: m._id, before, after: { role: m.role, status: m.status } });
    return res.json({ success: true, membership: { membershipId: m._id, role: m.role, status: m.status } });
  } catch (e) {
    console.error("updateOrgMember:", e.message);
    return fail(res, 500, "Could not update the member.");
  }
};


