const College = require("../models/College");
const User = require("../models/User");

// @desc    Add a new college (admin / system setup)
// @route   POST /api/colleges
// @access  Public / Protected
const addCollege = async (req, res) => {
  try {
    const { collegeName } = req.body;

    if (!collegeName || !collegeName.trim()) {
      return res.status(400).json({ message: "College name is required" });
    }

    const cleanName = collegeName.trim();

    // Check for existing college
    const existingCollege = await College.findOne({
      collegeName: { $regex: new RegExp(`^${cleanName}$`, "i") },
    });

    if (existingCollege) {
      return res.status(400).json({ message: "College with this name already exists" });
    }

    const college = await College.create({
      collegeName: cleanName,
      totalTeams: 0,
    });

    res.status(201).json({
      message: "College added successfully",
      college,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Retrieve all colleges
// @route   GET /api/colleges
// @access  Public
const getColleges = async (req, res) => {
  try {
    const colleges = await College.find().sort({ collegeName: 1 });
    res.status(200).json(colleges);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Retrieve a single college by ID
// @route   GET /api/colleges/:id
// @access  Public
const getCollegeById = async (req, res) => {
  try {
    const college = await College.findById(req.params.id);
    if (!college) {
      return res.status(404).json({ message: "College not found" });
    }
    res.status(200).json(college);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update college name ONLY (totalTeams increases automatically on user signup)
// @route   PUT /api/colleges/:id
// @access  Public / Protected
const updateCollege = async (req, res) => {
  try {
    const { collegeName } = req.body;

    if (!collegeName || !collegeName.trim()) {
      return res.status(400).json({ message: "New college name is required" });
    }

    const college = await College.findById(req.params.id);
    if (!college) {
      return res.status(404).json({ message: "College not found" });
    }

    const cleanName = collegeName.trim();

    // Check if new collegeName conflicts with another existing college
    const nameConflict = await College.findOne({
      _id: { $ne: req.params.id },
      collegeName: { $regex: new RegExp(`^${cleanName}$`, "i") },
    });

    if (nameConflict) {
      return res.status(400).json({ message: "Another college already exists with this name" });
    }

    const oldName = college.collegeName;
    college.collegeName = cleanName;
    await college.save();

    // Update collegeName on linked user records as well
    await User.updateMany({ college: college._id }, { collegeName: cleanName });

    res.status(200).json({
      message: "College name updated successfully",
      college,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  addCollege,
  getColleges,
  getCollegeById,
  updateCollege,
};
