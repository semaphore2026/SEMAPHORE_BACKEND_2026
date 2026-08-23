const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Admin = require("../models/Admin");

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.headers.authorization) {
    token = req.headers.authorization.trim();
  }

  if (token) {
    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from token payload (excluding password)
      let user = await User.findById(decoded.id).select("-password");

      if (!user) {
        // Fallback check in Admin model
        const admin = await Admin.findById(decoded.id).select("-password");
        if (admin) {
          user = {
            _id: admin._id,
            name: admin.name,
            email: admin.email,
            role: admin.role || "admin",
          };
        }
      }

      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      req.user = user;
      return next();
    } catch (error) {
      console.error("Auth Middleware Error:", error.message);
      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  }

  return res.status(401).json({ message: "Not authorized, no token provided" });
};

const adminOnly = (req, res, next) => {
  if ((req.user && req.user.role === "admin") || req.admin) {
    next();
  } else {
    res.status(403).json({ message: "Access denied. Admin role required." });
  }
};

const protectAnyAdmin = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const admin = await Admin.findById(decoded.id).select("-password");
      if (admin) {
        req.admin = admin;
        req.user = { _id: admin._id, role: "admin", name: admin.name, email: admin.email };
        return next();
      }

      const user = await User.findById(decoded.id).select("-password");
      if (user && user.role === "admin") {
        req.user = user;
        return next();
      }

      return res
        .status(403)
        .json({ message: "Access denied. Admin role required." });
    } catch (error) {
      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  }

  return res.status(401).json({ message: "Not authorized, no token provided" });
};

module.exports = { protect, adminOnly, protectAnyAdmin };
