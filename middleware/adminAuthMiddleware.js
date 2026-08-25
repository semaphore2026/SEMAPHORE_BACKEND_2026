const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

const User = require("../models/User");

const protectAdmin = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.headers.authorization) {
    token = req.headers.authorization.trim();
  } else if (req.query && req.query.token) {
    token = String(req.query.token).trim();
  }

  if (token) {
    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check Admin model first
      const admin = await Admin.findById(decoded.id).select("-password");
      if (admin) {
        req.admin = admin;
        req.user = { _id: admin._id, role: admin.role, name: admin.name, email: admin.email };
        return next();
      }

      // Check User model with role 'admin'
      const user = await User.findById(decoded.id).select("-password");
      if (user && user.role === "admin") {
        req.user = user;
        req.admin = { _id: user._id, role: "admin", name: user.name, email: user.email };
        return next();
      }

      return res
        .status(403)
        .json({ message: "Access denied. Admin role required." });
    } catch (error) {
      console.error("Admin Auth Error:", error.message);
      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  }

  return res.status(401).json({ message: "Not authorized, no token provided" });
};

const superadminOnly = (req, res, next) => {
  if (req.admin && req.admin.role === "superadmin") {
    next();
  } else {
    return res
      .status(403)
      .json({ message: "Access denied. Superadmin role required." });
  }
};

module.exports = { protectAdmin, superadminOnly };
