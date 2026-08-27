const express = require("express");
const router = express.Router();
const {
  getAllowedColleges,
  addAllowedCollege,
  updateAllowedCollege,
  deleteAllowedCollege,
  updateCollegeConfig,
} = require("../controllers/allowedCollegeController");

// Endpoints
router.get("/", getAllowedColleges);
router.post("/", addAllowedCollege);
router.put("/config", updateCollegeConfig);
router.put("/:id", updateAllowedCollege);
router.delete("/:id", deleteAllowedCollege);

module.exports = router;
