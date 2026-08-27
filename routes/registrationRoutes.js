const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const User = require("../models/User");
const {
  addEventsToRegistration,
  getUserRegistrations,
  makePayment,
  getAllRegistrations,
  getPendingPayments,
  getApprovedPayments,
  getRegistrationStats,
  getTotalUsers,
  getTotalTeams,
  checkUserPaymentStatus,
} = require("../controllers/registrationController");
const {
  updatePaymentStatusWithMessage,
  deletePayment,
  getBackupPayments,
  getBackupPaymentDetails,
} = require("../controllers/adminController");
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
router.post("/register", protect, addEventsToRegistration); // Alias route

router.get("/", protect, getUserRegistrations);
router.get("/me", protect, getUserRegistrations); // Alias route
router.get("/my-events", protect, getUserRegistrations); // Alias route
router.get("/user", protect, getUserRegistrations); // Alias route

router.post("/payment", protect, upload.any(), makePayment);
router.post("/pay", protect, upload.any(), makePayment); // Alias route

// Check if user has an approved payment
router.get("/is-payment-done", protect, checkUserPaymentStatus);
router.get("/payment-status", protect, checkUserPaymentStatus); // Alias route
router.get("/is-payment-approved", protect, checkUserPaymentStatus); // Alias route
router.get("/check-payment", protect, checkUserPaymentStatus); // Alias route
router.get("/payment/is-done", protect, checkUserPaymentStatus); // Alias route


// Admin Payment & Registration Analytics Routes (Requires Admin JWT header)
router.get("/total-users", protectAnyAdmin, getTotalUsers);
router.get("/total-teams", protectAnyAdmin, getTotalTeams);
router.get("/stats", protectAnyAdmin, getRegistrationStats);
router.get("/payments/pending", protectAnyAdmin, getPendingPayments);
router.get("/payments/approved", protectAnyAdmin, getApprovedPayments);

// Backup Payments Routes (Read-Only)
router.get("/payments/backups", protectAnyAdmin, getBackupPayments);
router.get("/payments/backups/:backupId", protectAnyAdmin, getBackupPaymentDetails);
router.get("/payment/backups/:backupId", protectAnyAdmin, getBackupPaymentDetails);

// Admin Protected Routes (Requires Admin JWT header)
router.put("/:id/payment-status", protectAnyAdmin, updatePaymentStatusWithMessage);
router.patch("/:id/payment-status", protectAnyAdmin, updatePaymentStatusWithMessage);
router.put("/payment-status/:id", protectAnyAdmin, updatePaymentStatusWithMessage);
router.patch("/payment-status/:id", protectAnyAdmin, updatePaymentStatusWithMessage);

router.delete("/payments/:paymentId", protectAnyAdmin, deletePayment);
router.delete("/payment/:paymentId", protectAnyAdmin, deletePayment);
router.delete("/payment-status/:id", protectAnyAdmin, deletePayment);

router.get("/all", protectAnyAdmin, getAllRegistrations);

module.exports = router;
