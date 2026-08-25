const mongoose = require("mongoose");
const College = require("../models/College");
const User = require("../models/User");
const Team = require("../models/Team");
const Event = require("../models/Event");
const EventRegistration = require("../models/EventRegistrations");
const Payment = require("../models/Payment");

// Helper function to build full college details with teams, registered events, multiple payments, and yet-to-pay balances
const buildCollegeComprehensiveObject = async (college) => {
  if (!college) return null;

  // 1. Fetch all users for this college
  const users = await User.find({
    $or: [
      { college: college._id },
      { collegeName: { $regex: new RegExp(`^${college.collegeName}$`, "i") } },
    ],
  })
    .populate("teamid")
    .select("-password");

  const allCollegeUserIds = users.map((u) => u._id);

  // 2. Group users into at-most 2 teams
  const teamMap = new Map();
  users.forEach((u) => {
    if (u.teamid && u.teamid._id) {
      const tId = u.teamid._id.toString();
      if (!teamMap.has(tId)) {
        teamMap.set(tId, { team: u.teamid, users: [] });
      }
      teamMap.get(tId).users.push(u);
    }
  });

  const teamsList = [];
  const allCollegeEventsList = [];
  let slotNum = 1;

  for (const [teamDocId, group] of teamMap.entries()) {
    if (slotNum > 2) break; // Max 2 teams limit

    const teamObj = group.team;
    const teamUsers = group.users;
    const teamUserIds = teamUsers.map((u) => u._id);

    // Fetch registrations for this team
    const registrations = await EventRegistration.find({
      userId: { $in: teamUserIds },
    })
      .populate("eventId")
      .populate({
        path: "paymentId",
        populate: { path: "approvedBy", select: "name email role" },
      });

    // Process team events
    const teamEvents = [];
    registrations.forEach((reg) => {
      const ev = reg.eventId;
      if (ev && ev._id) {
        const fee = typeof ev.registrationFee === "number" ? ev.registrationFee : (ev.actualPrice || 0);

        // Process all payments linked to this registration
        const linkedPayments = [];
        if (Array.isArray(reg.paymentId)) {
          reg.paymentId.forEach((p) => {
            if (p && p._id) {
              const appBy = p.approvedBy || {};
              linkedPayments.push({
                _id: p._id,
                paymentId: p._id.toString(),
                amount: p.amount || 0,
                utr: p.utr || "N/A",
                imageUrl: p.imageUrl || p.imageurl || "",
                status: p.status || "pending",
                message: p.message || "",
                approvedBy: appBy.name ? { name: appBy.name, email: appBy.email, role: appBy.role } : null,
                createdAt: p.createdAt,
              });
            }
          });
        }

        const approvedPaid = linkedPayments
          .filter((p) => p.status === "approved" || p.status === "verified")
          .reduce((sum, p) => sum + p.amount, 0);

        const pendingPaid = linkedPayments
          .filter((p) => p.status === "pending" || p.status === "submitted")
          .reduce((sum, p) => sum + p.amount, 0);

        const balanceDue = Math.max(0, fee - approvedPaid);

        let eventStatus = "yet_to_pay";
        if (linkedPayments.length === 0) {
          eventStatus = "yet_to_pay";
        } else if (approvedPaid >= fee && fee > 0) {
          eventStatus = "approved";
        } else if (approvedPaid > 0 && balanceDue > 0) {
          eventStatus = "partially_paid";
        } else if (pendingPaid > 0 && approvedPaid === 0) {
          eventStatus = "pending";
        } else if (linkedPayments.some((p) => p.status === "rejected")) {
          eventStatus = "rejected";
        } else {
          eventStatus = linkedPayments[0].status || "pending";
        }

        const participants = Array.isArray(reg.participants) && reg.participants.length > 0
          ? reg.participants.map((p) => ({
              name: p && p.name ? String(p.name).trim() : "N/A",
              phone: p && p.phone ? String(p.phone).trim() : "N/A",
              email: p && p.email ? String(p.email).trim() : "",
            }))
          : teamUsers.map((tu) => ({ name: tu.name, phone: tu.phone || "N/A", email: tu.email || "" }));

        const eventItem = {
          registrationId: reg._id,
          teamSlot: `Team ${slotNum}`,
          teamName: teamObj.name,
          teamId: teamObj.teamid,
          eventId: ev._id,
          title: ev.title || "Event",
          description: ev.description || "",
          location: ev.location || "Campus",
          date: ev.date || null,
          registrationFee: fee,
          amountPaid: approvedPaid,
          balanceDue: balanceDue,
          isYetToPay: balanceDue > 0,
          paymentStatus: eventStatus,
          paymentsCount: linkedPayments.length,
          payments: linkedPayments,
          utrs: linkedPayments.map((p) => p.utr).filter(Boolean),
          participantsCount: participants.length,
          participants,
          registeredAt: reg.createdAt,
        };

        teamEvents.push(eventItem);
        allCollegeEventsList.push({
          collegeName: college.collegeName,
          ...eventItem,
        });
      }
    });

    // Team members map
    const membersMap = new Map();
    teamUsers.forEach((u, uIdx) => {
      const k = (u.email || u.name).toLowerCase();
      membersMap.set(k, {
        name: u.name,
        email: u.email,
        phone: u.phone || "",
        role: uIdx === 0 ? "Team Leader" : "Team Member",
        isRegisteredUser: true,
      });
    });

    registrations.forEach((r) => {
      if (Array.isArray(r.participants)) {
        r.participants.forEach((p) => {
          if (p && (p.name || p.phone || p.email)) {
            const k = (p.email || p.name || p.phone).toLowerCase();
            if (!membersMap.has(k)) {
              membersMap.set(k, {
                name: p.name || "N/A",
                email: p.email || "",
                phone: p.phone || "",
                role: "Team Participant",
                isRegisteredUser: false,
              });
            }
          }
        });
      }
    });

    const leader = teamUsers[0] || null;
    const teamTotalFee = teamEvents.reduce((s, e) => s + e.registrationFee, 0);
    const teamApprovedPaid = teamEvents.reduce((s, e) => s + e.amountPaid, 0);
    const teamBalanceDue = Math.max(0, teamTotalFee - teamApprovedPaid);

    teamsList.push({
      slot: `Team ${slotNum}`,
      slotNumber: slotNum,
      teamName: teamObj.name,
      teamId: teamObj.teamid,
      _id: teamObj._id,
      leader: leader ? { name: leader.name, email: leader.email, phone: leader.phone || "" } : null,
      membersCount: membersMap.size,
      members: Array.from(membersMap.values()),
      eventsCount: teamEvents.length,
      events: teamEvents,
      totalFee: teamTotalFee,
      amountPaid: teamApprovedPaid,
      balanceDue: teamBalanceDue,
      isYetToPay: teamBalanceDue > 0,
    });

    slotNum++;
  }

  // 3. Fetch all payment transactions for users in this college
  const collegePayments = await Payment.find({ user: { $in: allCollegeUserIds } })
    .populate("user", "name email phone collegeName teamid")
    .populate("approvedBy", "name email role")
    .sort({ createdAt: -1 });

  const paymentsList = collegePayments.map((p) => {
    const u = p.user || {};
    const appBy = p.approvedBy || {};

    let matchedTeamName = "N/A";
    let matchedTeamId = "N/A";
    if (u.teamid) {
      const matchingTeam = teamsList.find((t) => t._id.toString() === u.teamid.toString());
      if (matchingTeam) {
        matchedTeamName = matchingTeam.teamName;
        matchedTeamId = matchingTeam.teamId;
      }
    }

    return {
      _id: p._id,
      paymentId: p._id.toString(),
      collegeName: college.collegeName,
      teamName: matchedTeamName,
      teamId: matchedTeamId,
      paidBy: {
        name: u.name || "N/A",
        email: u.email || "N/A",
        phone: u.phone || "N/A",
      },
      amount: p.amount || 0,
      utr: p.utr || "N/A",
      imageUrl: p.imageUrl || p.imageurl || "",
      status: p.status || "pending",
      message: p.message || "",
      approvedBy: appBy.name ? { name: appBy.name, email: appBy.email, role: appBy.role } : null,
      approvedByName: appBy.name || "N/A",
      timestamp: p.timestamp || p.createdAt,
      createdAt: p.createdAt,
    };
  });

  // Financial summary
  const totalEventsFee = allCollegeEventsList.reduce((s, e) => s + (e.registrationFee || 0), 0);
  const totalPaymentsSubmitted = paymentsList.reduce((s, p) => s + (p.amount || 0), 0);
  const totalApprovedAmount = paymentsList
    .filter((p) => p.status === "approved" || p.status === "verified")
    .reduce((s, p) => s + (p.amount || 0), 0);
  const totalPendingAmount = paymentsList
    .filter((p) => p.status === "pending" || p.status === "submitted")
    .reduce((s, p) => s + (p.amount || 0), 0);
  const balanceDue = Math.max(0, totalEventsFee - totalApprovedAmount);

  let overallPaymentStatus = "unpaid";
  if (paymentsList.length === 0 && totalEventsFee > 0) {
    overallPaymentStatus = "yet_to_pay";
  } else if (totalApprovedAmount >= totalEventsFee && totalEventsFee > 0) {
    overallPaymentStatus = "approved";
  } else if (totalApprovedAmount > 0 && balanceDue > 0) {
    overallPaymentStatus = "partially_paid";
  } else if (totalPendingAmount > 0) {
    overallPaymentStatus = "pending";
  } else if (paymentsList.some((p) => p.status === "rejected")) {
    overallPaymentStatus = "rejected";
  } else {
    overallPaymentStatus = "unpaid";
  }

  return {
    _id: college._id,
    collegeName: college.collegeName,
    registeredTeamsCount: teamsList.length,
    maxAllowedTeams: 2,
    totalRegisteredUsers: users.length,
    teams: teamsList,
    team1: teamsList[0] || null,
    team2: teamsList[1] || null,
    eventsCount: allCollegeEventsList.length,
    events: allCollegeEventsList,
    unpaidEventsCount: allCollegeEventsList.filter((e) => e.isYetToPay).length,
    paidEventsCount: allCollegeEventsList.filter((e) => !e.isYetToPay).length,
    paymentsCount: paymentsList.length,
    payments: paymentsList,
    financialSummary: {
      totalEventsFee,
      totalPaymentsSubmitted,
      totalApprovedAmount,
      totalPendingAmount,
      balanceDue,
      yetToPay: balanceDue,
      overallPaymentStatus,
    },
    createdAt: college.createdAt,
    updatedAt: college.updatedAt,
  };
};

