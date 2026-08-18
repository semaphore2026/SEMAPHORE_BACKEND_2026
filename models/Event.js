const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Event title is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Event description is required"],
    },
    location: {
      type: String,
      required: [true, "Event location is required"],
    },
    date: {
      type: Date,
      required: [true, "Event date is required"],
    },
    capacity: {
      type: Number,
      default: 100,
      min: 1,
    },
    registrationFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    minParticipants: {
      type: Number,
      default: 1,
      min: [1, "Minimum participants must be at least 1"],
    },
    maxParticipants: {
      type: Number,
      default: 1,
      min: [1, "Maximum participants must be at least 1"],
    },
    image: {
      type: String,
      default: "",
    },
    coordinators: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    timings: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Timetable",
      },
    ],
  },
  {
    timestamps: true,
  }
);

const Event = mongoose.model("Event", eventSchema);

module.exports = Event;
