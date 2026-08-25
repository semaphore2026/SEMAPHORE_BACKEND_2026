const express = require("express");
const router = express.Router();
const {
  addCollege,
  getColleges,
  getCollegeById,
  updateCollege,
  deleteCollege,
} = require("../controllers/collegeController");
const { protectAdmin } = require("../middleware/adminAuthMiddleware");

// Endpoints
router.post("/", addCollege);
router.get("/", getColleges);
router.get("/:id", getCollegeById);
router.get("/:id/details", getCollegeById); // Alias for full events & payments
router.get("/:id/events", getCollegeById); // Alias
router.get("/:id/payments", getCollegeById); // Alias
router.put("/:id", updateCollege);
router.delete("/:id", protectAdmin, deleteCollege);

module.exports = router;
