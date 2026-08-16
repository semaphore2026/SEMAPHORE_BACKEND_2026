const express = require("express");
const router = express.Router();
const {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  updateCoordinators,
  updateTimings,
} = require("../controllers/eventController");
const { protect } = require("../middleware/authMiddleware");
const { upload } = require("../config/cloudinary");

// Public routes
router.get("/", getEvents);
router.get("/:id", getEventById);

// Protected routes
router.post("/", protect, upload.single("image"), createEvent);
router.put("/:id", protect, upload.single("image"), updateEvent);
router.patch("/:id", protect, upload.single("image"), updateEvent);
router.patch("/:id/coordinators", protect, updateCoordinators);
router.patch("/:id/timings", protect, updateTimings);
router.delete("/:id", protect, deleteEvent);

module.exports = router;
