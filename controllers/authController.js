const jwt = require("jsonwebtoken");
const User = require("../models/User");
const College = require("../models/College");
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
      // Verify ID Token sent from Frontend
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
      // Verify Access Token via Google UserInfo API
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

    // Find existing user by googleId or email
    let user = await User.findOne({ $or: [{ googleId }, { email }] }).populate("college");

    if (user) {
      // LOGIN FLOW: User already registered
      if (!user.googleId) {
        user.googleId = googleId;
        if (!user.avatar && picture) user.avatar = picture;
        await user.save();
      }
    } else {
      // SIGNUP FLOW: New User registration requires college selection & limit check
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

      // Populate college details on new user object
      user.college = college;
    }

    // Generate backend JWT token
    const jwtToken = generateToken(user._id);

    res.status(200).json({
      message: "Google Authentication successful",
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      googleId: user.googleId,
      collegeId: user.college ? user.college._id : null,
      college: user.college,
      collegeName: user.collegeName,
      token: jwtToken,
    });
  } catch (error) {
    console.error("Google Auth Error:", error);
    res.status(401).json({ message: "Google authentication failed: " + error.message });
  }
};

// @desc    Register User with Email/Password (Optional fallback)
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

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      collegeId: user.college,
      college: college,
      collegeName: user.collegeName,
      token: generateToken(user._id),
    });
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

    const user = await User.findOne({ email }).populate("college");

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        collegeId: user.college ? user.college._id : null,
        college: user.college,
        collegeName: user.collegeName,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: "Invalid email or password" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password").populate("college");
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  googleAuth,
  registerUser,
  loginUser,
  getUserProfile,
};
