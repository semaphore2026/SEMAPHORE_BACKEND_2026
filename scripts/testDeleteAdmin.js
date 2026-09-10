const mongoose = require("mongoose");
const express = require("express");
const http = require("http");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const loggerMiddleware = require("../middleware/loggerMiddleware");
const Admin = require("../models/Admin");
const adminRoutes = require("../routes/adminRoutes");

async function runDeleteAdminTest() {
  console.log("=================================================");
  console.log("    STARTING DELETE ADMIN ENDPOINT TEST          ");
  console.log("=================================================\n");

  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/semaphore_test";
  const jwtSecret = process.env.JWT_SECRET || "fallback_secret_for_test";
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = jwtSecret;

  try {
    await mongoose.connect(mongoUri, { family: 4, serverSelectionTimeoutMS: 5000 });
    console.log("Connected to MongoDB.");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }

  // 1. Create test superadmin & regular admin
  const superAdmin = await Admin.create({
    name: "Test SuperAdmin",
    email: `superadmin_${Date.now()}@semaphore.com`,
    password: "password123",
    role: "superadmin",
  });

  const regularAdmin = await Admin.create({
    name: "Test RegularAdmin",
    email: `regadmin_${Date.now()}@semaphore.com`,
    password: "password123",
    role: "admin",
  });

  const superAdminToken = jwt.sign({ id: superAdmin._id, role: "superadmin" }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const regularAdminToken = jwt.sign({ id: regularAdmin._id, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "1h" });

  const app = express();
  app.use(express.json());
  app.use(loggerMiddleware);
  app.use("/api/admin", adminRoutes);

  const server = app.listen(0, async () => {
    const port = server.address().port;

    const makeRequest = (path, method = "DELETE", body = null, token = null) => {
      return new Promise((resolve) => {
        const headers = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const req = http.request({ hostname: "localhost", port, path, method, headers }, (res) => {
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

        if (body) req.write(JSON.stringify(body));
        req.end();
      });
    };

    try {
      console.log("1. Testing DELETE with Regular Admin Token (Security Check - Should fail with 403)...");
      const res1 = await makeRequest(`/api/admin/admins/${regularAdmin._id}`, "DELETE", null, regularAdminToken);
      console.log("Status Code:", res1.status);
      console.log("Response Body:", res1.body);
      if (res1.status !== 403) throw new Error("FAILED: Regular admin was able to access delete admin endpoint!");

      console.log("\n2. Testing Superadmin self-deletion check (Should fail with 400)...");
      const res2 = await makeRequest(`/api/admin/admins/${superAdmin._id}`, "DELETE", null, superAdminToken);
      console.log("Status Code:", res2.status);
      console.log("Response Body:", res2.body);
      if (res2.status !== 400) throw new Error("FAILED: Superadmin was allowed to delete self!");

      console.log("\n3. Testing Superadmin deleting regular admin account (Should succeed with 200 OK)...");
      const res3 = await makeRequest(`/api/admin/admins/${regularAdmin._id}`, "DELETE", null, superAdminToken);
      console.log("Status Code:", res3.status);
      console.log("Response Body:", res3.body);
      if (res3.status !== 200) throw new Error("FAILED: Superadmin failed to delete admin account!");

      // Verify deletion in DB
      const adminInDb = await Admin.findById(regularAdmin._id);
      console.log("Admin in DB after deletion:", adminInDb);
      if (adminInDb !== null) throw new Error("FAILED: Admin document was not removed from MongoDB!");

      console.log("\n=================================================");
      console.log("  ✅ ALL DELETE ADMIN TESTS PASSED SUCCESSFULLY! ");
      console.log("=================================================");
    } catch (err) {
      console.error("❌ TEST FAILED:", err);
    } finally {
      await Admin.deleteOne({ _id: superAdmin._id });
      await Admin.deleteOne({ _id: regularAdmin._id });
      server.close();
      await mongoose.disconnect();
    }
  });
}

runDeleteAdminTest();
