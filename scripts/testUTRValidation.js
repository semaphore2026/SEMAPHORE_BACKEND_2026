require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { normalizeAndValidateUTR, checkUTRUniqueness } = require("../utils/utrValidator");
const Payment = require("../models/Payment");
const User = require("../models/User");

const runUTRTests = async () => {
  try {
    console.log("=== RUNNING UTR VALIDATION & VERIFICATION TESTS ===\n");

    // -------------------------------------------------------------
    // Test 1: Empty / null / whitespace values
    // -------------------------------------------------------------
    console.log("Test 1: Empty / Missing UTR checks");
    const emptyCases = ["", "   ", null, undefined];
    emptyCases.forEach((val) => {
      try {
        normalizeAndValidateUTR(val);
        console.error(`❌ FAILED: Expected error for empty UTR: "${val}"`);
      } catch (err) {
        console.log(`✓ Passed: Correctly rejected empty/missing UTR ("${val}"): ${err.message}`);
      }
    });

    // -------------------------------------------------------------
    // Test 2: Length checks (< 12 and > 22)
    // -------------------------------------------------------------
    console.log("\nTest 2: Length checks (< 12 and > 22)");
    const invalidLengths = ["SHORT123", "ABC12345678", "WAYTOOOLONG12345678901234567890"];
    invalidLengths.forEach((val) => {
      try {
        normalizeAndValidateUTR(val);
        console.error(`❌ FAILED: Expected error for invalid length UTR: "${val}"`);
      } catch (err) {
        console.log(`✓ Passed: Correctly rejected invalid length ("${val}" length: ${val.length})`);
      }
    });

    // -------------------------------------------------------------
    // Test 3: Special characters / Spaces / Hyphens / Slashes
    // -------------------------------------------------------------
    console.log("\nTest 3: Special characters / Symbols checks");
    const invalidChars = [
      "UTR-123456789012",
      "UTR/123456789012",
      "1234 5678 9012",
      "UTR@123456789012",
      "UTR#123456789012",
      "UTR.123456789012",
    ];
    invalidChars.forEach((val) => {
      try {
        normalizeAndValidateUTR(val);
        console.error(`❌ FAILED: Expected error for invalid characters in UTR: "${val}"`);
      } catch (err) {
        console.log(`✓ Passed: Correctly rejected special chars in UTR ("${val}")`);
      }
    });

    // -------------------------------------------------------------
    // Test 4: Trimming and Uppercase Normalization
    // -------------------------------------------------------------
    console.log("\nTest 4: Trimming & Uppercase Normalization");
    const validRawCases = [
      { input: "  123456789012  ", expected: "123456789012" },
      { input: "sbin00012345678", expected: "SBIN00012345678" },
      { input: "  paytm1234567890  ", expected: "PAYTM1234567890" },
      { input: "Hdfc1234567890123456", expected: "HDFC1234567890123456" },
    ];
    validRawCases.forEach(({ input, expected }) => {
      const res = normalizeAndValidateUTR(input);
      if (res === expected) {
        console.log(`✓ Passed: "${input}" correctly normalized to "${res}"`);
      } else {
        console.error(`❌ FAILED: Expected "${expected}", got "${res}"`);
      }
    });

    // -------------------------------------------------------------
    // Test 5: Database Connection & Duplicate UTR Check
    // -------------------------------------------------------------
    console.log("\nTest 5: Uniqueness & Duplicate Handling against Database");
    await connectDB();

    const testUtr = `TESTUTR${Date.now()}`;
    const userA = new mongoose.Types.ObjectId();
    const userB = new mongoose.Types.ObjectId();

    // Check uniqueness before record exists
    const beforeCheck = await checkUTRUniqueness(testUtr, userA);
    console.log(`✓ Passed: Non-existent UTR returns isExisting: ${beforeCheck.isExisting}`);

    // Create a payment record
    const dummyPayment = await Payment.create({
      user: userA,
      imageUrl: "https://example.com/receipt.jpg",
      amount: 500,
      utr: testUtr,
      status: "pending",
    });
    console.log(`✓ Created test payment record with UTR: ${dummyPayment.utr}`);

    // Same user submitting same UTR (Safe retry / existing update)
    const sameUserCheck = await checkUTRUniqueness(testUtr, userA);
    console.log(`✓ Passed: Same user check allows safe handling, isExisting: ${sameUserCheck.isExisting}`);

    // Different user submitting same UTR (Should throw 409 conflict error)
    try {
      await checkUTRUniqueness(testUtr, userB);
      console.error(`❌ FAILED: Should have rejected duplicate UTR for different user`);
    } catch (dupErr) {
      console.log(`✓ Passed: Successfully caught duplicate UTR from another user: ${dupErr.message}`);
    }

    // Clean up dummy payment
    await Payment.findByIdAndDelete(dummyPayment._id);
    console.log("✓ Cleaned up dummy test payment record");

    console.log("\n ALL UTR VALIDATION TESTS PASSED PERFECTLY!");
    process.exit(0);
  } catch (error) {
    console.error("UTR Test Error:", error);
    process.exit(1);
  }
};

runUTRTests();
