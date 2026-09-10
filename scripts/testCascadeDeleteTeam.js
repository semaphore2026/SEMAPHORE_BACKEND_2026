require("dotenv").config();
const mongoose = require("mongoose");
const Team = require("../models/Team");
const User = require("../models/User");
const Event = require("../models/Event");
const EventRegistration = require("../models/EventRegistrations");
const { setTeam, deleteTeam } = require("../controllers/teamController");

async function runCascadeDeleteTest() {
  console.log("=================================================");
  console.log("  STARTING TEAM CASCADE DELETE VERIFICATION TEST ");
  console.log("=================================================\n");

  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/semaphore_test";

  try {
    await mongoose.connect(mongoUri, { family: 4, serverSelectionTimeoutMS: 5000 });
    console.log("Connected to MongoDB.");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }

  try {
    // 1. Create test user
    const testEmail = `test_cascade_${Date.now()}@example.com`;
    const user = await User.create({
      name: "Cascade Delete User",
      email: testEmail,
      password: "password123",
      teamid: null,
    });
    console.log("1. Created test user:", user._id);

    // 2. Create test event
    const testEvent = await Event.create({
      title: `Test Event ${Date.now()}`,
      description: "Test event description",
      category: "Technical",
      date: new Date(),
      location: "Main Auditorium",
      registrationFee: 100,
    });
    console.log("2. Created test event:", testEvent._id);

    // 3. Create test team
    const team = await Team.create({
      name: `TestCascadeTeam_${Date.now()}`,
    });
    user.teamid = team._id;
    await user.save();
    console.log("3. Created test team:", team._id, "and linked user.");

    // 4. Create event registration linked to user
    const registration = await EventRegistration.create({
      userId: user._id,
      eventId: testEvent._id,
      participants: [{ name: "Cascade Delete User", phone: "1234567890" }],
    });
    console.log("4. Created test registration:", registration._id);

    // Verify registration exists
    let regBefore = await EventRegistration.findById(registration._id);
    if (!regBefore) throw new Error("Registration was not saved!");

    // Mock Express Response object
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

    // 5. Execute deleteTeam controller
    console.log("\n5. Executing deleteTeam controller function...");
    const req = {
      user: { _id: user._id, role: "user" },
      params: { id: team._id.toString() },
      body: {},
    };
    const res = createRes();

    await deleteTeam(req, res);
    console.log("deleteTeam response status:", res.statusCode);
    console.log("deleteTeam response body:", res.body.message);

    // 6. Verification checks
    const userAfter = await User.findById(user._id);
    const teamAfter = await Team.findById(team._id);
    const regAfter = await EventRegistration.findById(registration._id);

    console.log("\n--- Verification Results ---");
    console.log("User teamid after deletion:", userAfter.teamid);
    console.log("Team document in DB:", teamAfter);
    console.log("Registration document in DB:", regAfter);

    if (userAfter.teamid !== null) {
      throw new Error("FAILED: User teamid was not reset to null!");
    }
    if (teamAfter !== null) {
      throw new Error("FAILED: Team document was not deleted!");
    }
    if (regAfter !== null) {
      throw new Error("FAILED: EventRegistration document was NOT cascade-deleted!");
    }

    console.log("\n=================================================");
    console.log("  ✅ CASCADE DELETE TEAM TEST PASSED SUCCESSFULLY!");
    console.log("=================================================");

    // Clean up test records
    await User.findByIdAndDelete(user._id);
    await Event.findByIdAndDelete(testEvent._id);
  } catch (err) {
    console.error("❌ TEST FAILED:", err);
  } finally {
    await mongoose.disconnect();
  }
}

runCascadeDeleteTest();
