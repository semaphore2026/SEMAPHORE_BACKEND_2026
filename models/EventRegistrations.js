const mongoose = require("mongoose");

const eventRegistrationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    events: [
      {
        eventId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Event",
          required: true,
        },
        paymentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Payment",
          default: null,
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    timestamp: {
      type: Date,
      default: Date.now,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "submitted", "approved", "verified", "rejected"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

const EventRegistration = mongoose.model(
  "EventRegistrations",
  eventRegistrationSchema
);

module.exports = EventRegistration;
