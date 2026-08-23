const mongoose = require("mongoose");

const eventRegistrationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    paymentId: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Payment",
      },
    ],
    participants: [
      {
        name: { type: String, trim: true, default: "" },
        phone: { type: String, trim: true, default: "" },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual alias for userid and eventid
eventRegistrationSchema.virtual("userid").get(function () {
  return this.userId;
});

eventRegistrationSchema.virtual("eventid").get(function () {
  return this.eventId;
});

const EventRegistration = mongoose.model(
  "EventRegistrations",
  eventRegistrationSchema
);

module.exports = EventRegistration;
