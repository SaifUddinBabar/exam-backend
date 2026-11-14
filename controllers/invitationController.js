import crypto from "crypto";
import Invitation from "../models/Invitation.js";
import Organization from "../models/Organization.js";
import OrganizationMembership from "../models/OrganizationMembership.js";

// ============================================================================
// 1. CREATE INVITATION (Org Admin only)
// ============================================================================
export const createInvitation = async (req, res) => {
  try {
    const { organizationId, role = "student", recipientPhone, recipientEmail, maxUses = 1, expiryDays = 7 } = req.body;

    if (!organizationId) {
      return res.status(400).json({ success: false, message: "Organization ID is required." });
    }

    if (!["teacher", "student"].includes(role)) {
      return res.status(400).json({ success: false, message: "Role must be 'teacher' or 'student'." });
    }

    const org = await Organization.findById(organizationId);
    if (!org) {
      return res.status(404).json({ success: false, message: "Organization not found." });
    }

    // Verify caller is org_admin of this organization or super_admin
    if (req.user.globalRole !== "super_admin") {
      const isOwner = org.ownerId.toString() === req.user._id.toString();
      const membership = await OrganizationMembership.findOne({
        organizationId: org._id,
        userId: req.user._id,
        role: "org_admin",
        status: "active",
      });

      if (!isOwner && !membership) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: Only organization admins can generate invitations.",
        });
      }
    }

    // Generate unique code: INV-XXXX-XXXX
    const randomHex = crypto.randomBytes(3).toString("hex").toUpperCase();
    const inviteCode = `INV-${org.code || "EXM"}-${randomHex}`;

    const days = Math.max(1, Math.min(30, parseInt(expiryDays) || 7));
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const invitation = await Invitation.create({
      organizationId: org._id,
      invitedBy: req.user._id,
      role,
      inviteCode,
      recipientPhone: recipientPhone || "",
      recipientEmail: recipientEmail || "",
      maxUses: Math.max(1, parseInt(maxUses) || 1),
      expiresAt,
      status: "active",
    });

    return res.status(201).json({
      success: true,
      message: `Invitation generated for ${role}.`,
      invitation,
      inviteCode,
    });
  } catch (error) {
    console.error("Create Invitation Error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate invitation." });
  }
};

// ============================================================================
// 2. VERIFY INVITATION CODE (Public)
// ============================================================================
export const verifyInvitation = async (req, res) => {
  try {
    const { code } = req.params;
    if (!code) {
      return res.status(400).json({ success: false, message: "Invitation code required." });
    }

    const invite = await Invitation.findOne({ inviteCode: code.trim().toUpperCase() })
      .populate("organizationId", "name slug code logoUrl status")
      .populate("invitedBy", "name email");

    if (!invite) {
      return res.status(404).json({ success: false, message: "Invalid invitation code." });
    }

    if (invite.status !== "active") {
      return res.status(400).json({ success: false, message: `This invitation is ${invite.status}.` });
    }

    if (new Date() > invite.expiresAt) {
      invite.status = "expired";
      await invite.save();
      return res.status(400).json({ success: false, message: "This invitation has expired." });
    }

    if (invite.usedCount >= invite.maxUses) {
      invite.status = "expired";
      await invite.save();
      return res.status(400).json({ success: false, message: "This invitation has reached its usage limit." });
    }

    return res.json({
      success: true,
      valid: true,
      invitation: {
        code: invite.inviteCode,
        role: invite.role,
        organization: invite.organizationId,
        invitedBy: invite.invitedBy?.name || "Organization Administrator",
        expiresAt: invite.expiresAt,
      },
    });
  } catch (error) {
    console.error("Verify Invitation Error:", error);
    return res.status(500).json({ success: false, message: "Error verifying invitation." });
  }
};

// ============================================================================
// 3. ACCEPT INVITATION (Authenticated User)
// ============================================================================
export const acceptInvitation = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: "Invitation code required." });
    }

    const invite = await Invitation.findOne({ inviteCode: code.trim().toUpperCase() })
      .populate("organizationId", "name slug code");

    if (!invite) {
      return res.status(404).json({ success: false, message: "Invalid invitation code." });
    }

    if (invite.status !== "active" || new Date() > invite.expiresAt || invite.usedCount >= invite.maxUses) {
      return res.status(400).json({ success: false, message: "This invitation is no longer active or has expired." });
    }

    const org = invite.organizationId;

    // Check if user is already a member
    const existingMembership = await OrganizationMembership.findOne({
      organizationId: org._id,
      userId: req.user._id,
    });

    if (existingMembership) {
      if (existingMembership.status === "active") {
        return res.status(409).json({
          success: false,
          message: `You are already an active member of ${org.name} as a ${existingMembership.role}.`,
        });
      }
      existingMembership.status = "active";
      existingMembership.role = invite.role;
      await existingMembership.save();
    } else {
      await OrganizationMembership.create({
        organizationId: org._id,
        userId: req.user._id,
        role: invite.role,
        status: "active",
      });
    }

    // Update invitation usage
    invite.usedCount += 1;
    if (invite.usedCount >= invite.maxUses) {
      invite.status = "expired";
    }
    await invite.save();

    return res.json({
      success: true,
      message: `You have successfully joined ${org.name} as a ${invite.role}.`,
      organization: org,
      role: invite.role,
    });
  } catch (error) {
    console.error("Accept Invitation Error:", error);
    return res.status(500).json({ success: false, message: "Failed to accept invitation." });
  }
};

// ============================================================================
// 4. LIST INVITATIONS FOR ORGANIZATION (Org Admin)
// ============================================================================
export const listInvitations = async (req, res) => {
  try {
    const { orgId } = req.params;

    const invitations = await Invitation.find({ organizationId: orgId })
      .populate("invitedBy", "name email")
      .sort({ createdAt: -1 });

    return res.json({ success: true, invitations });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to list invitations." });
  }
};

// ============================================================================
// 5. REVOKE INVITATION (Org Admin)
// ============================================================================
export const revokeInvitation = async (req, res) => {
  try {
    const { id } = req.params;

    const invite = await Invitation.findById(id);
    if (!invite) {
      return res.status(404).json({ success: false, message: "Invitation not found." });
    }

    invite.status = "revoked";
    await invite.save();

    return res.json({ success: true, message: "Invitation revoked successfully." });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to revoke invitation." });
  }
};