// @desc    Add a new college (admin / system setup)
// @route   POST /api/colleges
// @access  Public / Protected
const addCollege = async (req, res) => {
  try {
    const { collegeName } = req.body;

    if (!collegeName || !collegeName.trim()) {
      return res.status(400).json({ message: "College name is required" });
    }

    const cleanName = collegeName.trim();

    const existingCollege = await College.findOne({
      collegeName: { $regex: new RegExp(`^${cleanName}$`, "i") },
    });

    if (existingCollege) {
      return res.status(400).json({ message: "College with this name already exists" });
    }

    const college = await College.create({
      collegeName: cleanName,
      totalTeams: 0,
    });

    res.status(201).json({
      message: "College added successfully",
      college,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Retrieve all colleges
// @route   GET /api/colleges
// @access  Public
const getColleges = async (req, res) => {
  try {
    const colleges = await College.find().sort({ collegeName: 1 });
    res.status(200).json(colleges);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Retrieve a single college by ID with full details (Teams, Events, Multiple Payments & Yet to Pay balances)
// @route   GET /api/colleges/:id (also /api/colleges/:id/details)
// @access  Public / Protected
const getCollegeById = async (req, res) => {
  try {
    let college = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      college = await College.findById(req.params.id);
    } else {
      college = await College.findOne({
        collegeName: { $regex: new RegExp(`^${req.params.id.trim()}$`, "i") },
      });
    }

    if (!college) {
      return res.status(404).json({ message: "College not found" });
    }

    // Build comprehensive object with events, multiple payments, and yet-to-pay balances
    const fullData = await buildCollegeComprehensiveObject(college);

    res.status(200).json(fullData);
  } catch (error) {
    console.error("Get College By Id Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update college name ONLY
// @route   PUT /api/colleges/:id
// @access  Public / Protected
const updateCollege = async (req, res) => {
  try {
    const { collegeName } = req.body;

    if (!collegeName || !collegeName.trim()) {
      return res.status(400).json({ message: "New college name is required" });
    }

    const college = await College.findById(req.params.id);
    if (!college) {
      return res.status(404).json({ message: "College not found" });
    }

    const cleanName = collegeName.trim();

    const nameConflict = await College.findOne({
      _id: { $ne: req.params.id },
      collegeName: { $regex: new RegExp(`^${cleanName}$`, "i") },
    });

    if (nameConflict) {
      return res.status(400).json({ message: "Another college already exists with this name" });
    }

    college.collegeName = cleanName;
    await college.save();

    await User.updateMany({ college: college._id }, { collegeName: cleanName });

    res.status(200).json({
      message: "College name updated successfully",
      college,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  addCollege,
  getColleges,
  getCollegeById,
  updateCollege,
  buildCollegeComprehensiveObject,
};
