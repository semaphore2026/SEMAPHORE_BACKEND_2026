const EventRegistration = require("../models/EventRegistrations");
const Payment = require("../models/Payment");
const Event = require("../models/Event");

// @desc    Add event(s) to user's registration with participants validation
// @route   POST /api/registrations/events
// @access  Private (User)
const addEventsToRegistration = async (req, res) => {
  try {
    const userId = req.user._id;
    const { eventId, eventIds, participants } = req.body;

    // Collect event IDs to add
    let idsToAdd = [];
    if (eventId) {
      idsToAdd.push(eventId);
    }
    if (Array.isArray(eventIds)) {
      idsToAdd = idsToAdd.concat(eventIds);
    }

    if (idsToAdd.length === 0) {
      return res
        .status(400)
        .json({ message: "Please provide eventId or eventIds in request body" });
    }

    // Verify all event IDs exist
    const validEvents = await Event.find({ _id: { $in: idsToAdd } });
    if (validEvents.length === 0) {
      return res.status(404).json({ message: "No valid events found for provided IDs" });
    }

    // Validate participant count against minParticipants & maxParticipants for each event
    const eventParticipantsMap = new Map();

    for (const event of validEvents) {
      const min = event.minParticipants || 1;
      const max = event.maxParticipants || 1;

      let eventParticipants = [];
      if (Array.isArray(participants) && participants.length > 0) {
        eventParticipants = participants.map((p) => {
          if (typeof p === "string") return { name: p.trim() };
          return {
            name: p.name ? String(p.name).trim() : "",
            email: p.email ? String(p.email).trim() : "",
            phone: p.phone ? String(p.phone).trim() : "",
            college: p.college ? String(p.college).trim() : "",
          };
        });
      } else if (min === 1) {
        eventParticipants = [
          {
            name: req.user.name || "",
            email: req.user.email || "",
            college: req.user.collegeName || "",
          },
        ];
      }

      if (eventParticipants.length < min) {
        return res.status(400).json({
          message: `Participant count (${eventParticipants.length}) is less than the minimum required (${min}) for event '${event.title}'`,
        });
      }

      if (eventParticipants.length > max) {
        return res.status(400).json({
          message: `Participant count (${eventParticipants.length}) exceeds the maximum allowed (${max}) for event '${event.title}'`,
        });
      }

      eventParticipantsMap.set(event._id.toString(), eventParticipants);
    }

    // Find or create EventRegistration for user
    let registration = await EventRegistration.findOne({ userId });

    if (!registration) {
      registration = new EventRegistration({
        userId,
        events: [],
        paymentStatus: "pending",
      });
    }

    let addedCount = 0;
    let updatedCount = 0;

    for (const event of validEvents) {
      const idStr = event._id.toString();
      const eventParticipants = eventParticipantsMap.get(idStr) || [];
      const existingIndex = registration.events.findIndex(
        (e) => e.eventId.toString() === idStr
      );

      if (existingIndex > -1) {
        registration.events[existingIndex].participants = eventParticipants;
        registration.events[existingIndex].addedAt = new Date();
        updatedCount++;
      } else {
        registration.events.push({
          eventId: event._id,
          participants: eventParticipants,
          paymentId: null,
          addedAt: new Date(),
        });
        addedCount++;
      }
    }

    registration.timestamp = new Date();
    await registration.save();

    // Populate registration details for response
    const updatedRegistration = await EventRegistration.findById(registration._id)
      .populate({
        path: "events.eventId",
        select: "title description location date capacity minParticipants maxParticipants registrationFee image coordinators timings",
      })
      .populate("events.paymentId")
      .populate("userId", "name email collegeName avatar");

    res.status(200).json({
      message: `Registration updated successfully (${addedCount} added, ${updatedCount} updated)`,
      registration: updatedRegistration,
    });
  } catch (error) {
    console.error("Add Events Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Retrieve user's registered events
// @route   GET /api/registrations (and /api/registrations/my-events, /api/registrations/me, /api/registrations/user)
// @access  Private (User)
const getUserRegistrations = async (req, res) => {
  try {
    const userId = req.user._id;

    const registration = await EventRegistration.findOne({ userId })
      .populate({
        path: "events.eventId",
        select: "title description location date capacity minParticipants maxParticipants registrationFee image coordinators timings",
      })
      .populate("events.paymentId")
      .populate("userId", "name email collegeName avatar");

    if (!registration) {
      return res.status(200).json({
        message: "No event registration record found for this user",
        registration: {
          userId,
          events: [],
          paymentStatus: "pending",
          timestamp: null,
        },
      });
    }

    res.status(200).json({
      message: "Registered events retrieved successfully",
      registration,
    });
  } catch (error) {
    console.error("Get User Registrations Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Make payment for event registration (Upload Cloudinary image)
// @route   POST /api/registrations/payment
// @access  Private (User)
const makePayment = async (req, res) => {
  try {
    const userId = req.user._id;

    // Check for uploaded Cloudinary image file
    let imageUrl = "";
    if (req.file && (req.file.path || req.file.secure_url)) {
      imageUrl = req.file.path || req.file.secure_url;
    } else if (req.files && req.files.length > 0) {
      imageUrl = req.files[0].path || req.files[0].secure_url;
    } else if (req.body.imageUrl) {
      imageUrl = req.body.imageUrl;
    }

    if (!imageUrl) {
      return res.status(400).json({
        message: "Payment screenshot image is required. Please upload an image file.",
      });
    }

    const { amount, utr } = req.body;

    // Find user registration
    let registration = await EventRegistration.findOne({ userId });
    if (!registration || registration.events.length === 0) {
      return res.status(400).json({
        message: "No events registered yet. Please add events before making a payment.",
      });
    }

    // Create Payment record
    const payment = await Payment.create({
      user: userId,
      imageUrl,
      amount: amount ? Number(amount) : 0,
      utr: utr ? String(utr).trim() : "",
      timestamp: new Date(),
      status: "submitted",
    });

    // Link payment to user's registered events that don't have a payment yet
    registration.events.forEach((item) => {
      if (!item.paymentId) {
        item.paymentId = payment._id;
      }
    });

    registration.paymentStatus = "submitted";
    registration.timestamp = new Date();
    await registration.save();

    const updatedRegistration = await EventRegistration.findById(registration._id)
      .populate("events.eventId")
      .populate("events.paymentId")
      .populate("userId", "name email collegeName avatar");

    res.status(201).json({
      message: "Payment submitted successfully and registration status updated",
      payment,
      registration: updatedRegistration,
    });
  } catch (error) {
    console.error("Make Payment Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update payment status for a registration (Admin Only)
// @route   PUT /api/registrations/:id/payment-status
// @access  Private (Admin Only)
const updatePaymentStatus = async (req, res) => {
  try {
    // Admin check: verify if requester is admin
    const isAdmin =
      (req.user && req.user.role === "admin") ||
      (req.admin && (req.admin.role === "admin" || req.admin.role === "superadmin"));

    if (!isAdmin) {
      return res.status(403).json({
        message: "Unauthorized: Access denied. Admin privileges required.",
      });
    }

    const registrationId = req.params.id || req.params.registrationId || req.body.registrationId;
    const { paymentStatus, status } = req.body;
    const targetStatus = paymentStatus || status;

    if (!targetStatus) {
      return res.status(400).json({
        message: "Please provide paymentStatus (e.g., 'approved', 'verified', 'rejected', 'pending')",
      });
    }

    const validStatuses = ["pending", "submitted", "approved", "verified", "rejected"];
    if (!validStatuses.includes(targetStatus.toLowerCase())) {
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const registration = await EventRegistration.findById(registrationId);
    if (!registration) {
      return res.status(404).json({ message: "Event registration record not found" });
    }

    const normalizedStatus = targetStatus.toLowerCase();
    registration.paymentStatus = normalizedStatus;
    registration.timestamp = new Date();
    await registration.save();

    // Update status on all associated Payment records
    const paymentIds = registration.events
      .map((e) => e.paymentId)
      .filter((pid) => pid !== null);

    if (paymentIds.length > 0) {
      await Payment.updateMany(
        { _id: { $in: paymentIds } },
        { $set: { status: normalizedStatus } }
      );
    }

    const updatedRegistration = await EventRegistration.findById(registration._id)
      .populate("events.eventId")
      .populate("events.paymentId")
      .populate("userId", "name email collegeName avatar");

    res.status(200).json({
      message: `Payment status updated to '${normalizedStatus}' successfully`,
      registration: updatedRegistration,
    });
  } catch (error) {
    console.error("Update Payment Status Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all registrations (Admin Only)
// @route   GET /api/registrations/all
// @access  Private (Admin Only)
const getAllRegistrations = async (req, res) => {
  try {
    const isAdmin =
      (req.user && req.user.role === "admin") ||
      (req.admin && (req.admin.role === "admin" || req.admin.role === "superadmin"));

    if (!isAdmin) {
      return res.status(403).json({
        message: "Unauthorized: Access denied. Admin privileges required.",
      });
    }

    const registrations = await EventRegistration.find()
      .populate("events.eventId")
      .populate("events.paymentId")
      .populate("userId", "name email collegeName avatar")
      .sort({ updatedAt: -1 });

    res.status(200).json({
      count: registrations.length,
      registrations,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  addEventsToRegistration,
  getUserRegistrations,
  makePayment,
  updatePaymentStatus,
  getAllRegistrations,
};
