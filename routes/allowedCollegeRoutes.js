const express = require("express");
const router = express.Router();
const {
  getAllowedColleges,
  checkCollegeAvailability,
  addAllowedCollege,
  updateAllowedCollege,
  deleteAllowedCollege,
  updateCollegeConfig,
} = require("../controllers/allowedCollegeController");

// Public — check if a college has slots available (call this before registration)
router.get("/check/:collegeName", checkCollegeAvailability);

// CRUD
router.get("/", getAllowedColleges);
router.post("/", addAllowedCollege);
router.put("/config", updateCollegeConfig);
router.put("/:id", updateAllowedCollege);
router.delete("/:id", deleteAllowedCollege);

module.exports = router;
