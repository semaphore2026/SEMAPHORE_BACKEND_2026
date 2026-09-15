const jwt = require("jsonwebtoken");
const User = require("../models/User");
const College = require("../models/College");
const AllowedCollege = require("../models/AllowedCollege");
const CollegeConfig = require("../models/CollegeConfig");
const Team = require("../models/Team");
const EventRegistration = require("../models/EventRegistrations");
const { formatRegistration } = require("../utils/formatRegistration");
const { OAuth2Client } = require("google-auth-library");

// Helper function to generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validates a name field.
 * - Required, non-empty after trim
 * - Min 2 characters, max 100 characters
 */
const validateName = (name) => {
  if (!name || typeof name !== "string" || !name.trim()) {
    return "Name is required";
  }
  const clean = name.trim();
  if (clean.length < 2) return "Name must be at least 2 characters long";
  if (clean.length > 100) return "Name must be 100 characters or fewer";
  return null;
};

/**
 * Validates an email field.
 * - Required, non-empty after trim
 * - Must match standard email pattern
 */
const validateEmail = (email) => {
  if (!email || typeof email !== "string" || !email.trim()) {
    return "Email address is required";
  }
  const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
  if (!emailRegex.test(email.trim().toLowerCase())) {
    return "Please enter a valid email address";
  }
  return null;
};

/**
 * Validates a password field.
 * - Required, non-empty
 * - Min 6 characters
 */
const validatePassword = (password) => {
  if (!password || typeof password !== "string") {
    return "Password is required";
  }
  if (password.length < 6) {
    return "Password must be at least 6 characters long";
  }
  return null;
};

/**
 * Validates a collegeName field.
 * - Required, non-empty after trim
 */
const validateCollegeName = (collegeName) => {
  if (!collegeName || typeof collegeName !== "string" || !collegeName.trim()) {
    return "College name is required. Please select your college to complete registration";
  }
  return null;
};

// ---------------------------------------------------------------------------
// College quota helper
// ---------------------------------------------------------------------------

/**
 * Handles college assignment during registration, enforcing per-college quotas.
 *
 * Logic:
 * 1. Ensure CollegeConfig exists (create default if not).
 * 2. Look up an AllowedCollege record for the given college name.
 *    - If found and isActive === false → reject (college not accepting registrations).
 *    - If found and isActive === true → use its maxTeams as the quota.
 *    - If NOT found and enforceAllowedListOnly === true → reject (college not on allowed list).
 *    - If NOT found and enforceAllowedListOnly === false → use config.defaultMaxTeamsPerCollege as quota.
 * 3. Count the CURRENT number of registered users for this college (live count, not cached counter).
 * 4. If currentCount >= quota → reject with "quota full" error.
 * 5. Otherwise:
 *    - Find or create the College document.
 *    - Atomically increment totalTeams using $inc to prevent race conditions.
 * 6. Return the college document.
 *
 * @param {string} collegeName - The college name provided during registration
 * @returns {Promise<Object>} The college document
 * @throws {{ status: number, message: string }} On validation/quota failure
 */
