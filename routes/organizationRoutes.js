import express from "express";
import {
  createOrganization,
  getOrganizations,
  getOrganization,
  addMember,
  getMembers,
} from "../controllers/organizationController.js";
import { protect, authorize } from "../middleware/auth.js";
import { resolveTenantContext, requireTenantMembership } from "../middleware/tenantContext.js";

const router = express.Router();

router.get("/", protect, getOrganizations);
router.post("/", protect, createOrganization);
router.get("/:idOrSlug", resolveTenantContext, getOrganization);

// Organization member management
router.get("/:orgId/members", protect, resolveTenantContext, requireTenantMembership(["org_admin", "super_admin"]), getMembers);
router.post("/:orgId/members", protect, resolveTenantContext, requireTenantMembership(["org_admin", "super_admin"]), addMember);

export default router;
