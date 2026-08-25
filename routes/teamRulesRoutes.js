const express = require("express");
const router = express.Router();
const {
  getTeamRules,
  getAllTeamRules,
  createTeamRules,
  updateTeamRules,
  deleteTeamRules,
} = require("../controllers/teamRulesController");
const { protectAdmin } = require("../middleware/adminAuthMiddleware");

// ================= PUBLIC ROUTES =================
// Anyone can view the team rules
router.get("/", getTeamRules);

// ================= ADMIN PROTECTED ROUTES =================
// Admin can view all rule sets
router.get("/all", protectAdmin, getAllTeamRules);

// Admin can create a new team rules document
router.post("/", protectAdmin, createTeamRules);

// Admin can update team rules (with ID or root PUT for latest)
router.put("/", protectAdmin, updateTeamRules);
router.put("/:id", protectAdmin, updateTeamRules);
router.patch("/:id", protectAdmin, updateTeamRules);

// Admin can delete a team rules document
router.delete("/:id", protectAdmin, deleteTeamRules);

module.exports = router;
