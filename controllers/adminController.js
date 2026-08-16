const Admin = require("../models/Admin");

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

module.exports = {
  loginAdmin,
  addAdmin,
  makeAdmin,
  getAdminProfile,
  getAllAdmins,
};
