const Admin = require("../models/Admin");
const User = require("../models/User");
const College = require("../models/College");
const Payment = require("../models/Payment");
const EventRegistration = require("../models/EventRegistrations");
const Event = require("../models/Event");

// @desc    Admin / Superadmin Login
// @route   POST /api/admin/login
// @access  Public
const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Please provide email and password" });
    }

    const admin = await Admin.findOne({ email });

    if (admin && (await admin.matchPassword(password))) {
      res.json({
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        token: admin.generateToken(),
        createdAt: admin.createdAt,
        updatedAt: admin.updatedAt,
      });
    } else {
      res.status(401).json({ message: "Invalid email or password" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add a new Admin / Superadmin
// @route   POST /api/admin/addadmins (or /api/admin/addadmin)
// @access  Private (Admin / Superadmin)
const addAdmin = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Please fill in all required fields (name, email, password)" });
    }

    const adminExists = await Admin.findOne({ email });
    if (adminExists) {
      return res.status(400).json({ message: "Admin already exists with this email" });
    }

    // Role assignment security check:
    // Only superadmin can assign role as 'superadmin'
    let assignedRole = "admin";
    if (role === "superadmin") {
      if (req.admin && req.admin.role === "superadmin") {
        assignedRole = "superadmin";
      } else {
        return res.status(403).json({ message: "Only superadmin can assign superadmin role" });
      }
    } else if (role === "admin") {
      assignedRole = "admin";
    }

    const newAdmin = await Admin.create({
      name,
      email,
      password,
      role: assignedRole,
    });

    res.status(201).json({
      _id: newAdmin._id,
      name: newAdmin.name,
      email: newAdmin.email,
      role: newAdmin.role,
      token: newAdmin.generateToken(),
      createdAt: newAdmin.createdAt,
      updatedAt: newAdmin.updatedAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Change role of another admin to admin or superadmin
// @route   PUT /api/admin/makeadmin (or PATCH / POST)
// @access  Private (Superadmin only)
const makeAdmin = async (req, res) => {
  try {
    const { adminId, email, role } = req.body;

    if (!adminId && !email) {
      return res.status(400).json({ message: "Please provide adminId or email of target admin" });
    }

    const targetRole = role || "admin";
    if (!["admin", "superadmin"].includes(targetRole)) {
      return res.status(400).json({ message: "Role must be 'admin' or 'superadmin'" });
    }

    // Query by adminId or email
    const query = adminId ? { _id: adminId } : { email };
    const adminToUpdate = await Admin.findOne(query);

    if (!adminToUpdate) {
      return res.status(404).json({ message: "Target admin not found" });
    }

    adminToUpdate.role = targetRole;
    await adminToUpdate.save();

    res.status(200).json({
      message: `Admin role successfully updated to '${targetRole}'`,
      _id: adminToUpdate._id,
      name: adminToUpdate.name,
      email: adminToUpdate.email,
      role: adminToUpdate.role,
      updatedAt: adminToUpdate.updatedAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get currently logged in admin profile
// @route   GET /api/admin/me
// @access  Private (Admin / Superadmin)
const getAdminProfile = async (req, res) => {
  try {
    res.json(req.admin);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all admins
// @route   GET /api/admin/all
// @access  Private (Superadmin only)
const getAllAdmins = async (req, res) => {
  try {
    const admins = await Admin.find().select("-password").sort({ createdAt: -1 });
    res.json(admins);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ================= USER MANAGEMENT CONTROLLERS =================

// @desc    Retrieve all users
// @route   GET /api/admin/users
// @access  Private (Admin / Superadmin)
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .populate("college")
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single user details by ID
// @route   GET /api/admin/users/:id
// @access  Private (Admin / Superadmin)
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password")
      .populate("college");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user details
// @route   PUT /api/admin/users/:id
// @access  Private (Admin / Superadmin)
const updateUser = async (req, res) => {
  try {
    const { name, email, role, collegeName } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (role !== undefined) user.role = role;
    if (collegeName !== undefined) user.collegeName = collegeName;

    await user.save();

    const updatedUser = await User.findById(user._id)
      .select("-password")
      .populate("college");

    res.json({
      message: "User updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a user
// @route   DELETE /api/admin/users/:id
// @access  Private (Admin / Superadmin)
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // If user belonged to a college, decrement college team count
    if (user.college) {
      const college = await College.findById(user.college);
      if (college && college.totalTeams > 0) {
        college.totalTeams -= 1;
        await college.save();
      }
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({
      message: "User deleted successfully",
      _id: req.params.id,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ================= ADMIN PAYMENT MANAGEMENT CONTROLLERS =================

// @desc    Get recent payments (amount, utr, imageurl, paymentid, status, message, approvedBy, user, college, team)
// @route   GET /api/admin/recent-payments
// @access  Private (Admin / Superadmin)
const getRecentPayments = async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate({
        path: "user",
        select: "name email collegeName avatar college teamid",
        populate: [{ path: "teamid" }, { path: "college" }],
      })
      .populate("approvedBy", "name email role")
      .sort({ createdAt: -1 });

    const formattedPayments = payments.map((p) => {
      const u = p.user || {};
      return {
        paymentid: p._id,
        _id: p._id,
        amount: p.amount,
        utr: p.utr,
        imageUrl: p.imageUrl,
        imageurl: p.imageUrl,
        status: p.status,
        message: p.message || "",
        approvedBy: p.approvedBy || null,
        approved_by: p.approvedBy || null,
        timestamp: p.timestamp || p.createdAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        user: {
          _id: u._id,
          name: u.name,
          email: u.email,
          avatar: u.avatar,
          collegeName: u.collegeName,
          college: u.college || null,
          team: u.teamid || null,
        },
      };
    });

    res.status(200).json({
      count: formattedPayments.length,
      payments: formattedPayments,
    });
  } catch (error) {
    console.error("Get Recent Payments Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Fetch event details, user details, college details, and team details by payment ID
// @route   GET /api/admin/payment-details/:paymentId
// @access  Private (Admin / Superadmin)
const getPaymentDetails = async (req, res) => {
  try {
    const paymentId = req.params.paymentId || req.params.id || req.query.paymentId;

    if (!paymentId) {
      return res.status(400).json({ message: "Please provide paymentId" });
    }

    const payment = await Payment.findById(paymentId)
      .populate({
        path: "user",
        select: "name email collegeName avatar college teamid",
        populate: [{ path: "teamid" }, { path: "college" }],
      })
      .populate("approvedBy", "name email role");

    if (!payment) {
      return res.status(404).json({ message: "Payment record not found" });
    }

    // Find all event registrations associated with this paymentId
    const registrations = await EventRegistration.find({
      paymentId: paymentId,
    }).populate("eventId");

    const events = registrations.map((r) => ({
      registrationId: r._id,
      event: r.eventId,
      createdAt: r.createdAt,
    }));

    const u = payment.user || {};

    res.status(200).json({
      payment: {
        paymentid: payment._id,
        _id: payment._id,
        amount: payment.amount,
        utr: payment.utr,
        imageUrl: payment.imageUrl,
        imageurl: payment.imageUrl,
        status: payment.status,
        message: payment.message || "",
        approvedBy: payment.approvedBy || null,
        approved_by: payment.approvedBy || null,
        timestamp: payment.timestamp || payment.createdAt,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      },
      user: {
        _id: u._id,
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        collegeName: u.collegeName,
      },
      college: u.college || null,
      team: u.teamid || null,
      events: events.map((e) => e.event),
      associatedEvents: events,
    });
  } catch (error) {
    console.error("Get Payment Details Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Approve or Reject payment with message (tracks adminId in approvedBy)
// @route   POST /api/admin/payment-status (also PUT /api/admin/payments/:paymentId/status)
// @access  Private (Admin / Superadmin)
const updatePaymentStatusWithMessage = async (req, res) => {
  try {
    const paymentId = req.params.paymentId || req.params.id || req.body.paymentId || req.body.paymentid;
    const { status, message, paymentStatus } = req.body;
    const targetStatus = status || paymentStatus;

    // Retrieve admin ID from JWT token payload (set by adminAuthMiddleware or protectAnyAdmin)
    const adminId = req.admin ? req.admin._id : (req.user ? req.user._id : null);

    if (!paymentId) {
      return res.status(400).json({ message: "Please provide paymentId" });
    }

    if (!targetStatus) {
      return res.status(400).json({ message: "Please provide status ('approved' or 'rejected')" });
    }

    const normalizedStatus = String(targetStatus).toLowerCase().trim();
    if (!["approved", "rejected", "verified", "pending", "submitted"].includes(normalizedStatus)) {
      return res.status(400).json({
        message: "Invalid status. Must be 'approved' or 'rejected'",
      });
    }

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ message: "Payment record not found" });
    }

    payment.status = normalizedStatus;
    if (message !== undefined) {
      payment.message = String(message).trim();
    }
    if (adminId) {
      payment.approvedBy = adminId;
    }
    await payment.save();

    const updatedPayment = await Payment.findById(payment._id)
      .populate({
        path: "user",
        select: "name email collegeName avatar college teamid",
        populate: [{ path: "teamid" }, { path: "college" }],
      })
      .populate("approvedBy", "name email role");

    const u = updatedPayment.user || {};

    res.status(200).json({
      message: `Payment status updated to '${normalizedStatus}' successfully`,
      payment: {
        paymentid: updatedPayment._id,
        _id: updatedPayment._id,
        user: {
          _id: u._id,
          name: u.name,
          email: u.email,
          collegeName: u.collegeName,
          college: u.college || null,
          team: u.teamid || null,
        },
        amount: updatedPayment.amount,
        utr: updatedPayment.utr,
        imageUrl: updatedPayment.imageUrl,
        imageurl: updatedPayment.imageUrl,
        timestamp: updatedPayment.timestamp,
        status: updatedPayment.status,
        message: updatedPayment.message,
        approvedBy: updatedPayment.approvedBy || null,
        approved_by: updatedPayment.approvedBy || null,
        createdAt: updatedPayment.createdAt,
        updatedAt: updatedPayment.updatedAt,
      },
    });
  } catch (error) {
    console.error("Update Payment Status Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get registered events, actual price amount, and participants for a specific user
// @route   GET /api/admin/user-events/:userId (also /api/admin/users/:userId/events)
// @access  Private (Admin / Superadmin)
const getUserEventsWithDetails = async (req, res) => {
  try {
    const userId = req.params.userId || req.params.id;

    if (!userId) {
      return res.status(400).json({ message: "Please provide userId" });
    }

    const user = await User.findById(userId)
      .select("-password")
      .populate("college")
      .populate("teamid");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Find all event registrations for this user
    const registrations = await EventRegistration.find({ userId })
      .populate("eventId")
      .populate({
        path: "paymentId",
        populate: { path: "approvedBy", select: "name email role" },
      });

    // Find team members if user belongs to a team
    let teamMembers = [];
    if (user.teamid) {
      teamMembers = await User.find({ teamid: user.teamid._id }).select(
        "name email avatar collegeName"
      );
    } else {
      teamMembers = [
        {
          _id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          collegeName: user.collegeName,
        },
      ];
    }

    const eventsDetails = registrations.map((reg) => {
      const ev = reg.eventId || {};
      return {
        registrationId: reg._id,
        eventId: ev._id,
        title: ev.title || "",
        description: ev.description || "",
        actualPrice: ev.registrationFee || 0,
        registrationFee: ev.registrationFee || 0,
        location: ev.location || "",
        date: ev.date || null,
        minParticipants: ev.minParticipants || 1,
        maxParticipants: ev.maxParticipants || 1,
        payments: reg.paymentId || [],
        participants: teamMembers,
        createdAt: reg.createdAt,
        updatedAt: reg.updatedAt,
      };
    });

    res.status(200).json({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        collegeName: user.collegeName,
        college: user.college || null,
      },
      team: user.teamid || null,
      totalEventsCount: eventsDetails.length,
      events: eventsDetails,
    });
  } catch (error) {
    console.error("Get User Events Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get participants and event details by eventId and userId
// @route   GET /api/admin/event-participants/:eventId/:userId (also /api/admin/event-participants)
// @access  Private (Admin / Superadmin)
const getEventParticipantsByEventAndUser = async (req, res) => {
  try {
    const eventId = req.params.eventId || req.query.eventId || req.query.eventid;
    const userId = req.params.userId || req.query.userId || req.query.userid;

    if (!eventId || !userId) {
      return res.status(400).json({ message: "Please provide both eventId and userId" });
    }

    const user = await User.findById(userId)
      .select("-password")
      .populate("college")
      .populate("teamid");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const registration = await EventRegistration.findOne({ userId, eventId })
      .populate("eventId")
      .populate({
        path: "paymentId",
        populate: { path: "approvedBy", select: "name email role" },
      });

    let teamMembers = [];
    if (user.teamid) {
      teamMembers = await User.find({ teamid: user.teamid._id }).select(
        "name email avatar collegeName"
      );
    } else {
      teamMembers = [
        {
          _id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          collegeName: user.collegeName,
        },
      ];
    }

    res.status(200).json({
      registrationId: registration ? registration._id : null,
      event: {
        _id: event._id,
        title: event.title,
        description: event.description,
        registrationFee: event.registrationFee,
        actualPrice: event.registrationFee,
        location: event.location,
        date: event.date,
        capacity: event.capacity,
        minParticipants: event.minParticipants,
        maxParticipants: event.maxParticipants,
      },
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        collegeName: user.collegeName,
      },
      college: user.college || null,
      team: user.teamid || null,
      participantsCount: teamMembers.length,
      participants: teamMembers,
      payments: registration ? registration.paymentId : [],
      createdAt: registration ? registration.createdAt : null,
    });
  } catch (error) {
    console.error("Get Event Participants Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all details of a user (user details, team, college, registered events, payments, summary) for Admin
// @route   GET /api/admin/user-full-details/:userId (also /api/admin/users/:userId/full-details)
// @access  Private (Admin / Superadmin only)
const getUserFullDetailsForAdmin = async (req, res) => {
  try {
    const userId = req.params.userId || req.params.id;

    if (!userId) {
      return res.status(400).json({ message: "Please provide userId" });
    }

    const user = await User.findById(userId)
      .select("-password")
      .populate("college")
      .populate("teamid");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Fetch all event registrations for this user
    const registrations = await EventRegistration.find({ userId })
      .populate("eventId")
      .populate({
        path: "paymentId",
        populate: { path: "approvedBy", select: "name email role" },
      });

    // Fetch team members if user belongs to a team
    let teamMembers = [];
    if (user.teamid) {
      teamMembers = await User.find({ teamid: user.teamid._id }).select(
        "name email avatar collegeName createdAt"
      );
    } else {
      teamMembers = [
        {
          _id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          collegeName: user.collegeName,
          createdAt: user.createdAt,
        },
      ];
    }

    // Extract all unique payments made by this user
    const userPaymentsMap = new Map();
    registrations.forEach((reg) => {
      if (Array.isArray(reg.paymentId)) {
        reg.paymentId.forEach((p) => {
          if (p && p._id) {
            userPaymentsMap.set(p._id.toString(), p);
          }
        });
      }
    });

    const userPayments = Array.from(userPaymentsMap.values());
    const totalAmountPaid = userPayments.reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    );

    const eventsList = registrations.map((reg) => {
      const ev = reg.eventId || {};
      return {
        registrationId: reg._id,
        eventId: ev._id,
        title: ev.title || "",
        description: ev.description || "",
        registrationFee: ev.registrationFee || 0,
        actualPrice: ev.registrationFee || 0,
        image: ev.image || "",
        location: ev.location || "",
        date: ev.date || null,
        timings: ev.timings || "",
        coordinators: ev.coordinators || [],
        minParticipants: ev.minParticipants || 1,
        maxParticipants: ev.maxParticipants || 1,
        payments: reg.paymentId || [],
        createdAt: reg.createdAt,
        updatedAt: reg.updatedAt,
      };
    });

    const teamObj = user.teamid || null;

    res.status(200).json({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        googleId: user.googleId || null,
        collegeName: user.collegeName || "",
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      college: user.college || null,
      team: teamObj
        ? {
            _id: teamObj._id,
            name: teamObj.name,
            teamid: teamObj.teamid,
            createdAt: teamObj.createdAt,
            updatedAt: teamObj.updatedAt,
          }
        : null,
      teamName: teamObj ? teamObj.name : "",
      hasTeam: Boolean(teamObj),
      teamMembers,
      registeredEvents: eventsList,
      payments: userPayments,
      summary: {
        totalEventsRegistered: eventsList.length,
        totalPaymentsSubmitted: userPayments.length,
        totalAmountPaid,
      },
    });
  } catch (error) {
    console.error("Get User Full Details Error:", error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  loginAdmin,
  addAdmin,
  makeAdmin,
  getAdminProfile,
  getAllAdmins,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getRecentPayments,
  getPaymentDetails,
  updatePaymentStatusWithMessage,
  getUserEventsWithDetails,
  getEventParticipantsByEventAndUser,
  getUserFullDetailsForAdmin,
};


