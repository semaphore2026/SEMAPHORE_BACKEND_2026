const express = require("express");
const router = express.Router();
const {
  addCollege,
  getColleges,
  getCollegeById,
  updateCollege,
} = require("../controllers/collegeController");

// Endpoints
router.post("/", addCollege);
router.get("/", getColleges);
router.get("/:id", getCollegeById);
router.get("/:id/details", getCollegeById); // Alias for full events & payments
router.get("/:id/events", getCollegeById); // Alias
router.get("/:id/payments", getCollegeById); // Alias
router.put("/:id", updateCollege);

module.exports = router;
