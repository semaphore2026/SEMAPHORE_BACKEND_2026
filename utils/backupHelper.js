const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const EventRegistration = require("../models/EventRegistrations");
const PaymentBackup = require("../models/PaymentBackup");
const EventRegistrationBackup = require("../models/EventRegistrationBackup");
const BackupRecord = require("../models/BackupRecord");

/**
 * Creates backup entries in PaymentBackup and EventRegistrationBackup,
 * and records their references in BackupRecord when a payment is deleted.
 *
 * @param {String|Object} paymentOrId Payment ID or Payment Document
 * @param {String|Object} [deletedBy=null] ID or details of the admin/user performing deletion
 * @returns {Promise<Object|null>} Created BackupRecord document
 */
const createBackupForPayment = async (paymentOrId, deletedBy = null) => {
  try {
    let paymentDoc = null;

    if (paymentOrId && typeof paymentOrId === "object" && paymentOrId._id) {
      paymentDoc = paymentOrId;
    } else if (paymentOrId && mongoose.Types.ObjectId.isValid(paymentOrId)) {
      paymentDoc = await Payment.findById(paymentOrId);
    }

    if (!paymentDoc) {
      return null;
    }

    // Prevent duplicate backup for the same payment if already backed up
    const existingBackup = await BackupRecord.findOne({
      originalPaymentId: paymentDoc._id,
    });
    if (existingBackup) {
      return existingBackup;
    }

    const targetPaymentObjId = new mongoose.Types.ObjectId(paymentDoc._id);
    const targetPaymentStr = paymentDoc._id.toString();

    // Find all EventRegistration documents linked to this paymentId
    const affectedRegistrations = await EventRegistration.find({
      paymentId: { $in: [targetPaymentObjId, targetPaymentStr] },
    });

    // 1. Create PaymentBackup entry
    const paymentBackupDoc = await PaymentBackup.create({
      originalPaymentId: paymentDoc._id,
      user: paymentDoc.user,
      imageUrl: paymentDoc.imageUrl,
      amount: paymentDoc.amount,
      utr: paymentDoc.utr,
      timestamp: paymentDoc.timestamp || paymentDoc.createdAt,
      status: paymentDoc.status,
      message: paymentDoc.message || "",
      approvedBy: paymentDoc.approvedBy || null,
      deletedBy: deletedBy || null,
      deletedAt: new Date(),
    });

    // 2. Create EventRegistrationBackup entries
    const eventRegistrationBackupDocs = await Promise.all(
      affectedRegistrations.map(async (reg) => {
        return await EventRegistrationBackup.create({
          originalRegistrationId: reg._id,
          userId: reg.userId,
          eventId: reg.eventId,
          paymentId: reg.paymentId || [],
          participants: Array.isArray(reg.participants) ? reg.participants : [],
          deletedAt: new Date(),
        });
      })
    );

    // 3. Create BackupRecord entry storing references to payment and event registration backups
    const backupRecordDoc = await BackupRecord.create({
      originalPaymentId: paymentDoc._id,
      paymentBackup: paymentBackupDoc._id,
      eventRegistrationBackups: eventRegistrationBackupDocs.map((b) => b._id),
      deletedBy: deletedBy || null,
      deletedAt: new Date(),
    });

    return backupRecordDoc;
  } catch (error) {
    console.error("Error creating payment backup record:", error);
    throw error;
  }
};

module.exports = {
  createBackupForPayment,
};
