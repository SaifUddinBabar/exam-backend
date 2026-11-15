import { rateLimit } from "../middleware/rateLimit.js";
import express from "express";
import {
  createInvitation,
  verifyInvitation,
  acceptInvitation,
  listInvitations,
  revokeInvitation,
} from "../controllers/invitationController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

// Public: check code
router.get("/verify/:code", rateLimit({ windowMs: 15 * 60_000, max: 30, key: "invite-verify", by: "ip" }), verifyInvitation);

// Protected: accept invitation
router.post("/accept", protect, acceptInvitation);

// Org Admin / Super Admin protected
router.post("/create", protect, authorize("super_admin", "org_admin"), createInvitation);
router.get("/list/:orgId", protect, authorize("super_admin", "org_admin"), listInvitations);
router.delete("/:id", protect, authorize("super_admin", "org_admin"), revokeInvitation);

export default router;
