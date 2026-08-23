const Admin = require("../models/Admin");
const User = require("../models/User");
const College = require("../models/College");
const Payment = require("../models/Payment");
const EventRegistration = require("../models/EventRegistrations");

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

// @desc    Get recent payments (amount, utr, imageurl, status, message)
// @route   GET /api/admin/recent-payments
// @access  Private (Admin / Superadmin)
const getRecentPayments = async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate({
        path: "user",
        select: "name email collegeName avatar teamid",
        populate: { path: "teamid" },
      })
      .sort({ createdAt: -1 });

    const formattedPayments = payments.map((p) => ({
      _id: p._id,
      user: p.user,
      amount: p.amount,
      utr: p.utr,
      imageUrl: p.imageUrl,
      imageurl: p.imageUrl,
      timestamp: p.timestamp || p.createdAt,
      status: p.status,
      message: p.message || "",
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    res.status(200).json({
      count: formattedPayments.length,
      payments: formattedPayments,
    });
  } catch (error) {
    console.error("Get Recent Payments Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    View details by payment ID (returns events associated with that payment ID)
// @route   GET /api/admin/payment-details/:paymentId
// @access  Private (Admin / Superadmin)
const getPaymentDetails = async (req, res) => {
  try {
    const paymentId = req.params.paymentId || req.params.id || req.query.paymentId;

    if (!paymentId) {
      return res.status(400).json({ message: "Please provide paymentId" });
    }

    const payment = await Payment.findById(paymentId).populate({
      path: "user",
      select: "name email collegeName avatar teamid",
      populate: { path: "teamid" },
    });

    if (!payment) {
      return res.status(404).json({ message: "Payment record not found" });
    }

    // Find all event registrations associated with this paymentId
    const registrations = await EventRegistration.find({
      paymentId: paymentId,
    }).populate("eventId");

    const associatedEvents = registrations.map((r) => ({
      registrationId: r._id,
      event: r.eventId,
      createdAt: r.createdAt,
    }));

    res.status(200).json({
      payment: {
        _id: payment._id,
        user: payment.user,
        amount: payment.amount,
        utr: payment.utr,
        imageUrl: payment.imageUrl,
        imageurl: payment.imageUrl,
        timestamp: payment.timestamp || payment.createdAt,
        status: payment.status,
        message: payment.message || "",
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      },
      associatedEvents,
    });
  } catch (error) {
    console.error("Get Payment Details Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Approve or Reject payment with message
// @route   POST /api/admin/payment-status (also PUT /api/admin/payments/:paymentId/status)
// @access  Private (Admin / Superadmin)
const updatePaymentStatusWithMessage = async (req, res) => {
  try {
    const paymentId = req.params.paymentId || req.params.id || req.body.paymentId;
    const { status, message, paymentStatus } = req.body;
    const targetStatus = status || paymentStatus;

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
    await payment.save();

    const updatedPayment = await Payment.findById(payment._id).populate({
      path: "user",
      select: "name email collegeName avatar teamid",
      populate: { path: "teamid" },
    });

    res.status(200).json({
      message: `Payment status updated to '${normalizedStatus}' successfully`,
      payment: {
        _id: updatedPayment._id,
        user: updatedPayment.user,
        amount: updatedPayment.amount,
        utr: updatedPayment.utr,
        imageUrl: updatedPayment.imageUrl,
        imageurl: updatedPayment.imageUrl,
        timestamp: updatedPayment.timestamp,
        status: updatedPayment.status,
        message: updatedPayment.message,
        createdAt: updatedPayment.createdAt,
        updatedAt: updatedPayment.updatedAt,
      },
    });
  } catch (error) {
    console.error("Update Payment Status Error:", error);
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
};

