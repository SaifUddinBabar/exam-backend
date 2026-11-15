import Organization from "../models/Organization.js";
import OrganizationMembership from "../models/OrganizationMembership.js";
import User from "../models/User.js";
import mongoose from "mongoose";

// Create Organization
export const createOrganization = async (req, res) => {
  try {
    const { name, slug, contactEmail, phone, location, plan } = req.body;

    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        message: "Organization name and unique slug are required.",
      });
    }

    const normalizedSlug = slug.trim().toLowerCase();
    const existing = await Organization.findOne({ slug: normalizedSlug });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "An organization with this slug already exists.",
      });
    }

    const orgCode = `ORG-${Math.floor(1000 + Math.random() * 9000)}`;

    const organization = await Organization.create({
      name: name.trim(),
      slug: normalizedSlug,
      code: orgCode,
      ownerId: req.user._id,
      contactEmail: contactEmail || req.user.email,
      phone: phone || "",
      location: location || "Dhaka",
      plan: plan || "free",
      status: "active",
    });

    // Automatically create admin membership for owner
    await OrganizationMembership.create({
      organizationId: organization._id,
      userId: req.user._id,
      role: "org_admin",
      status: "active",
    });

    return res.status(201).json({
      success: true,
      message: "Organization registered successfully.",
      organization,
    });
  } catch (error) {
    console.error("Create Organization Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create organization.",
    });
  }
};

// List Organizations (Super Admin, User Memberships, or Directory)
export const getOrganizations = async (req, res) => {
  try {
    let filter = { status: "active" };

    if (req.user?.globalRole === "super_admin") {
      filter = {};
    } else if (req.user) {
      // Find all memberships for current user
      const memberships = await OrganizationMembership.find({
        userId: req.user._id,
        status: "active",
      }).select("organizationId");
      const userOrgIds = memberships.map((m) => m.organizationId);

      filter = {
        $or: [
          { ownerId: req.user._id },
          { _id: { $in: userOrgIds } },
          { status: "active", "settings.allowPublicRegistration": true },
        ],
      };
    }

    const orgs = await Organization.find(filter).sort({ createdAt: -1 });
    return res.json({ success: true, organizations: orgs });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch organizations." });
  }
};

// Get Single Organization
export const getOrganization = async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    let org;

    if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
      org = await Organization.findById(idOrSlug);
    } else {
      org = await Organization.findOne({ slug: idOrSlug.toLowerCase() });
    }

    if (!org) {
      return res.status(404).json({ success: false, message: "Organization not found." });
    }

    // Public endpoint (no login): only what a sign-up/landing page needs. Contact details,
    // owner, plan, settings and the centre code stay private.
    const { _id, name, slug, logoUrl, status, settings } = org;
    return res.json({ success: true, organization: { _id, name, slug, logoUrl, status, brandColor: settings?.brandColor } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error fetching organization." });
  }
};

// Add Member to Organization
export const addMember = async (req, res) => {
  try {
    const { orgId } = req.params;
    const { email, role = "student", studentRoll, batchIds = [] } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "User email is required." });
    }

    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({ success: false, message: "Organization not found." });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found. They must register an account first.",
      });
    }

    const existingMembership = await OrganizationMembership.findOne({
      organizationId: org._id,
      userId: user._id,
    });

    if (existingMembership) {
      existingMembership.role = role;
      if (studentRoll) existingMembership.studentRoll = studentRoll;
      if (batchIds.length > 0) existingMembership.batchIds = batchIds;
      existingMembership.status = "active";
      await existingMembership.save();

      return res.json({
        success: true,
        message: "Member updated successfully.",
        membership: existingMembership,
      });
    }

    const membership = await OrganizationMembership.create({
      organizationId: org._id,
      userId: user._id,
      role,
      studentRoll: studentRoll || "",
      batchIds,
      status: "active",
    });

    return res.status(201).json({
      success: true,
      message: "Member added successfully.",
      membership,
    });
  } catch (error) {
    console.error("Add Member Error:", error);
    return res.status(500).json({ success: false, message: "Failed to add member." });
  }
};

// List Members of Organization
export const getMembers = async (req, res) => {
  try {
    const { orgId } = req.params;

    const members = await OrganizationMembership.find({ organizationId: orgId })
      .populate("userId", "name email role globalRole")
      .populate("batchIds", "name program academicYear")
      .sort({ createdAt: -1 });

    return res.json({ success: true, members });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch members." });
  }
};
