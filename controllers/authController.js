const jwt = require("jsonwebtoken");
const User = require("../models/User");
const College = require("../models/College");
const Team = require("../models/Team");
const EventRegistration = require("../models/EventRegistrations");
const { OAuth2Client } = require("google-auth-library");

// Helper function to generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

// Helper function to process college assignment and enforce max 2 teams
const handleCollegeRegistration = async (collegeName) => {
  if (!collegeName || !collegeName.trim()) {
    throw { status: 400, message: "Please select a college name to complete registration" };
  }

  const cleanName = collegeName.trim();
  let college = await College.findOne({
    collegeName: { $regex: new RegExp(`^${cleanName}$`, "i") },
  });

  if (college) {
    if (college.totalTeams >= 2) {
      throw {
        status: 400,
        message: `Registration failed: '${college.collegeName}' has already reached the maximum limit of 2 registered accounts/teams.`,
      };
    }
    college.totalTeams += 1;
    await college.save();
  } else {
    college = await College.create({
      collegeName: cleanName,
      totalTeams: 1,
    });
  }

  return college;
};

// Helper to build comprehensive user response object with team & registered events
const buildUserResponse = async (user, token = "") => {
  const populatedUser = await User.findById(user._id)
    .select("-password")
    .populate("college")
    .populate("teamid");

  const registrations = await EventRegistration.find({ userId: user._id })
    .populate("eventId")
    .populate("paymentId");

  const teamObj = populatedUser.teamid || null;
  const teamName = teamObj ? teamObj.name : "";
  const teamIdStr = teamObj ? teamObj.teamid : "";

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
    team: teamObj,
    teamName: teamName,
    teamIdString: teamIdStr,
    hasTeam: Boolean(teamObj),
    registeredEvents: registrations,
    registrations: registrations,
    token: token || generateToken(populatedUser._id),
  };
};

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
      if (!user.googleId) {
        user.googleId = googleId;
        if (!user.avatar && picture) user.avatar = picture;
        await user.save();
      }
    } else {
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

    if (!name || !email || !password || !collegeName) {
      return res
        .status(400)
        .json({ message: "Please fill in all required fields (name, email, password, collegeName)" });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists with this email" });
    }

    let college;
    try {
      college = await handleCollegeRegistration(collegeName);
    } catch (collegeErr) {
      return res.status(collegeErr.status || 400).json({ message: collegeErr.message });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: role || "user",
      college: college._id,
      collegeName: college.collegeName,
    });

    const jwtToken = generateToken(user._id);
    const userPayload = await buildUserResponse(user, jwtToken);

    res.status(201).json(userPayload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Authenticate User with Email/Password (Login)
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Please provide email and password" });
    }

    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      const jwtToken = generateToken(user._id);
      const userPayload = await buildUserResponse(user, jwtToken);

      res.json(userPayload);
    } else {
      res.status(401).json({ message: "Invalid email or password" });
    }
  } catch (error) {
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
    res.status(200).json(userPayload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  googleAuth,
  registerUser,
  loginUser,
  getUserProfile,
  verifyUser,
};
