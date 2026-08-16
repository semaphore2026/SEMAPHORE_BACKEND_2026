const mongoose = require("mongoose");

const timetableSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, "Date is required for the timetable slot"],
    },
    startTime: {
      type: String,
      required: [true, "Start time is required"],
    },
    endTime: {
      type: String,
      required: [true, "End time is required"],
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: [true, "Event reference is required"],
    },
    location: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const Timetable = mongoose.model("Timetable", timetableSchema);

module.exports = Timetable;
