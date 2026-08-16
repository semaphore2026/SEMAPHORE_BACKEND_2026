const express = require("express");
const router = express.Router();
const {
  loginAdmin,
  addAdmin,
  makeAdmin,
  getAdminProfile,
  getAllAdmins,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
} = require("../controllers/adminController");
const {
  protectAdmin,
  superadminOnly,
} = require("../middleware/adminAuthMiddleware");

// Public route
router.post("/login", loginAdmin);

// Protected routes (Requires valid Admin JWT token)
router.post("/addadmins", protectAdmin, addAdmin);
router.post("/addadmin", protectAdmin, addAdmin); // Alias

// Protected routes (Superadmin ONLY - change roles)
router.put("/makeadmin", protectAdmin, superadminOnly, makeAdmin);
router.patch("/makeadmin", protectAdmin, superadminOnly, makeAdmin); // Alias
router.post("/makeadmin", protectAdmin, superadminOnly, makeAdmin); // Alias

// Admin profile & list routes
router.get("/me", protectAdmin, getAdminProfile);
router.get("/all", protectAdmin, superadminOnly, getAllAdmins);

// ================= USER MANAGEMENT ROUTES =================
// (Requires valid Admin or Superadmin JWT)
router.get("/users", protectAdmin, getAllUsers);
router.get("/users/:id", protectAdmin, getUserById);
router.put("/users/:id", protectAdmin, updateUser);
router.patch("/users/:id", protectAdmin, updateUser); // Alias
router.delete("/users/:id", protectAdmin, deleteUser);

module.exports = router;
