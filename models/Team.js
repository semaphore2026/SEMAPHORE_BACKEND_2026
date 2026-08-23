const mongoose = require("mongoose");

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Team name is required"],
      unique: true,
      trim: true,
    },
    teamid: {
      type: String,
      unique: true,
      default: function () {
        return `TEAM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      },
    },
  },
  {
    timestamps: true,
  }
);

const Team = mongoose.model("Team", teamSchema);

module.exports = Team;
