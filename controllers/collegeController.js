const College = require("../models/College");

// @desc    Add a new college
// @route   POST /api/colleges
// @access  Public / Protected
const addCollege = async (req, res) => {
  try {
    const { collegeName } = req.body;

    if (!collegeName) {
      return res.status(400).json({ message: "College name is required" });
    }

    // Check for existing college
    const existingCollege = await College.findOne({
      collegeName: { $regex: new RegExp(`^${collegeName.trim()}$`, "i") },
    });

    if (existingCollege) {
      return res.status(400).json({ message: "College with this name already exists" });
    }

    // Always starts with 0 teams by default
    const college = await College.create({
      collegeName: collegeName.trim(),
      totalTeams: 0,
    });

    res.status(201).json({
      message: "College added successfully with 0 teams",
      college,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Register a team for a college (Increment team count up to max 2)
// @route   POST /api/colleges/:id/register-team
// @access  Public / Protected
const registerTeamForCollege = async (req, res) => {
  try {
    const college = await College.findById(req.params.id);
    if (!college) {
      return res.status(404).json({ message: "College not found" });
    }

    if (college.totalTeams >= 2) {
      return res.status(400).json({
        message: "Cannot register team. This college has already reached the maximum limit of 2 teams.",
      });
    }

    college.totalTeams += 1;
    await college.save();

    res.status(200).json({
      message: `Team registered successfully. Current total teams: ${college.totalTeams}`,
      college,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Retrieve all colleges or a single college by ID
// @route   GET /api/colleges & GET /api/colleges/:id
// @access  Public
const getColleges = async (req, res) => {
  try {
    const colleges = await College.find().sort({ collegeName: 1 });
    res.status(200).json(colleges);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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

// @desc    Update college name / teams count
// @route   PUT /api/colleges/:id
// @access  Public / Protected
const updateCollege = async (req, res) => {
  try {
    const { collegeName, totalTeams } = req.body;

    const college = await College.findById(req.params.id);
    if (!college) {
      return res.status(404).json({ message: "College not found" });
    }

    // Enforce max 2 teams limit
    if (totalTeams !== undefined) {
      if (totalTeams < 0 || totalTeams > 2) {
        return res.status(400).json({
          message: "A college can have a maximum of 2 teams only (0 to 2)",
        });
      }
      college.totalTeams = totalTeams;
    }

    if (collegeName) {
      // Check if new collegeName conflicts with another existing college
      const nameConflict = await College.findOne({
        _id: { $ne: req.params.id },
        collegeName: { $regex: new RegExp(`^${collegeName.trim()}$`, "i") },
      });

      if (nameConflict) {
        return res.status(400).json({ message: "Another college already exists with this name" });
      }

      college.collegeName = collegeName.trim();
    }

    await college.save();

    res.status(200).json({
      message: "College updated successfully",
      college,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  addCollege,
  registerTeamForCollege,
  getColleges,
  getCollegeById,
  updateCollege,
};
