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
      required: [true, "UTR number is required for payment verification"],
      trim: true,
      uppercase: true,
      match: [
        /^[A-Z0-9]{12,22}$/,
        "UTR must be 12 to 22 alphanumeric characters (letters and numbers only)",
      ],
      sparse: true,
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
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual alias for imageurl (lowercase)
paymentSchema.virtual("imageurl").get(function () {
  return this.imageUrl;
});

// Virtual alias for approved_by (snake_case)
paymentSchema.virtual("approved_by").get(function () {
  return this.approvedBy;
});

// Internal Auto-Backup Middleware on Payment deletion
paymentSchema.pre("findOneAndDelete", async function () {
  try {
    const { createBackupForPayment } = require("../utils/backupHelper");
    const docToQuery = await this.model.findOne(this.getQuery());
    if (docToQuery) {
      await createBackupForPayment(docToQuery);
    }
  } catch (err) {
    console.error("Payment pre-findOneAndDelete auto-backup error:", err);
  }
});

paymentSchema.pre("deleteOne", { document: true, query: false }, async function () {
  try {
    const { createBackupForPayment } = require("../utils/backupHelper");
    await createBackupForPayment(this);
  } catch (err) {
    console.error("Payment pre-deleteOne auto-backup error:", err);
  }
});

paymentSchema.pre("deleteOne", { document: false, query: true }, async function () {
  try {
    const { createBackupForPayment } = require("../utils/backupHelper");
    const docs = await this.model.find(this.getQuery());
    for (const doc of docs) {
      await createBackupForPayment(doc);
    }
  } catch (err) {
    console.error("Payment pre-deleteOne query auto-backup error:", err);
  }
});

const Payment = mongoose.model("Payment", paymentSchema);

module.exports = Payment;

