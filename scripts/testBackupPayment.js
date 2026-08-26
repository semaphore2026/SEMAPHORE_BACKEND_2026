require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Payment = require("../models/Payment");
const EventRegistration = require("../models/EventRegistrations");
const Event = require("../models/Event");
const User = require("../models/User");
const PaymentBackup = require("../models/PaymentBackup");
const EventRegistrationBackup = require("../models/EventRegistrationBackup");
const BackupRecord = require("../models/BackupRecord");
const {
  deletePayment,
  getBackupPayments,
  getBackupPaymentDetails,
} = require("../controllers/adminController");

const runBackupPaymentTest = async () => {
  try {
    console.log("=== RUNNING PAYMENT & EVENT REGISTRATION BACKUP TEST ===\n");

    await connectDB();

    // 1. Create test User
    const testUser = await User.create({
      name: "Backup Test User",
      email: `backuptest_${Date.now()}@example.com`,
      password: "password123",
      collegeName: "Backup College",
    });
    console.log(`✓ Created test user: ${testUser._id}`);

    // 2. Create test Event
    const testEvent = await Event.create({
      title: "Backup Test Event",
      description: "Testing payment and registration backups",
      location: "Virtual Hall",
      date: new Date(),
      registrationFee: 450,
      minParticipants: 1,
      maxParticipants: 2,
    });
    console.log(`✓ Created test event: ${testEvent._id}`);

    // 3. Create test Payment A (To test deletePayment controller auto-backup)
    const testPaymentA = await Payment.create({
      user: testUser._id,
      imageUrl: "https://example.com/backup_screenshot_a.png",
      amount: 450,
      utr: `BACKUPA${Date.now().toString().slice(-8)}`,
      status: "approved",
    });
    console.log(`✓ Created test payment A: ${testPaymentA._id} with UTR: ${testPaymentA.utr}`);

    // 4. Create EventRegistration linked to testPaymentA
    const regA = await EventRegistration.create({
      userId: testUser._id,
      eventId: testEvent._id,
      paymentId: [testPaymentA._id],
      participants: [{ name: "Backup Participant A", phone: "9876543210" }],
    });
    console.log(`✓ Created test event registration A: ${regA._id}`);

    // 5. Invoke deletePayment via mock express req/res
    const reqDelete = {
      params: { paymentId: testPaymentA._id.toString() },
      admin: { _id: new mongoose.Types.ObjectId(), name: "Test Admin", role: "admin" },
    };

    let resStatus = 0;
    let resJson = null;
    const resMock = {
      status: (code) => {
        resStatus = code;
        return {
          json: (data) => {
            resJson = data;
          },
        };
      },
      json: (data) => {
        resStatus = 200;
        resJson = data;
      },
    };

    console.log("\nExecuting deletePayment controller for Payment A...");
    await deletePayment(reqDelete, resMock);

    console.log(`Response Status: ${resStatus}`);
    console.log("Delete Response Data:", JSON.stringify(resJson, null, 2));

    if (resStatus !== 200) {
      throw new Error(`Expected HTTP 200 but got ${resStatus}`);
    }

    // 6. Verify Payment A is deleted from Payment collection
    const deletedCheckA = await Payment.findById(testPaymentA._id);
    if (deletedCheckA !== null) {
      throw new Error(`Payment A ${testPaymentA._id} still exists in Payment collection!`);
    }
    console.log(`✓ Verified Payment A removed from main Payment collection.`);

    // 7. Verify BackupRecord, PaymentBackup, and EventRegistrationBackup exist
    const backupRecordA = await BackupRecord.findOne({
      originalPaymentId: testPaymentA._id,
    });
    if (!backupRecordA) {
      throw new Error(`BackupRecord for Payment A not found!`);
    }
    console.log(`✓ BackupRecord created for Payment A: ${backupRecordA._id}`);

    const paymentBackupA = await PaymentBackup.findById(backupRecordA.paymentBackup);
    if (!paymentBackupA) {
      throw new Error(`PaymentBackup document not found!`);
    }
    if (paymentBackupA.utr !== testPaymentA.utr) {
      throw new Error(`Expected UTR ${testPaymentA.utr} in PaymentBackup, got ${paymentBackupA.utr}`);
    }
    console.log(`✓ PaymentBackup verified with UTR: ${paymentBackupA.utr}`);

    if (!backupRecordA.eventRegistrationBackups || backupRecordA.eventRegistrationBackups.length !== 1) {
      throw new Error(`Expected 1 backed-up event registration, got ${backupRecordA.eventRegistrationBackups.length}`);
    }
    const regBackupA = await EventRegistrationBackup.findById(backupRecordA.eventRegistrationBackups[0]);
    if (!regBackupA) {
      throw new Error(`EventRegistrationBackup document not found!`);
    }
    console.log(`✓ EventRegistrationBackup verified for original registration: ${regBackupA.originalRegistrationId}`);

    // 8. Test Read-Only Endpoint: getBackupPayments
    console.log("\nTesting getBackupPayments controller...");
    let listStatus = 0;
    let listJson = null;
    const resListMock = {
      status: (code) => {
        listStatus = code;
        return { json: (d) => { listJson = d; } };
      },
      json: (d) => {
        listStatus = 200;
        listJson = d;
      },
    };

    await getBackupPayments({}, resListMock);
    console.log(`getBackupPayments status: ${listStatus}, count: ${listJson?.count}`);

    if (listStatus !== 200 || !Array.isArray(listJson?.backupPayments)) {
      throw new Error(`Failed to list backup payments properly!`);
    }
    const foundBackupInList = listJson.backupPayments.find(
      (b) => String(b.originalPaymentId) === String(testPaymentA._id)
    );
    if (!foundBackupInList) {
      throw new Error(`Backup for Payment A not found in getBackupPayments list response!`);
    }
    console.log(`✓ Verified Payment A backup present in getBackupPayments list response.`);

    // 9. Test Read-Only Endpoint: getBackupPaymentDetails
    console.log("\nTesting getBackupPaymentDetails controller...");
    const reqDetails = {
      params: { backupId: backupRecordA._id.toString() },
    };
    let detailsStatus = 0;
    let detailsJson = null;
    const resDetailsMock = {
      status: (code) => {
        detailsStatus = code;
        return { json: (d) => { detailsJson = d; } };
      },
      json: (d) => {
        detailsStatus = 200;
        detailsJson = d;
      },
    };

    await getBackupPaymentDetails(reqDetails, resDetailsMock);
    console.log(`getBackupPaymentDetails status: ${detailsStatus}`);
    console.log("Backup Details Response:", JSON.stringify(detailsJson, null, 2));

    if (detailsStatus !== 200 || !detailsJson.payment || detailsJson.eventsCount !== 1) {
      throw new Error(`Failed to retrieve backup payment details correctly!`);
    }
    console.log(`✓ Verified getBackupPaymentDetails returns formatted payment and associated backed-up events.`);

    // 10. Test Internal Auto-Backup on Payment.findByIdAndDelete directly
    console.log("\nTesting Internal Direct Payment.findByIdAndDelete Auto-Backup Hook...");
    const testPaymentB = await Payment.create({
      user: testUser._id,
      imageUrl: "https://example.com/backup_screenshot_b.png",
      amount: 300,
      utr: `BACKUPB${Date.now().toString().slice(-8)}`,
      status: "pending",
    });
    console.log(`✓ Created test payment B: ${testPaymentB._id}`);

    // Internal direct delete
    await Payment.findByIdAndDelete(testPaymentB._id);

    const backupRecordB = await BackupRecord.findOne({
      originalPaymentId: testPaymentB._id,
    });
    if (!backupRecordB) {
      throw new Error(`Internal auto-backup failed for direct Payment.findByIdAndDelete!`);
    }
    console.log(`✓ Internal auto-backup hook successfully created BackupRecord ${backupRecordB._id} for Payment B!`);

    // Clean up test data
    console.log("\nCleaning up test entities...");
    await BackupRecord.deleteMany({ _id: { $in: [backupRecordA._id, backupRecordB._id] } });
    await PaymentBackup.deleteMany({ originalPaymentId: { $in: [testPaymentA._id, testPaymentB._id] } });
    await EventRegistrationBackup.deleteMany({ userId: testUser._id });
    await EventRegistration.deleteMany({ _id: regA._id });
    await Event.deleteMany({ _id: testEvent._id });
    await User.findByIdAndDelete(testUser._id);
    console.log(`✓ Cleanup completed successfully.`);

    console.log("\n=== ALL PAYMENT & REGISTRATION BACKUP TESTS PASSED SUCCESSFULLY! ===");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ BACKUP PAYMENT TEST FAILED:", error);
    process.exit(1);
  }
};

runBackupPaymentTest();
