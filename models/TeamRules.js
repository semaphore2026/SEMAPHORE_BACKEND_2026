const mongoose = require("mongoose");

const teamRulesSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      default: "Team Rules & Guidelines",
      trim: true,
    },
    description: {
      type: String,
      default: "General rules, regulations, and guidelines for all participating teams.",
      trim: true,
    },
    rules: {
      type: [String],
      required: [true, "Rules array is required"],
      validate: {
        validator: function (arr) {
          return Array.isArray(arr) && arr.length > 0;
        },
        message: "At least one rule point must be provided",
      },
    },
    category: {
      type: String,
      default: "general",
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const TeamRules = mongoose.model("TeamRules", teamRulesSchema);

module.exports = TeamRules;
