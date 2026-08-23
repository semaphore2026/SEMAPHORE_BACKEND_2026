const EventRegistration = require("../models/EventRegistrations");
const Payment = require("../models/Payment");
const Event = require("../models/Event");
const User = require("../models/User");
const College = require("../models/College");
const Team = require("../models/Team");

// Helper function to check if user has teamid set
const verifyUserHasTeam = async (userId) => {
  const user = await User.findById(userId);
  if (!user || !user.teamid) {
    return false;
  }
  return true;
};

// @desc    Add event(s) to user's registration (Requires teamid to be set first)
// @route   POST /api/registrations/events
// @access  Private (User)
const addEventsToRegistration = async (req, res) => {
  try {
    const userId = req.user._id;

    // Requirement: Must have teamid set before event registration
    const hasTeam = await verifyUserHasTeam(userId);
    if (!hasTeam) {
      return res.status(400).json({
        message: "Team ID is required before event registration. Please set your team first.",
      });
    }

    const { eventId, eventIds, events, participants } = req.body;

    // Parse bulk input events array or single eventId/eventIds
    let bulkInputMap = new Map(); // eventId -> participants array
    let idsToAdd = [];

    if (Array.isArray(events)) {
      events.forEach((item) => {
        const id = typeof item === "string" ? item : (item.eventId || item._id);
        if (id) {
          idsToAdd.push(id.toString());
          let itemParticipants = [];
          if (item.participants && Array.isArray(item.participants)) {
            itemParticipants = item.participants.map((p) => ({
              name: p && p.name ? String(p.name).trim() : (typeof p === "string" ? String(p).trim() : ""),
              phone: p && p.phone ? String(p.phone).trim() : "",
            }));
          }
          bulkInputMap.set(id.toString(), itemParticipants);
        }
      });
    }

    if (eventId) {
      idsToAdd.push(eventId.toString());
    }
    if (Array.isArray(eventIds)) {
      idsToAdd = idsToAdd.concat(eventIds.map((id) => id.toString()));
    }

    idsToAdd = Array.from(new Set(idsToAdd)); // Unique event IDs

    if (idsToAdd.length === 0) {
      return res
        .status(400)
        .json({ message: "Please provide eventId, eventIds, or events array in request body" });
    }

    // Default global participants if specified
    let globalParticipants = [];
    if (Array.isArray(participants)) {
      globalParticipants = participants.map((p) => ({
        name: p && p.name ? String(p.name).trim() : (typeof p === "string" ? String(p).trim() : ""),
        phone: p && p.phone ? String(p.phone).trim() : "",
      }));
    }

    // Default to user details if no participants provided
    if (globalParticipants.length === 0) {
      const userObj = await User.findById(userId).populate("teamid");
      if (userObj && userObj.teamid) {
        const members = await User.find({ teamid: userObj.teamid._id });
        globalParticipants = members.map((m) => ({
          name: m.name || "",
          phone: m.phone || "",
        }));
      } else if (userObj) {
        globalParticipants = [
          {
            name: userObj.name || "",
            phone: userObj.phone || "",
          },
        ];
      }
    }

    // Verify all event IDs exist
    const validEvents = await Event.find({ _id: { $in: idsToAdd } });
    if (validEvents.length === 0) {
      return res.status(404).json({ message: "No valid events found for provided IDs" });
    }

    // Validate participant count against min/max participants for each event
    const eventParticipantsMap = new Map();
    for (const event of validEvents) {
      const idStr = event._id.toString();
      let eventParticipants = bulkInputMap.get(idStr);
      if (!eventParticipants || eventParticipants.length === 0) {
        eventParticipants = globalParticipants;
      }

      const min = event.minParticipants || 1;
      const max = event.maxParticipants || 100;
      const count = eventParticipants.length;

      if (count < min) {
        return res.status(400).json({
          message: `Participant count (${count}) is less than the minimum required (${min}) for event '${event.title}'`,
        });
      }

      if (count > max) {
        return res.status(400).json({
          message: `Participant count (${count}) exceeds the maximum allowed (${max}) for event '${event.title}'`,
        });
      }

      eventParticipantsMap.set(idStr, eventParticipants);
    }

    const registrations = [];

    for (const event of validEvents) {
      const idStr = event._id.toString();
      const eventParticipants = eventParticipantsMap.get(idStr) || [];

      let reg = await EventRegistration.findOne({
        userId,
        eventId: event._id,
      });

      if (!reg) {
        reg = await EventRegistration.create({
          userId,
          eventId: event._id,
          paymentId: [],
          participants: eventParticipants,
        });
      } else {
        reg.participants = eventParticipants;
        await reg.save();
      }
      registrations.push(reg);
    }

    // Populate registration response
    const rawRegistrations = await EventRegistration.find({
      userId,
      eventId: { $in: validEvents.map((e) => e._id) },
    })
      .populate("eventId")
      .populate("paymentId");

    const formattedRegistrations = rawRegistrations.map((reg) => {
      const ev = reg.eventId || {};
      const paymentIds = Array.isArray(reg.paymentId)
        ? reg.paymentId.map((p) => (p && p._id ? p._id : p))
        : [];
      const parts = reg.participants || [];

      return {
        _id: reg._id,
        userId: reg.userId,
        eventId: {
          _id: ev._id,
          title: ev.title || "",
          description: ev.description || "",
          registrationFee: ev.registrationFee || 0,
          actualPrice: ev.registrationFee || 0,
          image: ev.image || "",
          location: ev.location || "",
          date: ev.date || null,
          timings: ev.timings || "",
          minParticipants: ev.minParticipants || 1,
          maxParticipants: ev.maxParticipants || 1,
        },
        paymentId: paymentIds,
        participantsCount: parts.length,
        participants: parts,
        createdAt: reg.createdAt,
        updatedAt: reg.updatedAt,
      };
    });

    res.status(200).json({
      message: `Successfully registered ${formattedRegistrations.length} event(s) in bulk`,
      count: formattedRegistrations.length,
      registrations: formattedRegistrations,
    });
  } catch (error) {
    console.error("Add Events Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Retrieve user's registered events
// @route   GET /api/registrations (and /api/registrations/my-events, /api/registrations/me)
// @access  Private (User)
const getUserRegistrations = async (req, res) => {
  try {
    const userId = req.user._id;

    const registrations = await EventRegistration.find({ userId })
      .populate("eventId")
      .populate("paymentId")
      .populate({
        path: "userId",
        select: "name email collegeName avatar teamid",
        populate: { path: "teamid" },
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: "Registered events retrieved successfully",
      count: registrations.length,
      registrations,
    });
  } catch (error) {
    console.error("Get User Registrations Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Make payment for event registration (selecting multiple events possible, same paymentId added to both)
// @route   POST /api/registrations/payment
// @access  Private (User)
const makePayment = async (req, res) => {
  try {
    const userId = req.user._id;

    // Requirement: Must have teamid set before payment
    const hasTeam = await verifyUserHasTeam(userId);
    if (!hasTeam) {
      return res.status(400).json({
        message: "Team ID is required before making payments. Please set your team first.",
      });
    }

    // Check image URL (from Cloudinary upload middleware or body)
    let imageUrl = "";
    if (req.file && (req.file.path || req.file.secure_url)) {
      imageUrl = req.file.path || req.file.secure_url;
    } else if (req.files && req.files.length > 0) {
      imageUrl = req.files[0].path || req.files[0].secure_url;
    } else if (req.body.imageUrl || req.body.imageurl) {
      imageUrl = req.body.imageUrl || req.body.imageurl;
    }

    if (!imageUrl) {
      return res.status(400).json({
        message: "Payment screenshot image is required. Please upload an image file or provide imageUrl.",
      });
    }

    const { amount, utr, eventId, eventIds, participants } = req.body;

    // Process participants input [{ name, phone }] if sent with payment
    let formattedParticipants = [];
    if (Array.isArray(participants)) {
      formattedParticipants = participants.map((p) => ({
        name: p.name ? String(p.name).trim() : "",
        phone: p.phone ? String(p.phone).trim() : "",
      }));
    } else if (typeof participants === "string") {
      try {
        const parsed = JSON.parse(participants);
        if (Array.isArray(parsed)) {
          formattedParticipants = parsed.map((p) => ({
            name: p.name ? String(p.name).trim() : "",
            phone: p.phone ? String(p.phone).trim() : "",
          }));
        }
      } catch (e) {}
    }

    // Collect event IDs for this payment
    let targetEventIds = [];
    if (Array.isArray(eventIds)) {
      targetEventIds = eventIds;
    } else if (eventId) {
      targetEventIds = [eventId];
    } else if (typeof req.body.events === "string") {
      try {
        targetEventIds = JSON.parse(req.body.events);
      } catch (e) {
        targetEventIds = [req.body.events];
      }
    }

    // If no specific event IDs passed in body, find all user's registrations
    if (!Array.isArray(targetEventIds) || targetEventIds.length === 0) {
      const existingRegs = await EventRegistration.find({ userId });
      targetEventIds = existingRegs.map((r) => r.eventId.toString());
    }

    if (targetEventIds.length === 0) {
      return res.status(400).json({
        message: "No events selected or registered for payment. Please specify eventId or eventIds.",
      });
    }

    // Verify events exist
    const validEvents = await Event.find({ _id: { $in: targetEventIds } });
    if (validEvents.length === 0) {
      return res.status(404).json({ message: "No valid events found for provided event IDs" });
    }

    // Create single Payment record
    const payment = await Payment.create({
      user: userId,
      imageUrl,
      amount: amount ? Number(amount) : 0,
      utr: utr ? String(utr).trim() : "",
      timestamp: new Date(),
      status: "pending",
      message: "",
    });

    const updatedRegistrations = [];

    // Link this single paymentId to each selected event registration
    for (const event of validEvents) {
      let reg = await EventRegistration.findOne({
        userId,
        eventId: event._id,
      });

      if (!reg) {
        // Create new EventRegistration if not exists
        reg = await EventRegistration.create({
          userId,
          eventId: event._id,
          paymentId: [payment._id],
          participants: formattedParticipants,
        });
      } else {
        // Append payment._id if not present
        if (!reg.paymentId.some((pid) => pid.toString() === payment._id.toString())) {
          reg.paymentId.push(payment._id);
        }
        if (formattedParticipants.length > 0) {
          reg.participants = formattedParticipants;
        }
        await reg.save();
      }

      updatedRegistrations.push(reg);
    }

    const populatedPayment = await Payment.findById(payment._id).populate("user", "name email collegeName teamid");

    const populatedRegistrations = await EventRegistration.find({
      userId,
      eventId: { $in: validEvents.map((e) => e._id) },
    })
      .populate("eventId")
      .populate("paymentId");

    res.status(201).json({
      message: "Payment submitted successfully and linked to event registrations",
      payment: populatedPayment,
      registrations: populatedRegistrations,
    });
  } catch (error) {
    console.error("Make Payment Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all registrations (Admin Only)
// @route   GET /api/registrations/all
// @access  Private (Admin Only)
const getAllRegistrations = async (req, res) => {
  try {
    const registrations = await EventRegistration.find()
      .populate("eventId")
      .populate("paymentId")
      .populate({
        path: "userId",
        select: "name email collegeName avatar teamid",
        populate: { path: "teamid" },
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      count: registrations.length,
      registrations,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get total pending payments amount
// @route   GET /api/registrations/payments/pending
// @access  Private (Admin Only)
const getPendingPayments = async (req, res) => {
  try {
    const pendingPayments = await Payment.find({
      status: { $in: ["pending", "submitted"] },
    }).select("amount");

    const totalPendingAmount = pendingPayments.reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    );

    res.status(200).json({ totalPendingAmount, count: pendingPayments.length });
  } catch (error) {
    console.error("Get Pending Payments Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get total approved payments amount
// @route   GET /api/registrations/payments/approved
// @access  Private (Admin Only)
const getApprovedPayments = async (req, res) => {
  try {
    const approvedPayments = await Payment.find({
      status: { $in: ["approved", "verified"] },
    }).select("amount");

    const totalApprovedAmount = approvedPayments.reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    );

    res.status(200).json({ totalApprovedAmount, count: approvedPayments.length });
  } catch (error) {
    console.error("Get Approved Payments Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get overall stats
// @route   GET /api/registrations/stats
// @access  Private (Admin Only)
const getRegistrationStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: { $ne: "admin" } });
    const totalTeams = await Team.countDocuments();

    const pendingPayments = await Payment.find({
      status: { $in: ["pending", "submitted"] },
    });
    const totalPendingAmount = pendingPayments.reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    );

    const approvedPayments = await Payment.find({
      status: { $in: ["approved", "verified"] },
    });
    const totalApprovedAmount = approvedPayments.reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    );

    res.status(200).json({
      success: true,
      message: "Registration and team statistics retrieved successfully",
      totalUsers,
      totalTeams,
      paymentsSummary: {
        pendingCount: pendingPayments.length,
        totalPendingAmount,
        approvedCount: approvedPayments.length,
        totalApprovedAmount,
      },
    });
  } catch (error) {
    console.error("Get Registration Stats Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get total number of registered users
// @route   GET /api/registrations/total-users
// @access  Private (Admin Only)
const getTotalUsers = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: { $ne: "admin" } });
    res.status(200).json({ totalUsers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get total count of teams
// @route   GET /api/registrations/total-teams
// @access  Private (Admin Only)
const getTotalTeams = async (req, res) => {
  try {
    const totalTeams = await Team.countDocuments();
    res.status(200).json({ totalTeams });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  addEventsToRegistration,
  getUserRegistrations,
  makePayment,
  getAllRegistrations,
  getPendingPayments,
  getApprovedPayments,
  getRegistrationStats,
  getTotalUsers,
  getTotalTeams,
};
