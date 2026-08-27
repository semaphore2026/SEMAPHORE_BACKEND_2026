const AllowedCollege = require("../models/AllowedCollege");
const CollegeConfig = require("../models/CollegeConfig");

// Ensure global configuration record exists
const getOrInitConfig = async () => {
  let config = await CollegeConfig.findOne();
  if (!config) {
    config = await CollegeConfig.create({
      defaultMaxTeamsPerCollege: 1,
      enforceAllowedListOnly: false,
    });
  }
  return config;
};

// @desc    Get all allowed colleges and current configuration
// @route   GET /api/allowed-colleges
// @access  Public / Protected
const getAllowedColleges = async (req, res) => {
  try {
    const config = await getOrInitConfig();
    const allowedColleges = await AllowedCollege.find().sort({ collegeName: 1 });

    res.status(200).json({
      config,
      allowedColleges,
      totalAllowedColleges: allowedColleges.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add a new allowed college record
// @route   POST /api/allowed-colleges
// @access  Public / Protected
const addAllowedCollege = async (req, res) => {
  try {
    const { collegeName, maxTeams, isActive } = req.body;

    if (!collegeName || !collegeName.trim()) {
      return res.status(400).json({ message: "College name is required" });
    }

    const cleanName = collegeName.trim();

    const existing = await AllowedCollege.findOne({
      collegeName: { $regex: new RegExp(`^${cleanName}$`, "i") },
    });

    if (existing) {
      return res.status(400).json({ message: "Allowed college record already exists for this college" });
    }

    const config = await getOrInitConfig();
    const allowedCollege = await AllowedCollege.create({
      collegeName: cleanName,
      maxTeams: typeof maxTeams === "number" && maxTeams > 0 ? maxTeams : config.defaultMaxTeamsPerCollege,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    res.status(201).json({
      message: "Allowed college record created successfully",
      allowedCollege,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update an allowed college record
// @route   PUT /api/allowed-colleges/:id
// @access  Public / Protected
const updateAllowedCollege = async (req, res) => {
  try {
    const { id } = req.params;
    const { collegeName, maxTeams, isActive } = req.body;

    const record = await AllowedCollege.findById(id);
    if (!record) {
      return res.status(404).json({ message: "Allowed college record not found" });
    }

    if (collegeName && collegeName.trim()) {
      const cleanName = collegeName.trim();
      const conflict = await AllowedCollege.findOne({
        _id: { $ne: id },
        collegeName: { $regex: new RegExp(`^${cleanName}$`, "i") },
      });
      if (conflict) {
        return res.status(400).json({ message: "Another record already exists with this college name" });
      }
      record.collegeName = cleanName;
    }

    if (typeof maxTeams === "number" && maxTeams > 0) {
      record.maxTeams = maxTeams;
    }

    if (isActive !== undefined) {
      record.isActive = Boolean(isActive);
    }

    await record.save();

    res.status(200).json({
      message: "Allowed college record updated successfully",
      allowedCollege: record,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete an allowed college record
// @route   DELETE /api/allowed-colleges/:id
// @access  Public / Protected
const deleteAllowedCollege = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await AllowedCollege.findById(id);

    if (!record) {
      return res.status(404).json({ message: "Allowed college record not found" });
    }

    await record.deleteOne();

    res.status(200).json({
      message: "Allowed college record deleted successfully",
      deletedCollege: record,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update global college configuration
// @route   PUT /api/allowed-colleges/config
// @access  Public / Protected
const updateCollegeConfig = async (req, res) => {
  try {
    const { defaultMaxTeamsPerCollege, enforceAllowedListOnly } = req.body;
    const config = await getOrInitConfig();

    if (typeof defaultMaxTeamsPerCollege === "number" && defaultMaxTeamsPerCollege > 0) {
      config.defaultMaxTeamsPerCollege = defaultMaxTeamsPerCollege;
    }

    if (enforceAllowedListOnly !== undefined) {
      config.enforceAllowedListOnly = Boolean(enforceAllowedListOnly);
    }

    await config.save();

    res.status(200).json({
      message: "College configuration updated successfully",
      config,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Seed helper for initial setup
const seedInitialRecord = async () => {
  try {
    await getOrInitConfig();
  } catch (err) {
    console.error("Error seeding CollegeConfig:", err.message);
  }
};

module.exports = {
  getAllowedColleges,
  addAllowedCollege,
  updateAllowedCollege,
  deleteAllowedCollege,
  updateCollegeConfig,
  seedInitialRecord,
  getOrInitConfig,
};
