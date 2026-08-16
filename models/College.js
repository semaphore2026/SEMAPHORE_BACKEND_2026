const mongoose = require("mongoose");

const collegeSchema = new mongoose.Schema(
  {
    collegeName: {
      type: String,
      required: [true, "College name is required"],
      unique: true,
      trim: true,
    },
    totalTeams: {
      type: Number,
      default: 0,
      min: [0, "Total teams cannot be less than 0"],
      max: [2, "A college can have a maximum of 2 teams only"],
    },
  },
  {
    timestamps: true,
  }
);

const College = mongoose.model("College", collegeSchema);

module.exports = College;
