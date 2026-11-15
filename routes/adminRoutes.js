import express from "express";
import {
  platformOverview,
  listUsers,
  updateUser,
  listOrganizations,
  updateOrganization,
  auditLog,
  requireOrgAdmin,
  orgOverview,
  orgMembers,
  updateOrgMember,
} from "../controllers/adminController.js";
import { protect, authorize } from "../middleware/auth.js";

// Super admin only. authorize("super_admin") passes only globalRole/role super_admin.
export const adminRouter = express.Router();
const superAdmin = authorize("super_admin");
adminRouter.get("/overview", protect, superAdmin, platformOverview);
adminRouter.get("/users", protect, superAdmin, listUsers);
adminRouter.patch("/users/:id", protect, superAdmin, updateUser);
adminRouter.get("/organizations", protect, superAdmin, listOrganizations);
adminRouter.patch("/organizations/:id", protect, superAdmin, updateOrganization);
adminRouter.get("/audit-log", protect, superAdmin, auditLog);

// Organization admin (membership role org_admin, or the organization owner).
export const orgPortalRouter = express.Router();
orgPortalRouter.get("/overview", protect, requireOrgAdmin, orgOverview);
orgPortalRouter.get("/members", protect, requireOrgAdmin, orgMembers);
orgPortalRouter.patch("/members/:membershipId", protect, requireOrgAdmin, updateOrgMember);
orgPortalRouter.get("/audit-log", protect, requireOrgAdmin, auditLog);
