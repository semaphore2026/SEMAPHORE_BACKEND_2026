const mongoose = require("mongoose");

const transactionLogSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      index: true,
    },
    method: {
      type: String,
      required: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
    },
    statusCode: {
      type: Number,
      required: true,
      index: true,
    },
    duration: {
      type: Number,
      default: 0,
    },
    user: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    queryParams: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    requestParams: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    requestBody: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    responseData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    errorDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    formattedTime: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for fast paginated retrieval sorted by latest logs first
transactionLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("TransactionLog", transactionLogSchema);
