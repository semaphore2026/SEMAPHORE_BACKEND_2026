const mongoose = require("mongoose");

const paymentBackupSchema = new mongoose.Schema(
  {
    originalPaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    imageUrl: {
      type: String,
      default: "",
    },
    amount: {
      type: Number,
      default: 0,
    },
    utr: {
      type: String,
      default: "",
    },
    timestamp: {
      type: Date,
    },
    status: {
      type: String,
      default: "pending",
    },
    message: {
      type: String,
      default: "",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    deletedAt: {
      type: Date,
      default: Date.now,
    },
    deletedBy: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual aliases matching Payment model
paymentBackupSchema.virtual("imageurl").get(function () {
  return this.imageUrl;
});

paymentBackupSchema.virtual("approved_by").get(function () {
  return this.approvedBy;
});

const PaymentBackup = mongoose.model("PaymentBackup", paymentBackupSchema);

module.exports = PaymentBackup;
