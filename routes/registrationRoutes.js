const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const User = require("../models/User");
const {
  addEventsToRegistration,
  getUserRegistrations,
  makePayment,
  updatePaymentStatus,
  getAllRegistrations,
} = require("../controllers/registrationController");
const { protect } = require("../middleware/authMiddleware");
const { upload } = require("../config/cloudinary");

// Combined middleware allowing both User (role: admin) and Admin model tokens
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

// User Protected Routes (Requires User JWT header)
router.post("/events", protect, addEventsToRegistration);
router.post("/add", protect, addEventsToRegistration); // Alias route

router.get("/", protect, getUserRegistrations);
router.get("/me", protect, getUserRegistrations); // Alias route

router.post("/payment", protect, upload.any(), makePayment);
router.post("/pay", protect, upload.any(), makePayment); // Alias route

// Admin Protected Routes (Requires Admin JWT header)
router.put("/:id/payment-status", protectAnyAdmin, updatePaymentStatus);
router.patch("/:id/payment-status", protectAnyAdmin, updatePaymentStatus);
router.put("/payment-status/:id", protectAnyAdmin, updatePaymentStatus);
router.patch("/payment-status/:id", protectAnyAdmin, updatePaymentStatus);

router.get("/all", protectAnyAdmin, getAllRegistrations);

module.exports = router;
