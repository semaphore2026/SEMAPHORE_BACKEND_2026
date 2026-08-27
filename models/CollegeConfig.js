const mongoose = require("mongoose");

const collegeConfigSchema = new mongoose.Schema(
  {
    defaultMaxTeamsPerCollege: {
      type: Number,
      default: 1,
      min: [1, "Default max teams per college must be at least 1"],
    },
    enforceAllowedListOnly: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const CollegeConfig = mongoose.model("CollegeConfig", collegeConfigSchema);

module.exports = CollegeConfig;
