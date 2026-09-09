require("dotenv").config();
const mongoose = require("mongoose");
const Team = require("../models/Team");
const User = require("../models/User");
const { setTeam, deleteTeam, getMyTeam } = require("../controllers/teamController");

async function runTest() {
  try {
    console.log("Connecting to Database...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");

    // Create test user
    const testEmail = `test_delete_team_${Date.now()}@example.com`;
    const user = await User.create({
      name: "Test Delete Team User",
      email: testEmail,
      password: "password123",
      teamid: null,
    });
    console.log("Created test user:", user._id, "Initial teamid:", user.teamid);

    // Mock res object
    const createRes = () => {
      const res = {};
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.json = (data) => {
        res.body = data;
        return res;
      };
      return res;
    };

    // 1. Set Team
    let req = {
      user: { _id: user._id },
      body: { teamName: `TestTeam_${Date.now()}` },
    };
    let res = createRes();

    await setTeam(req, res);
    console.log("setTeam response status:", res.statusCode);
    console.log("setTeam response body:", res.body.message);
    const createdTeamId = res.body.team._id;

    // Check user in DB
    let userAfterSet = await User.findById(user._id);
    console.log("User teamid after setTeam:", userAfterSet.teamid);

    if (!userAfterSet.teamid || userAfterSet.teamid.toString() !== createdTeamId.toString()) {
      throw new Error("FAILED: User teamid was not set properly");
    }

    // 2. Delete Team
    req = {
      user: { _id: user._id },
      params: {},
      body: {},
    };
    res = createRes();

    await deleteTeam(req, res);
    console.log("deleteTeam response status:", res.statusCode);
    console.log("deleteTeam response body:", res.body.message);

    // Check user in DB
    let userAfterDelete = await User.findById(user._id);
    console.log("User teamid after deleteTeam:", userAfterDelete.teamid);

    // Check Team in DB
    let teamInDb = await Team.findById(createdTeamId);
    console.log("Team in DB after deleteTeam:", teamInDb);

    if (userAfterDelete.teamid !== null) {
      throw new Error("FAILED: User teamid was not reset to null!");
    }

    if (teamInDb !== null) {
      throw new Error("FAILED: Team document was not deleted from DB!");
    }

    // Clean up test user
    await User.findByIdAndDelete(user._id);
    console.log("Cleaned up test user.");

    console.log("\n✅ ALL TESTS PASSED SUCCESSFULLY!");
    process.exit(0);
  } catch (error) {
    console.error("❌ TEST FAILED:", error);
    process.exit(1);
  }
}

runTest();
