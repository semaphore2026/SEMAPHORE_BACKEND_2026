const Team = require("../models/Team");
const User = require("../models/User");
const EventRegistration = require("../models/EventRegistrations");

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

// @desc    Delete user's team or specified team and clear teamid from user(s)
// @route   DELETE /api/teams/me, DELETE /api/teams/:id, DELETE /api/admin/teams/:id
// @access  Private (User or Admin)
const deleteTeam = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    const isAdmin = !!req.admin || (req.user && req.user.role === "admin");

    if (!userId && !isAdmin) {
      return res.status(401).json({ message: "Not authorized, token required" });
    }

    let user = null;
    if (userId) {
      user = await User.findById(userId);
    }

    // Determine target team ID from params, body, or user's assigned teamid
    const targetTeamId =
      req.params.id ||
      req.params.teamId ||
      (req.body && (req.body.teamId || req.body.id)) ||
      (user ? user.teamid : null);

    if (!targetTeamId) {
      return res.status(400).json({ message: "No team associated with user or specified to delete" });
    }

    // Find all team members associated with this team
    const teamMembers = await User.find({ teamid: targetTeamId }).select("_id");
    const memberUserIds = teamMembers.map((m) => m._id);

    // Cascade-delete all event registrations for this team's members
    if (memberUserIds.length > 0) {
      await EventRegistration.deleteMany({ userId: { $in: memberUserIds } });
    }

    // Unassign teamid from all users associated with this team
    await User.updateMany(
      { teamid: targetTeamId },
      { $set: { teamid: null } }
    );

    // Delete the team document if it exists
    const deletedTeam = await Team.findByIdAndDelete(targetTeamId);

    // Fetch updated user details if user exists in User collection
    const updatedUser = user ? await User.findById(userId).select("-password") : null;

    res.status(200).json({
      message: "Team deleted successfully and user team association cleared",
      deletedTeam: deletedTeam || null,
      user: updatedUser,
    });
  } catch (error) {
    console.error("Delete Team Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update team name for the user registered with that team
// @route   PUT /api/teams/update-name (also /me, /rename, /:id)
// @access  Private (User - Header Authorization required)
const updateTeamName = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;

    if (!userId) {
      return res.status(401).json({ message: "Not authorized, user token required" });
    }

    const user = await User.findById(userId);
    if (!user || !user.teamid) {
      return res.status(400).json({ message: "You are not registered with any team" });
    }

    const targetTeamId =
      req.params.id ||
      req.params.teamId ||
      (req.body && (req.body.teamId || req.body.id));

    if (targetTeamId && targetTeamId.toString() !== user.teamid.toString()) {
      return res.status(403).json({
        message: "Access denied. You can only edit the team name for the team you are registered with.",
      });
    }

    const { teamName, name, newName } = req.body;
    const inputName = teamName || name || newName;

    if (!inputName || !String(inputName).trim()) {
      return res.status(400).json({ message: "Please provide a valid new team name in the request body" });
    }

    const cleanName = String(inputName).trim();

    // Check if team name already exists for another team (case-insensitive)
    const existingTeam = await Team.findOne({
      _id: { $ne: user.teamid },
      name: { $regex: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    });

    if (existingTeam) {
      return res.status(400).json({
        message: `Team name must be unique. A team named '${cleanName}' already exists.`,
      });
    }

    // Update ONLY the team name property
    const updatedTeam = await Team.findByIdAndUpdate(
      user.teamid,
      { name: cleanName },
      { new: true, runValidators: true }
    );

    if (!updatedTeam) {
      return res.status(404).json({ message: "Registered team not found" });
    }

    res.status(200).json({
      message: "Team name updated successfully",
      team: updatedTeam,
    });
  } catch (error) {
    console.error("Update Team Name Error:", error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  setTeam,
  getMyTeam,
  deleteTeam,
  updateTeamName,
};


