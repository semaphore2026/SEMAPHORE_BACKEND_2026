const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    imageUrl: {
      type: String,
      required: [true, "Payment screenshot image is required"],
    },
    amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    utr: {
      type: String,
      trim: true,
      default: "",
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["pending", "submitted", "approved", "verified", "rejected"],
      default: "pending",
    },
    message: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual alias for imageurl (lowercase) for API consumers expecting imageurl
paymentSchema.virtual("imageurl").get(function () {
  return this.imageUrl;
});

const Payment = mongoose.model("Payment", paymentSchema);

module.exports = Payment;
