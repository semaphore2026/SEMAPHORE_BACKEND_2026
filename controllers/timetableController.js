const Timetable = require("../models/Timetable");
const Event = require("../models/Event");

// Helper to handle errors
const handleError = (res, error) => {
  if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors).map(val => val.message);
    return res.status(400).json({ success: false, message: messages[0] });
  }
  if (error.name === 'CastError') {
    return res.status(400).json({ success: false, message: "Invalid ID" });
  }
  res.status(500).json({ success: false, message: error.message });
};

// @desc    Create a timetable slot
// @route   POST /api/timetable
// @access  Private (Admin)
const createTimetableSlot = async (req, res) => {
  try {
    const { date, startTime, endTime, event, location } = req.body;

    if (!date || !startTime || !endTime || !event) {
      return res.status(400).json({ success: false, message: "Date, startTime, endTime, and event are required" });
    }

    if (startTime >= endTime) {
      return res.status(400).json({ success: false, message: "Start time must be before end time" });
    }

    // Verify event exists
    const eventExists = await Event.findById(event);
    if (!eventExists) {
      return res.status(404).json({ success: false, message: "Associated Event not found" });
    }

    const timetableSlot = await Timetable.create({
      date,
      startTime,
      endTime,
      event,
      location,
    });

    res.status(201).json({
      success: true,
      message: "Timetable slot created successfully",
      timetableSlot,
    });
  } catch (error) {
    handleError(res, error);
  }
};

// @desc    Get all timetable slots
// @route   GET /api/timetable
// @access  Public
const getTimetable = async (req, res) => {
  try {
    const { date } = req.query;
    
    let query = {};
    if (date) query.date = date;

    const timetable = await Timetable.find(query)
      .populate("event", "title location image") // Populate basic event details
      .sort({ date: 1, startTime: 1 });

    res.json({
      success: true,
      timetable,
    });
  } catch (error) {
    handleError(res, error);
  }
};

// @desc    Update a timetable slot
// @route   PUT /api/timetable/:id
// @access  Private (Admin)
const updateTimetableSlot = async (req, res) => {
  try {
    const { startTime, endTime } = req.body;
    
    if (startTime && endTime && startTime >= endTime) {
       return res.status(400).json({ success: false, message: "Start time must be before end time" });
    }

    const slot = await Timetable.findById(req.params.id);

    if (!slot) {
      return res.status(404).json({ success: false, message: "Timetable slot not found" });
    }
    
    if (req.body.event) {
      const eventExists = await Event.findById(req.body.event);
      if (!eventExists) {
        return res.status(404).json({ success: false, message: "Associated Event not found" });
      }
    }

    const updatedSlot = await Timetable.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate("event", "title location image");

    res.json({
      success: true,
      message: "Timetable slot updated successfully",
      timetableSlot: updatedSlot,
    });
  } catch (error) {
    handleError(res, error);
  }
};

// @desc    Delete a timetable slot
// @route   DELETE /api/timetable/:id
// @access  Private (Admin)
const deleteTimetableSlot = async (req, res) => {
  try {
    const slot = await Timetable.findById(req.params.id);

    if (!slot) {
      return res.status(404).json({ success: false, message: "Timetable slot not found" });
    }

    await slot.deleteOne();

    res.json({ success: true, message: "Timetable slot deleted successfully" });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  createTimetableSlot,
  getTimetable,
  updateTimetableSlot,
  deleteTimetableSlot,
};
