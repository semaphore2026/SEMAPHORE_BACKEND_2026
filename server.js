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
const teamRoutes = require("./routes/teamRoutes");
const teamRulesRoutes = require("./routes/teamRulesRoutes");

// Initialize Database Connection
connectDB();

const app = express();

// Trust reverse proxy (AWS EC2 / Nginx / ALB)
app.set("trust proxy", true);

// =========================
// CORS
// =========================

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests without an Origin header
    // (Postman, server-to-server, mobile apps, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Allow ALL origins
    return callback(null, true);
  },

  credentials: true,

  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],

  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "x-access-token",
  ],

  exposedHeaders: ["Content-Range", "X-Content-Range"],

  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// =========================
// BODY PARSERS
// =========================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================
// BASE ROUTE
// =========================

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to Semaphore Backend API 2026",
  });
});

// =========================
// API ROUTES
// =========================

app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/colleges", collegeRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/timetable", timetableRoutes);
app.use("/api/registrations", registrationRoutes);
app.use("/api/event-registrations", registrationRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/team-rules", teamRulesRoutes);
app.use("/api/teamrules", teamRulesRoutes);

// =========================
// 404 HANDLER
// =========================

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

// =========================
// GLOBAL ERROR HANDLER
// =========================

app.use((err, req, res, next) => {
  console.error(err.stack);

  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
  });
});

// =========================
// SERVER
// =========================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Server running in ${process.env.NODE_ENV || "development"
    } mode on port ${PORT}`
  );
});