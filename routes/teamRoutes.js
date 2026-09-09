const express = require("express");
const router = express.Router();
const { setTeam, getMyTeam, deleteTeam } = require("../controllers/teamController");
const { protect } = require("../middleware/authMiddleware");

// Protected User Routes (Header Authorization Required)
router.post("/set-team", protect, setTeam);
router.post("/setteam", protect, setTeam); // Alias
router.post("/", protect, setTeam); // Alias

router.get("/me", protect, getMyTeam);
router.get("/my-team", protect, getMyTeam); // Alias

router.delete("/me", protect, deleteTeam);
router.delete("/delete-team", protect, deleteTeam); // Alias
router.delete("/deleteteam", protect, deleteTeam); // Alias
router.delete("/", protect, deleteTeam); // Alias
router.delete("/:id", protect, deleteTeam); // Alias by ID

module.exports = router;

