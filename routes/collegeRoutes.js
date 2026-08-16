const express = require("express");
const router = express.Router();
const {
  addCollege,
  registerTeamForCollege,
  getColleges,
  getCollegeById,
  updateCollege,
} = require("../controllers/collegeController");

// Public endpoints
router.post("/", addCollege);
router.post("/:id/register-team", registerTeamForCollege);
router.get("/", getColleges);
router.get("/:id", getCollegeById);
router.put("/:id", updateCollege);

module.exports = router;
