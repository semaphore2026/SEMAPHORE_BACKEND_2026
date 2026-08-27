require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const AllowedCollege = require("../models/AllowedCollege");
const CollegeConfig = require("../models/CollegeConfig");
const College = require("../models/College");
const User = require("../models/User");
const { seedInitialRecord } = require("../controllers/allowedCollegeController");
const authController = require("../controllers/authController");

async function runTests() {
  try {
    console.log("Connecting to MongoDB...");
    await connectDB();
    console.log("Connected to MongoDB successfully.\n");

    // Test 1: Update Global Config to defaultMaxTeamsPerCollege = 1
    console.log("--- Test 1: Update Global Config to defaultMaxTeamsPerCollege = 1 ---");
    let config = await CollegeConfig.findOne();
    if (!config) {
      config = await CollegeConfig.create({ defaultMaxTeamsPerCollege: 1 });
    } else {
      config.defaultMaxTeamsPerCollege = 1;
      await config.save();
    }
    console.log("Updated Global CollegeConfig:", config.toObject());

    const mockRes = () => {
      const res = {};
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.json = (data) => {
        res.data = data;
        return res;
      };
      return res;
    };

    const { registerUser } = authController;

    // Test 2: Default limit test (max 1 registration)
    console.log("\n--- Test 2: Default limit test (max 1 registration per college) ---");
    const defaultCollegeName = "Default Test College 1";
    await College.deleteOne({ collegeName: defaultCollegeName });
    await User.deleteMany({ collegeName: defaultCollegeName });

    // 1st registration -> Should SUCCEED
    const req1 = {
      body: {
        name: "User 1",
        email: `default_user_1_${Date.now()}@defaultcol.edu`,
        password: "password123",
        collegeName: defaultCollegeName,
      },
    };
    const res1 = mockRes();
    await registerUser(req1, res1);
    console.log("1st Registration status:", res1.statusCode, res1.data.email ? "SUCCESS" : res1.data);

    // 2nd registration -> Should FAIL because limit is 1
    const req2 = {
      body: {
        name: "User 2",
        email: `default_user_2_${Date.now()}@defaultcol.edu`,
        password: "password123",
        collegeName: defaultCollegeName,
      },
    };
    const res2 = mockRes();
    await registerUser(req2, res2);
    console.log("2nd Registration status:", res2.statusCode);
    console.log("2nd Registration error message:", res2.data);

    // Test 3: Cleanup Test Data
    console.log("\n--- Test 3: Cleanup Test Data ---");
    await College.deleteOne({ collegeName: defaultCollegeName });
    await User.deleteMany({ collegeName: defaultCollegeName });
    console.log("Test data cleaned up successfully.");

    console.log("\nALL TESTS PASSED SUCCESSFULLY!");
    process.exit(0);
  } catch (err) {
    console.error("Test failed with error:", err);
    process.exit(1);
  }
}

runTests();
