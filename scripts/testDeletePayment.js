require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Payment = require("../models/Payment");
const EventRegistration = require("../models/EventRegistrations");
const Event = require("../models/Event");
const User = require("../models/User");
const { deletePayment } = require("../controllers/adminController");

const runDeletePaymentTest = async () => {
  try {
    console.log("=== RUNNING ADMIN DELETE PAYMENT TEST ===\n");

    await connectDB();

    // 1. Create test User
    const testUser = await User.create({
      name: "Payment Delete Test User",
      email: `deletepay_${Date.now()}@example.com`,
      password: "password123",
      collegeName: "Test College",
    });
    console.log(`✓ Created test user: ${testUser._id}`);

    // 2. Create test Event
    const testEventA = await Event.create({
      title: "Test Event A",
      description: "Test Description A",
      location: "Main Auditorium",
      date: new Date(),
      registrationFee: 500,
      minParticipants: 1,
      maxParticipants: 2,
    });

    const testEventB = await Event.create({
      title: "Test Event B",
      description: "Test Description B",
      location: "Lab 1",
      date: new Date(),
      registrationFee: 300,
      minParticipants: 1,
      maxParticipants: 2,
    });
    console.log(`✓ Created test events: ${testEventA._id}, ${testEventB._id}`);

    // 3. Create test Payment (e.g., Payment ID 23 mock)
    const testPayment = await Payment.create({
      user: testUser._id,
      imageUrl: "https://example.com/screenshot.png",
      amount: 800,
      utr: `DELPAY${Date.now().toString().slice(-8)}`,
      status: "approved",
    });
    console.log(`✓ Created test payment record: ${testPayment._id} with UTR: ${testPayment.utr}`);

    // 4. Create EventRegistration A and B referencing testPayment._id
    const regA = await EventRegistration.create({
      userId: testUser._id,
      eventId: testEventA._id,
      paymentId: [testPayment._id],
      participants: [{ name: "Participant A", phone: "9999999999" }],
    });

    const regB = await EventRegistration.create({
      userId: testUser._id,
      eventId: testEventB._id,
      paymentId: [testPayment._id],
      participants: [{ name: "Participant B", phone: "8888888888" }],
    });
    console.log(`✓ Created test event registrations A (${regA._id}) and B (${regB._id}) linked to payment ${testPayment._id}`);

    // 5. Invoke deletePayment via mock express req/res
    const req = {
      params: { paymentId: testPayment._id.toString() },
      admin: { name: "Test Admin", role: "admin" },
    };

    let resStatus = 0;
    let resJson = null;

    const res = {
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

    console.log("\nExecuting deletePayment controller function...");
    await deletePayment(req, res);

    console.log(`\nResponse Status: ${resStatus}`);
    console.log("Response Data:", JSON.stringify(resJson, null, 2));

    // 6. Assertions
    if (resStatus !== 200) {
      throw new Error(`Expected HTTP 200 but got ${resStatus}`);
    }

    // Check payment is deleted
    const deletedPaymentCheck = await Payment.findById(testPayment._id);
    if (deletedPaymentCheck !== null) {
      throw new Error(`Payment ${testPayment._id} still exists in database!`);
    }
    console.log(`\n✓ Verified Payment record ${testPayment._id} has been completely removed from DB.`);

    // Check EventRegistration A and B
    const updatedRegA = await EventRegistration.findById(regA._id);
    const updatedRegB = await EventRegistration.findById(regB._id);

    if (updatedRegA.paymentId.includes(testPayment._id)) {
      throw new Error(`EventRegistration A still contains payment ${testPayment._id}`);
    }
    if (updatedRegB.paymentId.includes(testPayment._id)) {
      throw new Error(`EventRegistration B still contains payment ${testPayment._id}`);
    }
    console.log(`✓ Verified Payment ID ${testPayment._id} removed from EventRegistration A and B paymentId arrays.`);

    // Verify response indicates status is updated to "yet_to_pay" (Not Paid)
    const affectedRegs = resJson.affectedRegistrations || [];
    const regAStatus = affectedRegs.find((r) => String(r.registrationId) === String(regA._id))?.paymentStatus;
    const regBStatus = affectedRegs.find((r) => String(r.registrationId) === String(regB._id))?.paymentStatus;

    if (regAStatus !== "yet_to_pay" || regBStatus !== "yet_to_pay") {
      throw new Error(`Expected registrations status to be 'yet_to_pay', but got regA: ${regAStatus}, regB: ${regBStatus}`);
    }
    console.log(`✓ Verified EventRegistration A and B payment status updated to 'yet_to_pay' (Not Paid).`);

    // Clean up test entities
    await EventRegistration.deleteMany({ _id: { $in: [regA._id, regB._id] } });
    await Event.deleteMany({ _id: { $in: [testEventA._id, testEventB._id] } });
    await User.findByIdAndDelete(testUser._id);
    console.log(`\n✓ Cleaned up all test data successfully.`);

    console.log("\n=== ALL DELETE PAYMENT TESTS PASSED SUCCESSFULLY! ===");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ DELETE PAYMENT TEST FAILED:", error.message);
    process.exit(1);
  }
};

runDeletePaymentTest();
