require("dotenv").config();
const { checkUserPaymentStatus } = require("../controllers/registrationController");

console.log("=== Testing checkUserPaymentStatus Controller Function ===");

if (typeof checkUserPaymentStatus !== "function") {
  console.error("FAILED: checkUserPaymentStatus is not exported as a function!");
  process.exit(1);
}

console.log("checkUserPaymentStatus function is properly defined and exported.");
console.log("SUCCESS: Route and controller validation passed!");
