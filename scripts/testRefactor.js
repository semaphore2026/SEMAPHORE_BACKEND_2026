const mongoose = require("mongoose");
const Team = require("../models/Team");
const User = require("../models/User");
const Payment = require("../models/Payment");
const EventRegistration = require("../models/EventRegistrations");

console.log("=== Testing Models & Refactoring Setup ===");

// Check Team model schema
const teamSchemaKeys = Object.keys(Team.schema.paths);
console.log("Team schema fields:", teamSchemaKeys);
if (!teamSchemaKeys.includes("name") || !teamSchemaKeys.includes("teamid")) {
  console.error("FAILED: Team schema missing name or teamid!");
  process.exit(1);
}

// Check User model schema
const userSchemaKeys = Object.keys(User.schema.paths);
console.log("User schema fields include teamid:", userSchemaKeys.includes("teamid"));
if (!userSchemaKeys.includes("teamid")) {
  console.error("FAILED: User schema missing teamid!");
  process.exit(1);
}

// Check Payment model schema
const paymentSchemaKeys = Object.keys(Payment.schema.paths);
console.log("Payment schema fields:", paymentSchemaKeys);
const requiredPaymentFields = ["amount", "utr", "imageUrl", "timestamp", "status", "message", "user", "approvedBy"];
const missingPaymentFields = requiredPaymentFields.filter((f) => !paymentSchemaKeys.includes(f));
if (missingPaymentFields.length > 0) {
  console.error("FAILED: Payment schema missing fields:", missingPaymentFields);
  process.exit(1);
}

// Check EventRegistration model schema
const regSchemaKeys = Object.keys(EventRegistration.schema.paths);
console.log("EventRegistration schema fields:", regSchemaKeys);
if (!regSchemaKeys.includes("userId") || !regSchemaKeys.includes("eventId") || !regSchemaKeys.includes("paymentId")) {
  console.error("FAILED: EventRegistration schema missing userId, eventId, or paymentId!");
  process.exit(1);
}

console.log("SUCCESS: All models and schemas validated successfully!");
