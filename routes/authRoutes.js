const express = require("express");
const router = express.Router();
const {
  registerUser,
  loginUser,
  googleAuth,
  getUserProfile,
  verifyUser,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

// Public routes
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/google", googleAuth);

// Protected routes
router.get("/me", protect, getUserProfile);
router.get("/verifyuser", protect, verifyUser);
router.get("/verifyUser", protect, verifyUser);
router.get("/verify-user", protect, verifyUser);

module.exports = router;

