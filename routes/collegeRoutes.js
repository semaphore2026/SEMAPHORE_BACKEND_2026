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
router.put("/:id", updateCollege);

module.exports = router;
