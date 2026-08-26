const mongoose = require("mongoose");

const backupRecordSchema = new mongoose.Schema(
  {
    originalPaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    paymentBackup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentBackup",
      required: true,
    },
    eventRegistrationBackups: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "EventRegistrationBackup",
      },
    ],
    deletedBy: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
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

const BackupRecord = mongoose.model("BackupRecord", backupRecordSchema);

module.exports = BackupRecord;
