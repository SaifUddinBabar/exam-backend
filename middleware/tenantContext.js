import Organization from "../models/Organization.js";
import OrganizationMembership from "../models/OrganizationMembership.js";
import mongoose from "mongoose";

export const resolveTenantContext = async (req, res, next) => {
  const tenantIdentifier =
    req.headers["x-tenant-id"] ||
    req.headers["x-organization-id"] ||
    req.query.tenantId ||
    req.query.orgSlug ||
    req.params.orgId;

  if (!tenantIdentifier) {
    req.tenant = null; // Public / global ecosystem
    return next();
  }

  try {
    let org;
    if (mongoose.Types.ObjectId.isValid(tenantIdentifier)) {
      org = await Organization.findById(tenantIdentifier);
    } else {
      org = await Organization.findOne({
        $or: [
          { slug: tenantIdentifier.toLowerCase() },
          { code: tenantIdentifier.toUpperCase() },
        ],
      });
    }

    if (!org) {
      return res.status(404).json({
        success: false,
        message: "Organization not found.",
      });
    }

    if (org.status !== "active") {
      return res.status(403).json({
        success: false,
        message: `Organization access is ${org.status}. Please contact administrator.`,
      });
    }

    let role = null;
    let membership = null;

    if (req.user) {
      if (req.user.globalRole === "super_admin") {
        role = "super_admin";
      } else {
        membership = await OrganizationMembership.findOne({
          organizationId: org._id,
          userId: req.user._id,
          status: "active",
        });

        if (membership) {
          role = membership.role;
        }
      }
    }

    req.tenant = {
      organization: org,
      orgId: org._id,
      role,
      membership,
    };

    next();
  } catch (error) {
    console.error("Tenant Context Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to resolve tenant context.",
    });
  }
};

export const requireTenantMembership = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.tenant || !req.tenant.orgId) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Organization context required for this action.",
      });
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (req.user.globalRole === "super_admin") {
      return next();
    }

    if (!req.tenant.role) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this organization.",
      });
    }

    if (
      allowedRoles.length > 0 &&
      !allowedRoles.includes(req.tenant.role)
    ) {
      return res.status(403).json({
        success: false,
        message: `Restricted to roles: ${allowedRoles.join(", ")}`,
      });
    }

    next();
  };
};
