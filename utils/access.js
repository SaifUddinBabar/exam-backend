// Central authorization helpers shared by every controller.
// All visibility rules for exams, notices and batches live here so the
// student dashboard, exam list, exam start and submit endpoints agree.
import mongoose from "mongoose";
import BatchMembership from "../models/BatchMembership.js";

const STAFF_ROLES = new Set(["tutor", "teacher", "org_admin", "super_admin"]);

export const isSuperAdmin = (user) => user?.globalRole === "super_admin" || user?.role === "super_admin";

export const isStaff = (user) => Boolean(user) && (isSuperAdmin(user) || STAFF_ROLES.has(user.role));

export const isStudent = (user) => Boolean(user) && !isStaff(user);

export const toId = (v) => {
  if (!v) return null;
  if (v instanceof mongoose.Types.ObjectId) return v;
  if (typeof v === "object" && v._id) return toId(v._id);
  return mongoose.Types.ObjectId.isValid(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null;
};

export const sameId = (a, b) => Boolean(a) && Boolean(b) && String(a._id || a) === String(b._id || b);

/** Active batch ids the student belongs to. */
export async function getStudentBatchIds(studentId) {
  const rows = await BatchMembership.find({ studentId, status: "active" }).select("batchId").lean();
  return rows.map((r) => r.batchId);
}

/**
 * Mongo filter matching every exam a student is allowed to see.
 * - assignment.mode "all"       → every student
 * - assignment.mode "batches"   → members of one of assignment.batchIds
 * - assignment.mode "students"  → listed students
 * - legacy exams (no assignment) authored by a teacher stay visible to all
 *   students, preserving pre-batch behaviour. Legacy exams with no author
 *   (seeded) are also treated as legacy-global until the owner reviews them.
 */
export async function studentExamFilter(user) {
  const batchIds = await getStudentBatchIds(user._id);
  return {
    isPublished: { $ne: false },
    archivedAt: null,
    $or: [
      { "assignment.mode": "all" },
      { "assignment.mode": "batches", "assignment.batchIds": { $in: batchIds } },
      { "assignment.mode": "students", "assignment.studentIds": user._id },
      { "assignment.mode": { $exists: false } },
      { assignment: null },
    ],
  };
}

/** True when the student may open / take this exam. */
export async function canStudentAccessExam(user, exam) {
  if (!user || !exam) return false;
  if (isStaff(user)) return true; // staff may preview; edits are checked by canStaffManageExam
  if (exam.isPublished === false || exam.archivedAt) return false;
  const a = exam.assignment;
  if (!a || !a.mode || a.mode === "all") return true;
  if (a.mode === "students") return (a.studentIds || []).some((id) => sameId(id, user._id));
  if (a.mode === "batches") {
    const batchIds = (await getStudentBatchIds(user._id)).map(String);
    return (a.batchIds || []).some((id) => batchIds.includes(String(id)));
  }
  return false;
}

/** Teacher owns the exam, or is org admin of its org, or super admin. */
export function canStaffManageExam(user, exam, tenant) {
  if (!user || !exam) return false;
  if (isSuperAdmin(user)) return true;
  if (exam.authorId && sameId(exam.authorId, user._id)) return true;
  if (tenant?.role === "org_admin" && exam.organizationId && sameId(exam.organizationId, tenant.orgId)) return true;
  return false;
}

/** Mongo filter for notices a student is allowed to see right now. */
export async function studentNoticeFilter(user, now = new Date()) {
  const batchIds = await getStudentBatchIds(user._id);
  return {
    archivedAt: null,
    publishAt: { $lte: now },
    $and: [
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
      {
        $or: [
          { "audience.all": true },
          { "audience.batchIds": { $in: batchIds } },
          { "audience.studentIds": user._id },
        ],
      },
    ],
  };
}