const handleCollegeRegistration = async (collegeName) => {
  const nameError = validateCollegeName(collegeName);
  if (nameError) {
    throw { status: 400, message: nameError };
  }

  const cleanName = collegeName.trim();

  // ── Step 1: Fetch or create global config ──────────────────────────────────
  let config = await CollegeConfig.findOne();
  if (!config) {
    config = await CollegeConfig.create({
      defaultMaxTeamsPerCollege: 1,
      enforceAllowedListOnly: false,
    });
  }

  // ── Step 2: Check AllowedCollege record ────────────────────────────────────
  const allowedRecord = await AllowedCollege.findOne({
    collegeName: { $regex: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  });

  let maxAllowed = config.defaultMaxTeamsPerCollege || 1;

  if (allowedRecord) {
    if (!allowedRecord.isActive) {
      throw {
        status: 400,
        message: `Registration is currently closed for '${allowedRecord.collegeName}'. This college is not accepting new registrations at this time. Please contact the Semaphore team for assistance.`,
      };
    }
    maxAllowed = allowedRecord.maxTeams || 1;
  } else if (config.enforceAllowedListOnly) {
    throw {
      status: 400,
      message: `'${cleanName}' is not on the list of colleges allowed to register for Semaphore 2026. Please verify your college name or contact the event team.`,
    };
  }

  // ── Step 3: Live count of registered users for this college ────────────────
  // We count actual User documents rather than relying on the cached totalTeams
  // counter, which can drift if users are deleted or if a previous registration
  // failed mid-way after the counter was already incremented.
  const currentCount = await User.countDocuments({
    $or: [
      { collegeName: { $regex: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
    ],
  });

  // ── Step 4: Quota check ────────────────────────────────────────────────────
  if (currentCount >= maxAllowed) {
    const slotWord = maxAllowed === 1 ? "slot" : "slots";
    throw {
      status: 400,
      message: `Registration is full for '${cleanName}'. This college has reached its maximum of ${maxAllowed} registered ${slotWord}. No more registrations are being accepted from this college.`,
    };
  }

  // ── Step 5: Find or create College document, atomically update counter ─────
  // Use findOneAndUpdate with $inc so that concurrent requests are serialised
  // at the DB level and the counter never overshoots.
  let college = await College.findOneAndUpdate(
    { collegeName: { $regex: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
    { $inc: { totalTeams: 1 } },
    { new: true }
  );

  if (!college) {
    // First registration for this college — create the document
    college = await College.create({
      collegeName: cleanName,
      totalTeams: 1,
    });
  }

  return college;
};

// ---------------------------------------------------------------------------
// Helper to build comprehensive user response object
// ---------------------------------------------------------------------------

const buildUserResponse = async (user, token = "") => {
  const populatedUser = await User.findById(user._id)
    .select("-password")
    .populate("college")
    .populate("teamid");

  const rawRegistrations = await EventRegistration.find({ userId: user._id })
    .populate("eventId")
    .populate("paymentId");

  const teamObj = populatedUser.teamid || null;
  const teamName = teamObj ? teamObj.name : "";
  const teamIdStr = teamObj ? teamObj.teamid : "";

  const registeredEvents = rawRegistrations.map((reg) => formatRegistration(reg));

  return {
    _id: populatedUser._id,
    name: populatedUser.name,
    email: populatedUser.email,
    role: populatedUser.role,
    avatar: populatedUser.avatar,
    googleId: populatedUser.googleId,
    collegeId: populatedUser.college ? populatedUser.college._id : null,
    college: populatedUser.college,
    collegeName: populatedUser.collegeName,
    teamid: teamObj ? teamObj._id : null,
    team: teamObj
      ? {
          _id: teamObj._id,
          name: teamObj.name,
          teamid: teamObj.teamid,
        }
      : null,
    teamName: teamName,
    teamIdString: teamIdStr,
    hasTeam: Boolean(teamObj),
    registeredEvents,
    registrations: registeredEvents,
    token: token || generateToken(populatedUser._id),
  };
};

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

// @desc    Google OAuth Signup / Login
// @route   POST /api/auth/google
// @access  Public
const googleAuth = async (req, res) => {
  try {
    const { idToken, token, accessToken, credential, collegeName } = req.body;
    const targetToken = credential || idToken || token;

    if (!targetToken && !accessToken) {
      return res.status(400).json({
        message: "Google ID Token or Access Token is required",
      });
    }

    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    let googleId, email, name, picture;

    if (targetToken) {
      const ticket = await client.verifyIdToken({
        idToken: targetToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      googleId = payload.sub;
      email = payload.email;
      name = payload.name;
      picture = payload.picture;
    } else if (accessToken) {
      const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const userInfo = await response.json();
      if (!response.ok || userInfo.error) {
        return res.status(401).json({ message: "Invalid Google Access Token" });
      }

      googleId = userInfo.sub;
      email = userInfo.email;
      name = userInfo.name;
      picture = userInfo.picture;
    }

    if (!email) {
      return res.status(400).json({ message: "Could not retrieve email from Google" });
    }

    let user = await User.findOne({ $or: [{ googleId }, { email }] }).populate("college");

    if (user) {
      // Existing user — just log in, no quota check needed
      if (!user.googleId) {
        user.googleId = googleId;
        if (!user.avatar && picture) user.avatar = picture;
        await user.save();
      }
    } else {
      // New Google user — college name is required, quota must be checked
      const collegeNameError = validateCollegeName(collegeName);
      if (collegeNameError) {
        return res.status(400).json({
          message:
            "College name is required for new registrations. Please provide your college name along with the Google sign-in request.",
        });
      }

      let college;
      try {
        college = await handleCollegeRegistration(collegeName);
      } catch (collegeErr) {
        return res.status(collegeErr.status || 400).json({ message: collegeErr.message });
      }

      user = await User.create({
        name: name || "Google User",
        email,
        googleId,
        avatar: picture || "",
        college: college._id,
        collegeName: college.collegeName,
      });

      user.college = college;
    }

    const jwtToken = generateToken(user._id);
    const userPayload = await buildUserResponse(user, jwtToken);

    res.status(200).json({
      message: "Google Authentication successful",
      ...userPayload,
    });
  } catch (error) {
    console.error("Google Auth Error:", error);
    res.status(401).json({ message: "Google authentication failed: " + error.message });
  }
};

// @desc    Register User with Email/Password
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, email, password, role, collegeName } = req.body;

    // ── Explicit field validation (surfaced before any DB calls) ──────────────
    const validationErrors = [];

    const nameErr = validateName(name);
    if (nameErr) validationErrors.push(nameErr);

    const emailErr = validateEmail(email);
    if (emailErr) validationErrors.push(emailErr);

    const passwordErr = validatePassword(password);
    if (passwordErr) validationErrors.push(passwordErr);

    const collegeErr = validateCollegeName(collegeName);
    if (collegeErr) validationErrors.push(collegeErr);

    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: validationErrors[0], // Return first error for simplicity
        errors: validationErrors,     // Also return all errors for detailed frontend handling
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // ── Check for duplicate email ──────────────────────────────────────────────
    const userExists = await User.findOne({ email: cleanEmail });
    if (userExists) {
      return res.status(400).json({
        message: "An account with this email address already exists. Please log in or use a different email.",
      });
    }

    // ── College quota check & assignment ──────────────────────────────────────
    let college;
    try {
      college = await handleCollegeRegistration(collegeName);
    } catch (collegeErr) {
      return res.status(collegeErr.status || 400).json({ message: collegeErr.message });
    }

    // ── Create user ────────────────────────────────────────────────────────────
    const user = await User.create({
      name: name.trim(),
      email: cleanEmail,
      password,
      role: role === "admin" ? "user" : (role || "user"), // Prevent self-assigning admin role
      college: college._id,
      collegeName: college.collegeName,
    });

    const jwtToken = generateToken(user._id);
    const userPayload = await buildUserResponse(user, jwtToken);

    res.status(201).json({
      message: "Registration successful",
      ...userPayload,
    });
  } catch (error) {
    console.error("Register User Error:", error);

    // Surface Mongoose validation errors cleanly
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({
        message: messages[0],
        errors: messages,
      });
    }

    // Duplicate key error (e.g. unique index on email)
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue || {})[0] || "field";
      return res.status(400).json({
        message: `An account with this ${field} already exists.`,
      });
    }

    res.status(500).json({ message: "Registration failed due to an internal error. Please try again." });
  }
};

// @desc    Authenticate User with Email/Password (Login)
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Please provide both email and password" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    if (user && (await user.matchPassword(password))) {
      const jwtToken = generateToken(user._id);
      const userPayload = await buildUserResponse(user, jwtToken);

      res.json(userPayload);
    } else {
      res.status(401).json({ message: "Invalid email or password" });
    }
  } catch (error) {
    console.error("Login User Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user profile (includes team, teamName, registeredEvents)
// @route   GET /api/auth/me
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let token = "";
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    const userPayload = await buildUserResponse(user, token);
    res.status(200).json(userPayload);
  } catch (error) {
    console.error("Get User Profile Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Verify user token and return full user data (team, teamName, registeredEvents, etc.)
// @route   GET /api/auth/verifyuser (and /api/auth/verifyUser, /api/auth/verify-user)
// @access  Private
const verifyUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let token = "";
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    const userPayload = await buildUserResponse(user, token);
    res.status(200).json({
      success: true,
      user: userPayload,
      registeredEvents: userPayload.registeredEvents || [],
      registrations: userPayload.registrations || [],
      registration: {
        events: userPayload.registeredEvents || [],
      },
      ...userPayload,
    });
  } catch (error) {
    console.error("Verify User Error:", error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  googleAuth,
  registerUser,
  loginUser,
  getUserProfile,
  verifyUser,
  handleCollegeRegistration, // exported for potential reuse
};
