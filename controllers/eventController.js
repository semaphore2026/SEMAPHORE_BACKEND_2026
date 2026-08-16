const Event = require("../models/Event");
const User = require("../models/User");
const Timetable = require("../models/Timetable");

// Helper to handle standard errors
const handleError = (res, error) => {
  if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors).map(val => val.message);
    return res.status(400).json({ success: false, message: messages[0] });
  }
  if (error.name === 'CastError') {
    return res.status(400).json({ success: false, message: "Invalid event ID" });
  }
  res.status(500).json({ success: false, message: error.message });
};

// @desc    Create a new event
// @route   POST /api/events
// @access  Private
const createEvent = async (req, res) => {
  try {
    const { title, description, location, date, capacity, registrationFee, image, coordinators, timings } = req.body;

    if (!title) return res.status(400).json({ success: false, message: "Event title is required" });
    if (!description) return res.status(400).json({ success: false, message: "Event description is required" });
    if (!location) return res.status(400).json({ success: false, message: "Event location is required" });
    if (!date) return res.status(400).json({ success: false, message: "Event date is required" });

    // Validate timings before creation
    if (timings && Array.isArray(timings)) {
      for (let timing of timings) {
        if (!timing.date || !timing.startTime || !timing.endTime) {
          return res.status(400).json({ success: false, message: "Date, startTime, and endTime are required for each timing" });
        }
        if (timing.startTime >= timing.endTime) {
          return res.status(400).json({ success: false, message: "Start time must be before end time" });
        }
      }
    }

    const imageUrl = req.file ? req.file.path : image || "";

    const event = await Event.create({
      title,
      description,
      location,
      date,
      capacity,
      registrationFee,
      image: imageUrl,
      coordinators,
    });

    if (timings && Array.isArray(timings) && timings.length > 0) {
      const timetableDocs = timings.map(t => ({
        date: t.date,
        startTime: t.startTime,
        endTime: t.endTime,
        event: event._id,
        location: location
      }));
      const inserted = await Timetable.insertMany(timetableDocs);
      event.timings = inserted.map(doc => doc._id);
      await event.save();
    }

    res.status(201).json({
      success: true,
      message: "Event created successfully",
      event
    });
  } catch (error) {
    handleError(res, error);
  }
};

// @desc    Get all events
// @route   GET /api/events
// @access  Public
const getEvents = async (req, res) => {
  try {
    const { page = 1, limit = 10, location, date, upcoming } = req.query;
    
    let query = {};
    if (location) query.location = location;
    if (date) query.date = date;
    if (upcoming === 'true') query.date = { $gte: new Date() };

    const skip = (page - 1) * limit;

    const events = await Event.find(query)
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      events
    });
  } catch (error) {
    handleError(res, error);
  }
};

// @desc    Get event by ID
// @route   GET /api/events/:id
// @access  Public
const getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate("coordinators", "name email")
      .populate("timings");

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    res.json({
      success: true,
      event
    });
  } catch (error) {
    handleError(res, error);
  }
};

// @desc    Update an event
// @route   PUT / PATCH /api/events/:id
// @access  Private
const updateEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    const isCoordinator = event.coordinators && event.coordinators.some(id => id.toString() === req.user._id.toString());
    if (!isCoordinator && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "You are not authorized to modify this event" });
    }

    if (req.file) {
      req.body.image = req.file.path;
    }

    // Don't allow updating timings from this endpoint, use PATCH /timings
    if (req.body.timings) {
      delete req.body.timings;
    }

    const updatedEvent = await Event.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate("timings");

    res.json({
      success: true,
      message: "Event updated successfully",
      event: updatedEvent
    });
  } catch (error) {
    handleError(res, error);
  }
};

// @desc    Update coordinators
// @route   PATCH /api/events/:id/coordinators
// @access  Private
const updateCoordinators = async (req, res) => {
  try {
    const { coordinators } = req.body;

    if (!Array.isArray(coordinators)) {
      return res.status(400).json({ success: false, message: "Coordinators must be an array" });
    }
    
    if (coordinators.length > 3) {
      return res.status(400).json({ success: false, message: "An event can have a maximum of 3 coordinators" });
    }

    const uniqueCoordinators = [...new Set(coordinators)];
    if (uniqueCoordinators.length !== coordinators.length) {
      return res.status(400).json({ success: false, message: "Duplicate coordinator IDs are not allowed" });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    const isCoordinator = event.coordinators && event.coordinators.some(id => id.toString() === req.user._id.toString());
    if (!isCoordinator && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "You are not authorized to modify this event" });
    }

    if (uniqueCoordinators.length > 0) {
      const users = await User.find({ _id: { $in: uniqueCoordinators } });
      if (users.length !== uniqueCoordinators.length) {
        return res.status(400).json({ success: false, message: "One or more coordinator IDs are invalid" });
      }
    }

    event.coordinators = uniqueCoordinators;
    await event.save();

    res.json({
      success: true,
      message: "Event coordinators updated successfully",
      coordinators: event.coordinators
    });

  } catch (error) {
    handleError(res, error);
  }
};

// @desc    Update timings
// @route   PATCH /api/events/:id/timings
// @access  Private
const updateTimings = async (req, res) => {
  try {
    const { timings } = req.body;
    
    if (!Array.isArray(timings)) {
      return res.status(400).json({ success: false, message: "Timings must be an array" });
    }

    for (let timing of timings) {
      if (!timing.date || !timing.startTime || !timing.endTime) {
        return res.status(400).json({ success: false, message: "Date, startTime, and endTime are required for each timing" });
      }
      if (timing.startTime >= timing.endTime) {
        return res.status(400).json({ success: false, message: "Start time must be before end time" });
      }
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    const isCoordinator = event.coordinators && event.coordinators.some(id => id.toString() === req.user._id.toString());
    if (!isCoordinator && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "You are not authorized to modify this event" });
    }

    // Delete existing timetables for this event
    await Timetable.deleteMany({ event: event._id });

    // Insert new timetables
    let inserted = [];
    if (timings.length > 0) {
      const timetableDocs = timings.map(t => ({
        date: t.date,
        startTime: t.startTime,
        endTime: t.endTime,
        event: event._id,
        location: event.location
      }));
      inserted = await Timetable.insertMany(timetableDocs);
    }

    event.timings = inserted.map(doc => doc._id);
    await event.save();

    res.json({
      success: true,
      message: "Event timings updated successfully",
      timings: inserted
    });

  } catch(error) {
    handleError(res, error);
  }
};

// @desc    Delete an event
// @route   DELETE /api/events/:id
// @access  Private
const deleteEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    const isCoordinator = event.coordinators && event.coordinators.some(id => id.toString() === req.user._id.toString());
    if (!isCoordinator && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "You are not authorized to modify this event" });
    }

    await Timetable.deleteMany({ event: event._id });
    await event.deleteOne();

    res.json({ success: true, message: "Event deleted successfully" });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  updateCoordinators,
  updateTimings
};
