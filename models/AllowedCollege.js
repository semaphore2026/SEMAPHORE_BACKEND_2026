const mongoose = require("mongoose");

const allowedCollegeSchema = new mongoose.Schema(
  {
    collegeName: {
      type: String,
      required: [true, "College name is required"],
      unique: true,
      trim: true,
    },
    maxTeams: {
      type: Number,
      default: 1,
      min: [1, "Max teams per college must be at least 1"],
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

const AllowedCollege = mongoose.model("AllowedCollege", allowedCollegeSchema);

module.exports = AllowedCollege;
