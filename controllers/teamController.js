const Team = require("../models/Team");
const User = require("../models/User");

// @desc    Set or create a unique team for a user
// @route   POST /api/teams/set-team (also /api/teams)
// @access  Private (User - Header Authorization required)
const setTeam = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;

    if (!userId) {
      return res.status(401).json({ message: "Not authorized, user token required" });
    }

    const { teamName, name } = req.body;
    const targetName = teamName || name;

    if (!targetName || !String(targetName).trim()) {
      return res.status(400).json({ message: "Please provide a valid teamName in the request body" });
    }

    const cleanName = String(targetName).trim();

    // Check if team name already exists (case-insensitive)
    const existingTeam = await Team.findOne({
      name: { $regex: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    });

    if (existingTeam) {
      return res.status(400).json({
        message: `Team name must be unique over other teams. A team named '${cleanName}' already exists.`,
      });
    }

    // Create new Team document
    const newTeam = await Team.create({
      name: cleanName,
    });

    // Assign teamid to the user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { teamid: newTeam._id },
      { new: true }
    ).select("-password").populate("teamid");

    res.status(201).json({
      message: "Team created and assigned successfully",
      team: newTeam,
      user: updatedUser,
    });
  } catch (error) {
    console.error("Set Team Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user's current team details
// @route   GET /api/teams/me
// @access  Private (User)
const getMyTeam = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate("teamid");

    if (!user || !user.teamid) {
      return res.status(404).json({ message: "No team set for this user yet" });
    }

    res.status(200).json({
      team: user.teamid,
    });
  } catch (error) {
    console.error("Get My Team Error:", error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  setTeam,
  getMyTeam,
};
