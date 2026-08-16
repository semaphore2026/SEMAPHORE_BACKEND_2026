const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

const protectAdmin = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(" ")[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get admin from token payload (excluding password)
      req.admin = await Admin.findById(decoded.id).select("-password");

      if (!req.admin) {
        return res.status(401).json({ message: "Admin not found or invalid token" });
      }

      next();
    } catch (error) {
      console.error("Admin Auth Error:", error.message);
      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token provided" });
  }
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
