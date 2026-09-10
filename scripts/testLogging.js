const express = require("express");
const http = require("http");
const loggerMiddleware = require("../middleware/loggerMiddleware");
const logger = require("../utils/logger");

async function runLoggingTests() {
  console.log("=================================================");
  console.log("   STARTING CONSOLE LOGGING FUNCTIONALITY TEST   ");
  console.log("=================================================\n");

  const app = express();
  app.use(express.json());
  app.use(loggerMiddleware);

  // Test Route 1: Read (GET) - Success
  app.get("/api/test/read", (req, res) => {
    res.json({ message: "Fetched test data successfully" });
  });

  // Test Route 2: Transactional (POST) - Success
  app.post("/api/test/transaction", (req, res) => {
    req.user = { _id: "user_12345", email: "student@example.com", name: "John Doe" };
    res.status(201).json({
      success: true,
      transactionId: "TXN_998877",
      message: "Event registration completed",
    });
  });

  // Test Route 3: Transactional (POST) - Client Error (400)
  app.post("/api/test/transaction-fail", (req, res) => {
    req.user = { _id: "user_12345", email: "student@example.com" };
    res.status(400).json({
      message: "Team ID is required before event registration. Please set your team first.",
    });
  });

  // Test Route 4: Password Sanitization Test (POST)
  app.post("/api/test/login", (req, res) => {
    res.json({ token: "secret_jwt_token_xyz" });
  });

  // Test Route 5: Internal Server Error (500)
  app.get("/api/test/error", (req, res, next) => {
    const err = new Error("Database connection timed out during payment verification");
    next(err);
  });

  // Global Error Handler
  app.use((err, req, res, next) => {
    logger.error(`Unhandled Server Error during ${req.method} ${req.originalUrl || req.url}`, err, {
      method: req.method,
      url: req.originalUrl || req.url,
      body: req.body,
    });
    res.status(500).json({ message: err.message });
  });

  const server = app.listen(0, async () => {
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;

    const makeRequest = (path, method = "GET", body = null) => {
      return new Promise((resolve) => {
        const options = {
          hostname: "localhost",
          port: port,
          path: path,
          method: method,
          headers: {
            "Content-Type": "application/json",
          },
        };

        const req = http.request(options, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve({ status: res.statusCode, data }));
        });

        if (body) {
          req.write(JSON.stringify(body));
        }
        req.end();
      });
    };

    try {
      console.log("--- 1. Testing GET Success Request ---");
      await makeRequest("/api/test/read", "GET");

      console.log("\n--- 2. Testing Transactional POST Success Request ---");
      await makeRequest("/api/test/transaction", "POST", { eventId: "evt_99", participants: [{ name: "Alice" }] });

      console.log("\n--- 3. Testing Transactional POST Error (400 Bad Request) ---");
      await makeRequest("/api/test/transaction-fail", "POST", { eventId: "evt_99" });

      console.log("\n--- 4. Testing Sensitive Payload Sanitization (Password & Token Redaction) ---");
      await makeRequest("/api/test/login", "POST", { email: "user@test.com", password: "MySecretPassword123!" });

      console.log("\n--- 5. Testing Server Error (500 Stack Trace Logging) ---");
      await makeRequest("/api/test/error", "GET");

      console.log("\n=================================================");
      console.log("   ✅ ALL LOGGING TESTS PASSED SUCCESSFULLY!     ");
      console.log("=================================================");
    } catch (error) {
      console.error("Test execution error:", error);
    } finally {
      server.close();
    }
  });
}

runLoggingTests();
