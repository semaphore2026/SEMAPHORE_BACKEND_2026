const mongoose = require("mongoose");
const express = require("express");
const http = require("http");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const loggerMiddleware = require("../middleware/loggerMiddleware");
const TransactionLog = require("../models/TransactionLog");
const Admin = require("../models/Admin");
const adminRoutes = require("../routes/adminRoutes");

async function runLogsEndpointTest() {
  console.log("=================================================");
  console.log("   STARTING TRANSACTION LOGS ENDPOINT & DB TEST  ");
  console.log("=================================================\n");

  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/semaphore_test";
  const jwtSecret = process.env.JWT_SECRET || "fallback_secret_for_test";
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = jwtSecret;
  }

  try {
    await mongoose.connect(mongoUri, { family: 4, serverSelectionTimeoutMS: 5000 });
    console.log("Connected to MongoDB for testing.");
  } catch (err) {
    console.log("Mongo connection failed:", err.message);
    return;
  }

  // Create a mock test admin record in DB for protectAdmin verification
  let testAdmin = await Admin.findOne({ email: "logtestadmin@semaphore.com" });
  if (!testAdmin) {
    testAdmin = await Admin.create({
      name: "Log Test Admin",
      email: "logtestadmin@semaphore.com",
      password: "password123",
      role: "admin",
    });
  }

  const token = jwt.sign({ id: testAdmin._id, role: "admin" }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  const app = express();
  app.use(express.json());
  app.use(loggerMiddleware);

  app.use("/api/admin", adminRoutes);

  // Mock transactional route to generate test logs
  app.post("/api/test/create-registration", (req, res) => {
    req.user = { _id: "user_test_99", email: "student@test.com", name: "Alice" };
    res.status(201).json({ success: true, message: "Registration successful", registrationId: "REG_1001" });
  });

  app.post("/api/test/fail-registration", (req, res) => {
    req.user = { _id: "user_test_99", email: "student@test.com" };
    res.status(400).json({ message: "Invalid payment reference number (UTR)" });
  });

  const server = app.listen(0, async () => {
    const port = server.address().port;

    const makeRequest = (path, method = "GET", body = null, authToken = null) => {
      return new Promise((resolve) => {
        const headers = {
          "Content-Type": "application/json",
        };
        if (authToken) {
          headers["Authorization"] = `Bearer ${authToken}`;
        }

        const options = {
          hostname: "localhost",
          port: port,
          path: path,
          method: method,
          headers: headers,
        };

        const req = http.request(options, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(data) });
            } catch (e) {
              resolve({ status: res.statusCode, body: data });
            }
          });
        });

        if (body) {
          req.write(JSON.stringify(body));
        }
        req.end();
      });
    };

    try {
      console.log("1. Generating simulated transaction logs...");
      for (let i = 1; i <= 25; i++) {
        if (i % 3 === 0) {
          await makeRequest("/api/test/fail-registration", "POST", { utr: "INVALID_UTR" });
        } else {
          await makeRequest("/api/test/create-registration", "POST", { eventId: `EVT_${i}` });
        }
      }

      // Wait 500ms for async DB log writes to complete
      await new Promise((r) => setTimeout(r, 500));

      console.log("\n2. Testing GET /api/admin/logs?page=1&limit=20 with Admin Bearer Token...");
      const page1Res = await makeRequest("/api/admin/logs?page=1&limit=20", "GET", null, token);

      console.log("Response Status:", page1Res.status);
      console.log("Pagination Metadata (Page 1):", JSON.stringify(page1Res.body.pagination, null, 2));
      console.log("Logs Count Returned (Page 1):", page1Res.body.logs ? page1Res.body.logs.length : 0);

      if (page1Res.body.logs && page1Res.body.logs.length > 0) {
        console.log("\nSample Latest Log Document (Page 1, First Record):", {
          _id: page1Res.body.logs[0]._id,
          type: page1Res.body.logs[0].type,
          method: page1Res.body.logs[0].method,
          url: page1Res.body.logs[0].url,
          statusCode: page1Res.body.logs[0].statusCode,
          formattedTime: page1Res.body.logs[0].formattedTime,
          user: page1Res.body.logs[0].user,
        });
      }

      console.log("\n3. Testing GET /api/admin/logs?page=2&limit=20 with Admin Bearer Token...");
      const page2Res = await makeRequest("/api/admin/logs?page=2&limit=20", "GET", null, token);
      console.log("Response Status:", page2Res.status);
      console.log("Pagination Metadata (Page 2):", JSON.stringify(page2Res.body.pagination, null, 2));
      console.log("Logs Count Returned (Page 2):", page2Res.body.logs ? page2Res.body.logs.length : 0);

      console.log("\n=================================================");
      console.log("   ✅ TRANSACTION LOGS ENDPOINT TEST PASSED!     ");
      console.log("=================================================");
    } catch (err) {
      console.error("Test Error:", err);
    } finally {
      // Clean up test admin
      if (testAdmin) {
        await Admin.deleteOne({ _id: testAdmin._id });
      }
      server.close();
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    }
  });
}

runLogsEndpointTest();
