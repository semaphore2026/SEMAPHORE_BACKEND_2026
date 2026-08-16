const express = require("express");
const router = express.Router();
const {
  loginAdmin,
  addAdmin,
  makeAdmin,
  getAdminProfile,
  getAllAdmins,
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

// Additional helper routes
router.get("/me", protectAdmin, getAdminProfile);
router.get("/all", protectAdmin, superadminOnly, getAllAdmins);

module.exports = router;
