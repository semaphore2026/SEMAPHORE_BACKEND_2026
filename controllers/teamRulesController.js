const TeamRules = require("../models/TeamRules");

const DEFAULT_DUMMY_RULES = [
  "Each college can register a maximum of two teams (Team 1 and Team 2).",
  "Every team must have a designated Team Leader who acts as the primary point of contact.",
  "A participant cannot be a member of multiple teams or represent more than one college.",
  "All team members must carry their official college ID cards and registration pass throughout the fest.",
  "Points earned by team members in individual and group events will accumulate towards the Overall Championship Trophy.",
  "Team registrations and participant substitutions must be finalized prior to the event schedule commencement.",
  "Use of unfair means, plagiarism, or indiscipline will result in immediate disqualification of the team.",
  "Decisions made by the event judges and organizing committee are final and binding."
];

// Helper to handle errors
const handleError = (res, error) => {
  if (error.name === "ValidationError") {
    const messages = Object.values(error.errors).map((val) => val.message);
    return res.status(400).json({ success: false, message: messages[0] });
  }
  if (error.name === "CastError") {
    return res.status(400).json({ success: false, message: "Invalid ID" });
  }
  res.status(500).json({ success: false, message: error.message || "Internal Server Error" });
};

// @desc    Get Team Rules (Public - anyone can access)
// @route   GET /api/team-rules or GET /api/teamrules
// @access  Public
const getTeamRules = async (req, res) => {
  try {
    let rulesDoc = await TeamRules.findOne({ isActive: true }).sort({ updatedAt: -1 });

    // If no rules exist in the database yet, auto-create initial dummy rules
    if (!rulesDoc) {
      rulesDoc = await TeamRules.create({
        title: "Semaphore 2026 - Team Rules & Guidelines",
        description: "Official pointwise rules and guidelines for all participating teams and college contingents.",
        rules: DEFAULT_DUMMY_RULES,
        category: "general",
        isActive: true,
      });
    }

    res.status(200).json({
      success: true,
      message: "Team rules retrieved successfully",
      data: {
        id: rulesDoc._id,
        title: rulesDoc.title,
        description: rulesDoc.description,
        category: rulesDoc.category,
        rules: rulesDoc.rules,
        isActive: rulesDoc.isActive,
        createdAt: rulesDoc.createdAt,
        updatedAt: rulesDoc.updatedAt,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
};

// @desc    Get All Team Rules entries (Admin)
// @route   GET /api/team-rules/all
// @access  Private (Admin)
const getAllTeamRules = async (req, res) => {
  try {
    let allRules = await TeamRules.find().sort({ createdAt: -1 });

    if (allRules.length === 0) {
      const initialDoc = await TeamRules.create({
        title: "Semaphore 2026 - Team Rules & Guidelines",
        description: "Official pointwise rules and guidelines for all participating teams and college contingents.",
        rules: DEFAULT_DUMMY_RULES,
        category: "general",
        isActive: true,
      });
      allRules = [initialDoc];
    }

    res.status(200).json({
      success: true,
      count: allRules.length,
      data: allRules,
    });
  } catch (error) {
    handleError(res, error);
  }
};

// @desc    Create new Team Rules document (Admin)
// @route   POST /api/team-rules
// @access  Private (Admin)
const createTeamRules = async (req, res) => {
  try {
    const { title, description, rules, category, isActive } = req.body;

    if (!rules || !Array.isArray(rules) || rules.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Rules must be a non-empty array of strings",
      });
    }

    // Filter out empty string items and trim
    const formattedRules = rules.map((r) => String(r).trim()).filter(Boolean);

    if (formattedRules.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one valid rule text",
      });
    }

    const newRules = await TeamRules.create({
      title: title || "Team Rules & Guidelines",
      description: description || "General rules, regulations, and guidelines for all participating teams.",
      rules: formattedRules,
      category: category || "general",
      isActive: isActive !== undefined ? isActive : true,
    });

    res.status(201).json({
      success: true,
      message: "Team rules created successfully",
      data: newRules,
    });
  } catch (error) {
    handleError(res, error);
  }
};

// @desc    Update Team Rules (Admin - by ID or update latest)
// @route   PUT /api/team-rules/:id or PUT /api/team-rules
// @access  Private (Admin)
const updateTeamRules = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, rules, category, isActive } = req.body;

    let targetDoc;
    if (id) {
      targetDoc = await TeamRules.findById(id);
    } else {
      targetDoc = await TeamRules.findOne().sort({ updatedAt: -1 });
    }

    if (!targetDoc) {
      return res.status(404).json({
        success: false,
        message: "Team rules document not found",
      });
    }

    if (title !== undefined) targetDoc.title = title;
    if (description !== undefined) targetDoc.description = description;
    if (category !== undefined) targetDoc.category = category;
    if (isActive !== undefined) targetDoc.isActive = isActive;

    if (rules !== undefined) {
      if (!Array.isArray(rules) || rules.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Rules must be a non-empty array of strings",
        });
      }
      const formattedRules = rules.map((r) => String(r).trim()).filter(Boolean);
      if (formattedRules.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Please provide at least one valid rule text",
        });
      }
      targetDoc.rules = formattedRules;
    }

    const updated = await targetDoc.save();

    res.status(200).json({
      success: true,
      message: "Team rules updated successfully",
      data: updated,
    });
  } catch (error) {
    handleError(res, error);
  }
};

// @desc    Delete Team Rules document (Admin)
// @route   DELETE /api/team-rules/:id
// @access  Private (Admin)
const deleteTeamRules = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await TeamRules.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Team rules not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Team rules deleted successfully",
    });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  getTeamRules,
  getAllTeamRules,
  createTeamRules,
  updateTeamRules,
  deleteTeamRules,
};
