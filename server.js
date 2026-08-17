require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

// Routes
const authRoutes = require("./routes/authRoutes");
const eventRoutes = require("./routes/eventRoutes");
const collegeRoutes = require("./routes/collegeRoutes");
const adminRoutes = require("./routes/adminRoutes");
const timetableRoutes = require("./routes/timetableRoutes");
const registrationRoutes = require("./routes/registrationRoutes");

// Initialize Database Connection
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Base Route
app.get("/", (req, res) => {
  res.json({ message: "Welcome to Semaphore Backend API 2026" });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/colleges", collegeRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/timetable", timetableRoutes);
app.use("/api/registrations", registrationRoutes);
app.use("/api/event-registrations", registrationRoutes);


// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({ message: "Route not found" });
});

// Global Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`);
});