const AllowedCollege = require("../models/AllowedCollege");
const CollegeConfig = require("../models/CollegeConfig");
const User = require("../models/User");

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

// @desc    Check if a college has available registration slots
// @route   GET /api/allowed-colleges/check/:collegeName
// @access  Public (no auth required — called before registration)
//
// Response shape:
// {
//   available: boolean,       — true if the college can still accept new registrations
//   collegeName: string,      — normalised college name
//   currentSlots: number,     — number of users already registered from this college
//   maxSlots: number,         — maximum registrations allowed for this college
//   remainingSlots: number,   — maxSlots - currentSlots (>= 0)
//   isOnAllowedList: boolean, — whether an AllowedCollege record exists for this college
//   isActive: boolean,        — whether the college is currently accepting registrations
//   enforceAllowedListOnly: boolean, — global config flag
//   message: string,          — human-readable status summary
// }
const checkCollegeAvailability = async (req, res) => {
  try {
    const rawName = (req.params.collegeName || "").trim();

    if (!rawName) {
      return res.status(400).json({ message: "College name is required" });
    }

    const config = await getOrInitConfig();

    // Escape special regex characters to avoid injection
    const escaped = rawName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp(`^${escaped}$`, "i");

    // Look up the AllowedCollege record
    const allowedRecord = await AllowedCollege.findOne({ collegeName: nameRegex });

    let maxSlots = config.defaultMaxTeamsPerCollege || 1;
    let isOnAllowedList = false;
    let isActive = true;

    if (allowedRecord) {
      isOnAllowedList = true;
      isActive = allowedRecord.isActive;
      maxSlots = allowedRecord.maxTeams || 1;
    }

    // If the college is NOT on the allowed list and the enforceAllowedListOnly flag is on,
    // it is simply not available — return immediately.
    if (!isOnAllowedList && config.enforceAllowedListOnly) {
      return res.status(200).json({
        available: false,
        collegeName: rawName,
        currentSlots: 0,
        maxSlots: 0,
        remainingSlots: 0,
        isOnAllowedList: false,
        isActive: false,
        enforceAllowedListOnly: true,
        message: `'${rawName}' is not on the list of colleges allowed to register for Semaphore 2026.`,
      });
    }

    // If the college is on the list but inactive — not available.
    if (isOnAllowedList && !isActive) {
      return res.status(200).json({
        available: false,
        collegeName: allowedRecord.collegeName,
        currentSlots: 0,
        maxSlots,
        remainingSlots: 0,
        isOnAllowedList: true,
        isActive: false,
        enforceAllowedListOnly: config.enforceAllowedListOnly,
        message: `Registration is currently closed for '${allowedRecord.collegeName}'.`,
      });
    }

    // Count actual registered users for this college (live count, not cached counter)
    const currentSlots = await User.countDocuments({
      collegeName: nameRegex,
    });

    const remainingSlots = Math.max(0, maxSlots - currentSlots);
    const available = remainingSlots > 0;

    const displayName = isOnAllowedList ? allowedRecord.collegeName : rawName;
    let message;
    if (available) {
      message =
        remainingSlots === 1
          ? `'${displayName}' has 1 registration slot remaining.`
          : `'${displayName}' has ${remainingSlots} registration slot(s) remaining.`;
    } else {
      message = `'${displayName}' has reached its maximum of ${maxSlots} registration(s) and is no longer accepting new sign-ups.`;
    }

    res.status(200).json({
      available,
      collegeName: displayName,
      currentSlots,
      maxSlots,
      remainingSlots,
      isOnAllowedList,
      isActive,
      enforceAllowedListOnly: config.enforceAllowedListOnly,
      message,
    });
  } catch (error) {
    console.error("Check College Availability Error:", error);
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
      collegeName: { $regex: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
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
        collegeName: { $regex: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
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

module.exports = {
  getAllowedColleges,
  checkCollegeAvailability,
  addAllowedCollege,
  updateAllowedCollege,
  deleteAllowedCollege,
  updateCollegeConfig,
  getOrInitConfig,
};
