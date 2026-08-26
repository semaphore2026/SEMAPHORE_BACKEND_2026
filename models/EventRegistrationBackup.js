const mongoose = require("mongoose");

const eventRegistrationBackupSchema = new mongoose.Schema(
  {
    originalRegistrationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
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
        email: { type: String, trim: true, default: "" },
      },
    ],
    deletedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual aliases
eventRegistrationBackupSchema.virtual("userid").get(function () {
  return this.userId;
});

eventRegistrationBackupSchema.virtual("eventid").get(function () {
  return this.eventId;
});

const EventRegistrationBackup = mongoose.model(
  "EventRegistrationBackup",
  eventRegistrationBackupSchema
);

module.exports = EventRegistrationBackup;
