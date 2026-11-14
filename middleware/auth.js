import jwt from "jsonwebtoken";
import config from "../config/env.js";
import User from "../models/User.js";
import OrganizationMembership from "../models/OrganizationMembership.js";

/**
 * Validates JWT Bearer Token, loads authenticated user, and checks isActive.
 */
export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication token required. Please sign in.",
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await User.findById(decoded.id).select("-passwordHash -password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account no longer exists.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "User account is suspended.",
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};

// Alias requested in specifications
export const authenticate = protect;

/**
 * Optional authentication: decodes user if token exists, proceeds regardless.
 */
export const optionalAuth = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await User.findById(decoded.id).select("-passwordHash -password");
    req.user = user && user.isActive ? user : null;
    next();
  } catch {
    req.user = null;
    next();
  }
};

/**
 * Enforces specific role authorization (checks both globalRole and role).
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Authentication required.",
      });
    }

    // Super admin always bypasses standard role restrictions
    if (req.user.globalRole === "super_admin") {
      return next();
    }

    const userRoles = [req.user.globalRole, req.user.role].filter(Boolean);
    
    // Normalize aliases: "teacher" and "tutor" are interchangeable
    const normalizedRoles = roles.map((r) => (r === "teacher" ? "tutor" : r));
    const normalizedUserRoles = userRoles.map((r) => (r === "teacher" ? "tutor" : r));

    const hasRole = normalizedRoles.some((r) => normalizedUserRoles.includes(r));

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Access restricted to roles: ${roles.join(", ")}`,
      });
    }

    next();
  };
};

// Reusable middleware alias
export const requireRole = authorize;

/**
 * Enforces organization membership for tenant-scoped operations.
 */
export const requireOrganizationMembership = (allowedRoles = []) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (req.user.globalRole === "super_admin") {
      return next();
    }

    const orgId = req.tenant?.orgId || req.params.orgId || req.body?.organizationId || req.headers["x-organization-id"];

    if (!orgId) {
      return res.status(400).json({
        success: false,
        message: "Organization context required.",
      });
    }

    try {
      const membership = await OrganizationMembership.findOne({
        organizationId: orgId,
        userId: req.user._id,
        status: "active",
      });

      if (!membership) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: You are not a member of this organization.",
        });
      }

      if (allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
        return res.status(403).json({
          success: false,
          message: `Forbidden: Requires organization role: ${allowedRoles.join(", ")}`,
        });
      }

      req.membership = membership;
      next();
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Failed to verify organization membership.",
      });
    }
  };
};

/**
 * Enforces that a teacher owns the target resource (or is organization admin/super_admin).
 */
export const requireTeacherOwnership = (authorField = "authorId") => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    if (req.user.globalRole === "super_admin") {
      return next();
    }

    const targetAuthor = req.resource?.[authorField] || req.body?.[authorField];
    if (targetAuthor && targetAuthor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not own this resource.",
      });
    }

    next();
  };
};
