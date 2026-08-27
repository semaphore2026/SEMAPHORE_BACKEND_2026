require("dotenv").config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

// Routes
const authRoutes = require("./routes/authRoutes");
const eventRoutes = require("./routes/eventRoutes");
const collegeRoutes = require("./routes/collegeRoutes");
const allowedCollegeRoutes = require("./routes/allowedCollegeRoutes");
const adminRoutes = require("./routes/adminRoutes");
const timetableRoutes = require("./routes/timetableRoutes");
const registrationRoutes = require("./routes/registrationRoutes");
const teamRoutes = require("./routes/teamRoutes");
const teamRulesRoutes = require("./routes/teamRulesRoutes");
const { seedInitialRecord } = require("./controllers/allowedCollegeController");

// Initialize Database Connection
connectDB().then(() => {
  seedInitialRecord();
}).catch((err) => {
  console.error("DB connection error:", err);
});

const app = express();

// =========================
// Middleware
// =========================

// Allow all origins
app.use(cors());

// Required for Google OAuth / popup communication
app.use((req, res, next) => {
  res.setHeader(
    "Cross-Origin-Opener-Policy",
    "same-origin-allow-popups"
  );
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================
// Base Route
// =========================

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to Semaphore Backend API 2026",
  });
});

// =========================
// API Routes
// =========================

app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/colleges", collegeRoutes);
app.use("/api/allowed-colleges", allowedCollegeRoutes);
app.use("/api/allowedcolleges", allowedCollegeRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/timetable", timetableRoutes);

app.use("/api/registrations", registrationRoutes);
app.use("/api/event-registrations", registrationRoutes);

app.use("/api/teams", teamRoutes);

app.use("/api/team-rules", teamRulesRoutes);
app.use("/api/teamrules", teamRulesRoutes);

// =========================
// 404 Handler
// =========================

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

// =========================
// Global Error Handler
// =========================

app.use((err, req, res, next) => {
  console.error(err.stack);

  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
  });
});

// =========================
// Start Server
// =========================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Server running in ${process.env.NODE_ENV || "development"
    } mode on port ${PORT}`
  );
});