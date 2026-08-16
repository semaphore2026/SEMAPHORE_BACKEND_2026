const express = require("express");
const router = express.Router();
const {
  createTimetableSlot,
  getTimetable,
  updateTimetableSlot,
  deleteTimetableSlot,
} = require("../controllers/timetableController");
const { protect, adminOnly } = require("../middleware/authMiddleware");

// Public route
router.get("/", getTimetable);

// Protected (Admin) routes
router.post("/", protect, adminOnly, createTimetableSlot);
router.put("/:id", protect, adminOnly, updateTimetableSlot);
router.delete("/:id", protect, adminOnly, deleteTimetableSlot);

module.exports = router;
