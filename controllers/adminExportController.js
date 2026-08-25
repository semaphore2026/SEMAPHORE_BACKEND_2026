const ExcelJS = require("exceljs");
const mongoose = require("mongoose");
const User = require("../models/User");
const Admin = require("../models/Admin");
const Team = require("../models/Team");
const College = require("../models/College");
const Event = require("../models/Event");
const EventRegistration = require("../models/EventRegistrations");
const Payment = require("../models/Payment");
const {
  PALETTE,
  addReportTitle,
  formatHeaderRow,
  formatDataRow,
  applyStatusStyle,
  autoFitColumns,
  sanitizeSheetName,
} = require("../utils/excelHelper");

/**
 * Helper to fetch aggregated team data with members, events, and payment info
 */
const fetchAllTeamsData = async (filterQuery = {}) => {
  const teams = await Team.find(filterQuery).sort({ createdAt: -1 });
  const result = [];

  for (const team of teams) {
    // 1. Fetch user accounts linked to this team
    const users = await User.find({ teamid: team._id })
      .populate("college")
      .select("-password");

    const userIds = users.map((u) => u._id);

    // 2. Fetch event registrations for users in this team
    const registrations = await EventRegistration.find({
      userId: { $in: userIds },
    })
      .populate("eventId")
      .populate("paymentId");

    // 3. Extract unique events
    const eventMap = new Map();
    registrations.forEach((reg) => {
      if (reg.eventId) {
        const ev = reg.eventId;
        const evId = ev._id ? ev._id.toString() : ev.toString();
        if (!eventMap.has(evId)) {
          eventMap.set(evId, {
            _id: evId,
            title: ev.title || "Unknown Event",
            registrationFee:
              typeof ev.registrationFee === "number"
                ? ev.registrationFee
                : ev.actualPrice || 0,
            date: ev.date || null,
            location: ev.location || "",
          });
        }
      }
    });
    const registeredEvents = Array.from(eventMap.values());

    // 4. Extract payments
    const paymentMap = new Map();
    registrations.forEach((reg) => {
      if (Array.isArray(reg.paymentId)) {
        reg.paymentId.forEach((p) => {
          if (p && p._id) {
            paymentMap.set(p._id.toString(), p);
          }
        });
      }
    });

    // Also look up payments directly by userIds
    const directPayments = await Payment.find({ user: { $in: userIds } });
    directPayments.forEach((p) => {
      paymentMap.set(p._id.toString(), p);
    });

    const paymentsList = Array.from(paymentMap.values());
    let overallPaymentStatus = "unpaid";
    let paymentUtrs = [];
    let totalAmountPaid = 0;

    if (paymentsList.length > 0) {
      totalAmountPaid = paymentsList.reduce((sum, p) => sum + (p.amount || 0), 0);
      paymentUtrs = paymentsList.map((p) => p.utr).filter(Boolean);

      const hasApproved = paymentsList.some((p) => p.status === "approved" || p.status === "verified");
      const hasPending = paymentsList.some((p) => p.status === "pending" || p.status === "submitted");
      const hasRejected = paymentsList.some((p) => p.status === "rejected");

      if (hasApproved) {
        overallPaymentStatus = "approved";
      } else if (hasPending) {
        overallPaymentStatus = "pending";
      } else if (hasRejected) {
        overallPaymentStatus = "rejected";
      } else {
        overallPaymentStatus = paymentsList[0].status || "pending";
      }
    }

    // 5. College Name
    let collegeName = "";
    if (users.length > 0) {
      collegeName =
        users[0].collegeName ||
        (users[0].college ? users[0].college.collegeName : "") ||
        "";
    }

    // 6. Aggregate team members (from User accounts + EventRegistration participants)
    const membersMap = new Map();

    users.forEach((u) => {
      const key = (u.email || u.name || u._id.toString()).toLowerCase();
      membersMap.set(key, {
        name: u.name || "N/A",
        email: u.email || "",
        phone: u.phone || "",
        isRegisteredUser: true,
        userId: u._id,
      });
    });

    registrations.forEach((reg) => {
      if (Array.isArray(reg.participants)) {
        reg.participants.forEach((p) => {
          if (p && (p.name || p.phone || p.email)) {
            const pKey = (p.email || p.name || p.phone).toLowerCase();
            if (!membersMap.has(pKey)) {
              membersMap.set(pKey, {
                name: p.name || "N/A",
                email: p.email || "",
                phone: p.phone || "",
                isRegisteredUser: false,
                userId: null,
              });
            } else {
              const existing = membersMap.get(pKey);
              if (!existing.phone && p.phone) existing.phone = p.phone;
              if (!existing.email && p.email) existing.email = p.email;
            }
          }
        });
      }
    });

    const members = Array.from(membersMap.values());
    const leader = users.length > 0 ? users[0] : null;

    result.push({
      _id: team._id,
      teamName: team.name,
      teamId: team.teamid,
      collegeName: collegeName || "N/A",
      leader: leader
        ? {
            _id: leader._id,
            name: leader.name,
            email: leader.email,
            phone: leader.phone || "",
          }
        : null,
      membersCount: members.length,
      members,
      registeredEventsCount: registeredEvents.length,
      registeredEvents,
      totalFee: registeredEvents.reduce((sum, ev) => sum + (ev.registrationFee || 0), 0),
      paymentStatus: overallPaymentStatus,
      paymentUtr: paymentUtrs.join(", "),
      totalAmountPaid,
      payments: paymentsList,
      createdAt: team.createdAt,
    });
  }

  return result;
};

/**
 * Helper to fetch aggregated event participants data
 */
const fetchAllEventsData = async (eventIdFilter = null) => {
  const eventQuery = eventIdFilter ? { _id: eventIdFilter } : {};
  const events = await Event.find(eventQuery).sort({ title: 1 });
  const result = [];

  for (const event of events) {
    const registrations = await EventRegistration.find({ eventId: event._id })
      .populate({
        path: "userId",
        select: "name email phone collegeName college teamid",
        populate: [{ path: "college" }, { path: "teamid" }],
      })
      .populate("paymentId");

    const eventParticipantsList = [];

    registrations.forEach((reg) => {
      const u = reg.userId || {};
      const teamObj = u.teamid || null;
      const teamName = teamObj ? teamObj.name : "Individual / No Team";
      const teamIdCode = teamObj ? teamObj.teamid : "N/A";
      const collegeName =
        u.collegeName ||
        (u.college ? u.college.collegeName : "") ||
        "N/A";

      // Payment details
      let paymentStatus = "unpaid";
      let paymentUtr = "";
      let paymentAmount = 0;

      if (Array.isArray(reg.paymentId) && reg.paymentId.length > 0) {
        const p = reg.paymentId[0];
        if (p) {
          paymentStatus = p.status || "pending";
          paymentUtr = p.utr || "";
          paymentAmount = p.amount || 0;
        }
      }

      // If registration has participants array, use each participant
      if (Array.isArray(reg.participants) && reg.participants.length > 0) {
        reg.participants.forEach((p) => {
          eventParticipantsList.push({
            registrationId: reg._id,
            eventId: event._id,
            eventTitle: event.title,
            eventDate: event.date,
            eventLocation: event.location,
            collegeName,
            teamName,
            teamId: teamIdCode,
            registeredByUser: u.name || "N/A",
            registeredByEmail: u.email || "",
            participantName: p.name || u.name || "N/A",
            participantPhone: p.phone || u.phone || "",
            participantEmail: p.email || u.email || "",
            registrationFee:
              typeof event.registrationFee === "number"
                ? event.registrationFee
                : event.actualPrice || 0,
            paymentStatus,
            paymentUtr,
            paymentAmount,
            registeredAt: reg.createdAt,
          });
        });
      } else {
        // Fallback to user details as the participant
        eventParticipantsList.push({
          registrationId: reg._id,
          eventId: event._id,
          eventTitle: event.title,
          eventDate: event.date,
          eventLocation: event.location,
          collegeName,
          teamName,
          teamId: teamIdCode,
          registeredByUser: u.name || "N/A",
          registeredByEmail: u.email || "",
          participantName: u.name || "N/A",
          participantPhone: u.phone || "",
          participantEmail: u.email || "",
          registrationFee:
            typeof event.registrationFee === "number"
              ? event.registrationFee
              : event.actualPrice || 0,
          paymentStatus,
          paymentUtr,
          paymentAmount,
          registeredAt: reg.createdAt,
        });
      }
    });

    result.push({
      _id: event._id,
      title: event.title,
      description: event.description,
      location: event.location,
      date: event.date,
      registrationFee:
        typeof event.registrationFee === "number"
          ? event.registrationFee
          : event.actualPrice || 0,
      minParticipants: event.minParticipants || 1,
      maxParticipants: event.maxParticipants || 1,
      totalRegistrationsCount: registrations.length,
      totalParticipantsCount: eventParticipantsList.length,
      participants: eventParticipantsList,
    });
  }

  return result;
};

/**
 * Helper to fetch aggregated college data with max 2 teams per college
 */
const fetchAllCollegesData = async (collegeIdFilter = null) => {
  const collegeQuery = collegeIdFilter ? { _id: collegeIdFilter } : {};
  const colleges = await College.find(collegeQuery).sort({ collegeName: 1 });
  const result = [];

  for (const college of colleges) {
    // Find all users belonging to this college
    const users = await User.find({
      $or: [
        { college: college._id },
        { collegeName: { $regex: new RegExp(`^${college.collegeName}$`, "i") } },
      ],
    })
      .populate("teamid")
      .select("-password");

    // Group users by teamid
    const teamGroupMap = new Map(); // teamId -> array of users
    const individualUsers = [];

    users.forEach((u) => {
      if (u.teamid && u.teamid._id) {
        const tId = u.teamid._id.toString();
        if (!teamGroupMap.has(tId)) {
          teamGroupMap.set(tId, {
            team: u.teamid,
            users: [],
          });
        }
        teamGroupMap.get(tId).users.push(u);
      } else {
        individualUsers.push(u);
      }
    });

    const teamsList = [];
    let slotNumber = 1;

    for (const [teamDocId, group] of teamGroupMap.entries()) {
      if (slotNumber > 2) break; // Limit to maximum 2 teams per college

      const teamObj = group.team;
      const teamUsers = group.users;
      const userIds = teamUsers.map((u) => u._id);

      // Fetch event registrations for this team
      const registrations = await EventRegistration.find({
        userId: { $in: userIds },
      })
        .populate("eventId")
        .populate("paymentId");

      // Extract events
      const eventNames = [];
      let teamTotalFee = 0;
      registrations.forEach((r) => {
        if (r.eventId) {
          const evTitle = r.eventId.title || "Event";
          const fee = typeof r.eventId.registrationFee === "number" ? r.eventId.registrationFee : 0;
          if (!eventNames.includes(evTitle)) {
            eventNames.push(evTitle);
            teamTotalFee += fee;
          }
        }
      });

      // Extract payments & status
      let paymentStatus = "unpaid";
      let paymentUtrs = [];
      let totalPaid = 0;

      const teamPayments = await Payment.find({ user: { $in: userIds } });
      if (teamPayments.length > 0) {
        totalPaid = teamPayments.reduce((s, p) => s + (p.amount || 0), 0);
        paymentUtrs = teamPayments.map((p) => p.utr).filter(Boolean);
        const hasApproved = teamPayments.some((p) => p.status === "approved" || p.status === "verified");
        const hasPending = teamPayments.some((p) => p.status === "pending" || p.status === "submitted");
        const hasRejected = teamPayments.some((p) => p.status === "rejected");
        if (hasApproved) paymentStatus = "approved";
        else if (hasPending) paymentStatus = "pending";
        else if (hasRejected) paymentStatus = "rejected";
        else paymentStatus = teamPayments[0].status || "pending";
      }

      // Extract members
      const membersMap = new Map();
      teamUsers.forEach((u) => {
        const k = (u.email || u.name).toLowerCase();
        membersMap.set(k, {
          name: u.name,
          email: u.email,
          phone: u.phone || "",
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
                });
              }
            }
          });
        }
      });

      const leader = teamUsers[0] || null;

      teamsList.push({
        slot: `Team ${slotNumber}`,
        slotNumber,
        teamId: teamObj.teamid,
        teamName: teamObj.name,
        _id: teamObj._id,
        leader: leader ? { name: leader.name, email: leader.email, phone: leader.phone || "" } : null,
        membersCount: membersMap.size,
        members: Array.from(membersMap.values()),
        registeredEvents: eventNames,
        registeredEventsCount: eventNames.length,
        totalFee: teamTotalFee,
        paymentStatus,
        paymentUtr: paymentUtrs.join(", "),
        totalAmountPaid: totalPaid,
      });

      slotNumber++;
    }

    result.push({
      _id: college._id,
      collegeName: college.collegeName,
      registeredTeamsCount: teamsList.length,
      maxAllowedTeams: 2,
      teams: teamsList,
      team1: teamsList[0] || null,
      team2: teamsList[1] || null,
      totalRegisteredUsers: users.length,
      createdAt: college.createdAt,
    });
  }

  return result;
};

// ============================================================================
// 1. EXCEL EXPORT: TEAMS & PARTICIPANTS
// ============================================================================

// @desc    Export Excel file of Teams and their participant members
// @route   GET /api/admin/export/teams (also /api/admin/export/team-participants)
// @access  Private (Admin / Superadmin)
const exportTeamsExcel = async (req, res) => {
  try {
    const teamsData = await fetchAllTeamsData();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Semaphore 2026";
    workbook.created = new Date();

    // ------------------------------------------------------------------------
    // Sheet 1: Teams Overview
    // ------------------------------------------------------------------------
    const overviewSheet = workbook.addWorksheet(
      sanitizeSheetName("Teams Summary", "Teams Summary")
    );
    addReportTitle(
      overviewSheet,
      "SEMAPHORE 2026 - TEAMS SUMMARY REPORT",
      `Total Teams Registered: ${teamsData.length}`,
      10
    );

    const overviewHeaders = [
      "Sl No",
      "Team Name",
      "Team ID / Code",
      "College Name",
      "Team Leader",
      "Leader Email",
      "Members Count",
      "Events Registered",
      "Payment Status",
      "Payment UTR",
    ];

    const overviewHeaderRow = overviewSheet.addRow(overviewHeaders);
    formatHeaderRow(overviewHeaderRow);

    teamsData.forEach((team, index) => {
      const rowData = [
        index + 1,
        team.teamName,
        team.teamId,
        team.collegeName,
        team.leader ? team.leader.name : "N/A",
        team.leader ? team.leader.email : "N/A",
        team.membersCount,
        team.registeredEvents.map((e) => e.title).join(", ") || "None",
        team.paymentStatus.toUpperCase(),
        team.paymentUtr || "N/A",
      ];

      const row = overviewSheet.addRow(rowData);
      const isEven = index % 2 === 1;
      formatDataRow(row, isEven, {
        1: { vertical: "middle", horizontal: "center" },
        3: { vertical: "middle", horizontal: "center" },
        7: { vertical: "middle", horizontal: "center" },
      });

      // Status cell styling (Col 9)
      applyStatusStyle(row.getCell(9), team.paymentStatus);
    });

    autoFitColumns(overviewSheet, { 1: 8, 2: 24, 3: 20, 4: 28, 5: 22, 6: 28, 7: 14, 8: 35, 9: 16, 10: 22 });

    // ------------------------------------------------------------------------
    // Sheet 2: Detailed Team Members & Participants
    // ------------------------------------------------------------------------
    const detailSheet = workbook.addWorksheet(
      sanitizeSheetName("Team Participants", "Team Participants")
    );
    addReportTitle(
      detailSheet,
      "SEMAPHORE 2026 - ALL TEAM PARTICIPANTS & MEMBERS",
      "Complete List of Participants Grouped by Team",
      11
    );

    const detailHeaders = [
      "Sl No",
      "Team Name",
      "Team ID",
      "College Name",
      "Participant Name",
      "Participant Phone",
      "Participant Email",
      "Registered Events",
      "Payment Status",
      "Payment UTR",
      "Registration Date",
    ];

    const detailHeaderRow = detailSheet.addRow(detailHeaders);
    formatHeaderRow(detailHeaderRow);

    let detailIndex = 1;
    teamsData.forEach((team) => {
      const eventsStr = team.registeredEvents.map((e) => e.title).join(", ") || "None";
      const regDateStr = team.createdAt
        ? new Date(team.createdAt).toLocaleDateString("en-IN")
        : "N/A";

      if (team.members && team.members.length > 0) {
        team.members.forEach((member) => {
          const row = detailSheet.addRow([
            detailIndex++,
            team.teamName,
            team.teamId,
            team.collegeName,
            member.name || "N/A",
            member.phone || "N/A",
            member.email || "N/A",
            eventsStr,
            team.paymentStatus.toUpperCase(),
            team.paymentUtr || "N/A",
            regDateStr,
          ]);

          const isEven = detailIndex % 2 === 0;
          formatDataRow(row, isEven, {
            1: { vertical: "middle", horizontal: "center" },
            3: { vertical: "middle", horizontal: "center" },
            6: { vertical: "middle", horizontal: "center" },
            11: { vertical: "middle", horizontal: "center" },
          });

          applyStatusStyle(row.getCell(9), team.paymentStatus);
        });
      } else {
        // Row if team has no members listed yet
        const row = detailSheet.addRow([
          detailIndex++,
          team.teamName,
          team.teamId,
          team.collegeName,
          team.leader ? team.leader.name : "N/A",
          team.leader ? team.leader.phone : "N/A",
          team.leader ? team.leader.email : "N/A",
          eventsStr,
          team.paymentStatus.toUpperCase(),
          team.paymentUtr || "N/A",
          regDateStr,
        ]);

        formatDataRow(row, false, {
          1: { vertical: "middle", horizontal: "center" },
          3: { vertical: "middle", horizontal: "center" },
        });
        applyStatusStyle(row.getCell(9), team.paymentStatus);
      }
    });

    autoFitColumns(detailSheet, {
      1: 8,
      2: 24,
      3: 20,
      4: 28,
      5: 22,
      6: 18,
      7: 28,
      8: 35,
      9: 16,
      10: 22,
      11: 18,
    });

    // Send Excel buffer
    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `Semaphore2026_Team_Participants_${timestamp}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(buffer);
  } catch (error) {
    console.error("Export Teams Excel Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================================
// 2. EXCEL EXPORT: EVENT PARTICIPANTS (WITH COLLEGE NAME & DETAILS)
// ============================================================================

// @desc    Export Excel file of Event Participants with College Name and Details
// @route   GET /api/admin/export/events (or /api/admin/export/events/:eventId or /api/admin/export/event-participants)
// @access  Private (Admin / Superadmin)
const exportEventsExcel = async (req, res) => {
  try {
    const targetEventId = req.params.eventId || req.query.eventId || req.query.eventid || null;
    const eventsData = await fetchAllEventsData(targetEventId);

    if (targetEventId && eventsData.length === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Semaphore 2026";
    workbook.created = new Date();

    // ------------------------------------------------------------------------
    // Sheet 1: Master All Event Participants
    // ------------------------------------------------------------------------
    const masterSheet = workbook.addWorksheet(
      sanitizeSheetName("All Event Participants", "All Event Participants")
    );

    const totalParticipants = eventsData.reduce((s, e) => s + e.totalParticipantsCount, 0);
    addReportTitle(
      masterSheet,
      "SEMAPHORE 2026 - EVENT PARTICIPANTS REPORT",
      `Total Events: ${eventsData.length} | Total Event Registrations: ${totalParticipants}`,
      13
    );

    const eventHeaders = [
      "Sl No",
      "Event Title",
      "College Name",
      "Team Name",
      "Team ID",
      "Participant Name",
      "Participant Phone",
      "Participant Email",
      "Registered By",
      "Fee (₹)",
      "Payment Status",
      "Payment UTR",
      "Registered Date",
    ];

    const masterHeaderRow = masterSheet.addRow(eventHeaders);
    formatHeaderRow(masterHeaderRow);

    let globalIndex = 1;
    eventsData.forEach((event) => {
      event.participants.forEach((p) => {
        const row = masterSheet.addRow([
          globalIndex++,
          event.title,
          p.collegeName,
          p.teamName,
          p.teamId,
          p.participantName,
          p.participantPhone || "N/A",
          p.participantEmail || "N/A",
          p.registeredByUser,
          p.registrationFee,
          p.paymentStatus.toUpperCase(),
          p.paymentUtr || "N/A",
          p.registeredAt ? new Date(p.registeredAt).toLocaleDateString("en-IN") : "N/A",
        ]);

        const isEven = globalIndex % 2 === 0;
        formatDataRow(row, isEven, {
          1: { vertical: "middle", horizontal: "center" },
          5: { vertical: "middle", horizontal: "center" },
          7: { vertical: "middle", horizontal: "center" },
          10: { vertical: "middle", horizontal: "right" },
          13: { vertical: "middle", horizontal: "center" },
        });

        applyStatusStyle(row.getCell(11), p.paymentStatus);
      });
    });

    autoFitColumns(masterSheet, {
      1: 8,
      2: 24,
      3: 28,
      4: 22,
      5: 18,
      6: 22,
      7: 18,
      8: 26,
      9: 22,
      10: 12,
      11: 16,
      12: 20,
      13: 16,
    });

    // ------------------------------------------------------------------------
    // Sheet(s) per individual event (if multiple events exist)
    // ------------------------------------------------------------------------
    if (eventsData.length > 1) {
      eventsData.forEach((event) => {
        const sheetName = sanitizeSheetName(event.title, `Event_${event._id}`);
        const eventSheet = workbook.addWorksheet(sheetName);

        addReportTitle(
          eventSheet,
          `EVENT: ${event.title.toUpperCase()}`,
          `Location: ${event.location || "Main Campus"} | Participants: ${event.participants.length}`,
          11
        );

        const singleEventHeaders = [
          "Sl No",
          "College Name",
          "Team Name",
          "Team ID",
          "Participant Name",
          "Participant Phone",
          "Participant Email",
          "Registered By",
          "Payment Status",
          "Payment UTR",
          "Registered Date",
        ];

        const shHeaderRow = eventSheet.addRow(singleEventHeaders);
        formatHeaderRow(shHeaderRow);

        event.participants.forEach((p, idx) => {
          const row = eventSheet.addRow([
            idx + 1,
            p.collegeName,
            p.teamName,
            p.teamId,
            p.participantName,
            p.participantPhone || "N/A",
            p.participantEmail || "N/A",
            p.registeredByUser,
            p.paymentStatus.toUpperCase(),
            p.paymentUtr || "N/A",
            p.registeredAt ? new Date(p.registeredAt).toLocaleDateString("en-IN") : "N/A",
          ]);

          const isEven = idx % 2 === 1;
          formatDataRow(row, isEven, {
            1: { vertical: "middle", horizontal: "center" },
            4: { vertical: "middle", horizontal: "center" },
            6: { vertical: "middle", horizontal: "center" },
            11: { vertical: "middle", horizontal: "center" },
          });

          applyStatusStyle(row.getCell(9), p.paymentStatus);
        });

        autoFitColumns(eventSheet, {
          1: 8,
          2: 28,
          3: 22,
          4: 18,
          5: 22,
          6: 18,
          7: 26,
          8: 22,
          9: 16,
          10: 20,
          11: 16,
        });
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = targetEventId && eventsData[0]
      ? `Semaphore2026_${eventsData[0].title.replace(/\s+/g, "_")}_Participants_${timestamp}.xlsx`
      : `Semaphore2026_Event_Participants_${timestamp}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(buffer);
  } catch (error) {
    console.error("Export Events Excel Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================================
// 3. EXCEL EXPORT: COLLEGE-WISE REPORT (MAX 2 TEAMS PER COLLEGE WITH DETAILS)
// ============================================================================

// @desc    Export Excel file of Colleges with at-most 2 teams per college and full member details
// @route   GET /api/admin/export/colleges (also /api/admin/export/college-teams)
// @access  Private (Admin / Superadmin)
const exportCollegesExcel = async (req, res) => {
  try {
    const collegesData = await fetchAllCollegesData();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Semaphore 2026";
    workbook.created = new Date();

    // ------------------------------------------------------------------------
    // Sheet 1: Colleges & 2-Teams Summary View
    // ------------------------------------------------------------------------
    const summarySheet = workbook.addWorksheet(
      sanitizeSheetName("Colleges 2-Teams View", "Colleges 2-Teams View")
    );
    addReportTitle(
      summarySheet,
      "SEMAPHORE 2026 - COLLEGE TEAMS REPORT (MAX 2 TEAMS PER COLLEGE)",
      `Total Colleges: ${collegesData.length} | Rule: Maximum 2 Teams Enforced per College`,
      12
    );

    const colHeaders = [
      "Sl No",
      "College Name",
      "Registered Teams",
      "Team 1 Name",
      "Team 1 ID",
      "Team 1 Leader & Contact",
      "Team 1 Registered Events",
      "Team 1 Payment Status",
      "Team 2 Name",
      "Team 2 ID",
      "Team 2 Leader & Contact",
      "Team 2 Payment Status",
    ];

    const sHeaderRow = summarySheet.addRow(colHeaders);
    formatHeaderRow(sHeaderRow);

    collegesData.forEach((col, index) => {
      const t1 = col.team1;
      const t2 = col.team2;

      const t1LeaderStr = t1 && t1.leader
        ? `${t1.leader.name} (${t1.leader.phone || t1.leader.email})`
        : t1 ? "Registered" : "N/A";
      const t1EventsStr = t1 ? t1.registeredEvents.join(", ") || "None" : "N/A";
      const t1Status = t1 ? t1.paymentStatus.toUpperCase() : "N/A";

      const t2LeaderStr = t2 && t2.leader
        ? `${t2.leader.name} (${t2.leader.phone || t2.leader.email})`
        : t2 ? "Registered" : "None";
      const t2Status = t2 ? t2.paymentStatus.toUpperCase() : "None";

      const row = summarySheet.addRow([
        index + 1,
        col.collegeName,
        `${col.registeredTeamsCount} / 2`,
        t1 ? t1.teamName : "No Team",
        t1 ? t1.teamId : "N/A",
        t1LeaderStr,
        t1EventsStr,
        t1Status,
        t2 ? t2.teamName : "No Second Team",
        t2 ? t2.teamId : "N/A",
        t2LeaderStr,
        t2Status,
      ]);

      const isEven = index % 2 === 1;
      formatDataRow(row, isEven, {
        1: { vertical: "middle", horizontal: "center" },
        3: { vertical: "middle", horizontal: "center" },
        5: { vertical: "middle", horizontal: "center" },
        10: { vertical: "middle", horizontal: "center" },
      });

      if (t1) applyStatusStyle(row.getCell(8), t1.paymentStatus);
      if (t2) applyStatusStyle(row.getCell(12), t2.paymentStatus);
    });

    autoFitColumns(summarySheet, {
      1: 8,
      2: 30,
      3: 18,
      4: 22,
      5: 18,
      6: 30,
      7: 30,
      8: 18,
      9: 22,
      10: 18,
      11: 30,
      12: 18,
    });

    // ------------------------------------------------------------------------
    // Sheet 2: College Team Members Detailed
    // ------------------------------------------------------------------------
    const membersSheet = workbook.addWorksheet(
      sanitizeSheetName("College Members Detailed", "College Members Detailed")
    );
    addReportTitle(
      membersSheet,
      "SEMAPHORE 2026 - COLLEGE TEAM MEMBERS DETAILED LIST",
      "Full Participant Roster Grouped by College and Team Slot (Team 1 / Team 2)",
      11
    );

    const mHeaders = [
      "Sl No",
      "College Name",
      "Team Slot",
      "Team Name",
      "Team ID",
      "Member Name",
      "Member Phone",
      "Member Email",
      "Registered Events",
      "Payment Status",
      "Payment UTR",
    ];

    const mHeaderRow = membersSheet.addRow(mHeaders);
    formatHeaderRow(mHeaderRow);

    let mIndex = 1;
    collegesData.forEach((college) => {
      if (college.teams && college.teams.length > 0) {
        college.teams.forEach((team) => {
          const eventsStr = team.registeredEvents.join(", ") || "None";

          if (team.members && team.members.length > 0) {
            team.members.forEach((m) => {
              const row = membersSheet.addRow([
                mIndex++,
                college.collegeName,
                team.slot,
                team.teamName,
                team.teamId,
                m.name || "N/A",
                m.phone || "N/A",
                m.email || "N/A",
                eventsStr,
                team.paymentStatus.toUpperCase(),
                team.paymentUtr || "N/A",
              ]);

              const isEven = mIndex % 2 === 0;
              formatDataRow(row, isEven, {
                1: { vertical: "middle", horizontal: "center" },
                3: { vertical: "middle", horizontal: "center" },
                5: { vertical: "middle", horizontal: "center" },
                7: { vertical: "middle", horizontal: "center" },
              });

              applyStatusStyle(row.getCell(10), team.paymentStatus);
            });
          }
        });
      }
    });

    autoFitColumns(membersSheet, {
      1: 8,
      2: 30,
      3: 14,
      4: 22,
      5: 18,
      6: 22,
      7: 18,
      8: 26,
      9: 30,
      10: 16,
      11: 20,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `Semaphore2026_Colleges_Teams_${timestamp}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(buffer);
  } catch (error) {
    console.error("Export Colleges Excel Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================================
// 4. EXCEL EXPORT: MASTER ALL-IN-ONE CONSOLIDATED WORKBOOK
// ============================================================================

// @desc    Export Master Consolidated Excel Workbook with all 3 reports
// @route   GET /api/admin/export/all (also /api/admin/export/master)
// @access  Private (Admin / Superadmin)
const exportMasterExcel = async (req, res) => {
  try {
    const [teamsData, eventsData, collegesData] = await Promise.all([
      fetchAllTeamsData(),
      fetchAllEventsData(),
      fetchAllCollegesData(),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Semaphore 2026";
    workbook.created = new Date();

    // 1. College 2-Teams Sheet
    const colSheet = workbook.addWorksheet("Colleges & Teams");
    addReportTitle(
      colSheet,
      "SEMAPHORE 2026 - COLLEGES & TEAMS (MAX 2 PER COLLEGE)",
      `Total Colleges: ${collegesData.length}`,
      11
    );
    const colHRow = colSheet.addRow([
      "Sl No", "College Name", "Teams Count", "Team 1 Name", "Team 1 ID", "Team 1 Leader", "Team 1 Payment",
      "Team 2 Name", "Team 2 ID", "Team 2 Leader", "Team 2 Payment"
    ]);
    formatHeaderRow(colHRow);

    collegesData.forEach((c, idx) => {
      const t1 = c.team1;
      const t2 = c.team2;
      const row = colSheet.addRow([
        idx + 1,
        c.collegeName,
        `${c.registeredTeamsCount} / 2`,
        t1 ? t1.teamName : "None",
        t1 ? t1.teamId : "N/A",
        t1 && t1.leader ? t1.leader.name : "N/A",
        t1 ? t1.paymentStatus.toUpperCase() : "N/A",
        t2 ? t2.teamName : "None",
        t2 ? t2.teamId : "N/A",
        t2 && t2.leader ? t2.leader.name : "N/A",
        t2 ? t2.paymentStatus.toUpperCase() : "N/A",
      ]);
      formatDataRow(row, idx % 2 === 1);
      if (t1) applyStatusStyle(row.getCell(7), t1.paymentStatus);
      if (t2) applyStatusStyle(row.getCell(11), t2.paymentStatus);
    });
    autoFitColumns(colSheet);

    // 2. Teams & Participants Sheet
    const teamSheet = workbook.addWorksheet("Team Participants");
    addReportTitle(
      teamSheet,
      "SEMAPHORE 2026 - TEAMS & PARTICIPANTS",
      `Total Teams: ${teamsData.length}`,
      10
    );
    const teamHRow = teamSheet.addRow([
      "Sl No", "Team Name", "Team ID", "College Name", "Member Name", "Phone", "Email", "Events", "Payment Status", "UTR"
    ]);
    formatHeaderRow(teamHRow);

    let tIdx = 1;
    teamsData.forEach((t) => {
      const evs = t.registeredEvents.map((e) => e.title).join(", ") || "None";
      (t.members && t.members.length > 0 ? t.members : [{ name: t.leader ? t.leader.name : "N/A" }]).forEach((m) => {
        const row = teamSheet.addRow([
          tIdx++,
          t.teamName,
          t.teamId,
          t.collegeName,
          m.name || "N/A",
          m.phone || "N/A",
          m.email || "N/A",
          evs,
          t.paymentStatus.toUpperCase(),
          t.paymentUtr || "N/A",
        ]);
        formatDataRow(row, tIdx % 2 === 0);
        applyStatusStyle(row.getCell(9), t.paymentStatus);
      });
    });
    autoFitColumns(teamSheet);

    // 3. Event Participants Sheet
    const evSheet = workbook.addWorksheet("Event Participants");
    addReportTitle(
      evSheet,
      "SEMAPHORE 2026 - EVENT PARTICIPANTS",
      `Total Events: ${eventsData.length}`,
      11
    );
    const evHRow = evSheet.addRow([
      "Sl No", "Event Title", "College Name", "Team Name", "Team ID", "Participant Name", "Phone", "Email", "Payment Status", "UTR", "Date"
    ]);
    formatHeaderRow(evHRow);

    let epIdx = 1;
    eventsData.forEach((ev) => {
      ev.participants.forEach((p) => {
        const row = evSheet.addRow([
          epIdx++,
          ev.title,
          p.collegeName,
          p.teamName,
          p.teamId,
          p.participantName,
          p.participantPhone || "N/A",
          p.participantEmail || "N/A",
          p.paymentStatus.toUpperCase(),
          p.paymentUtr || "N/A",
          p.registeredAt ? new Date(p.registeredAt).toLocaleDateString("en-IN") : "N/A",
        ]);
        formatDataRow(row, epIdx % 2 === 0);
        applyStatusStyle(row.getCell(9), p.paymentStatus);
      });
    });
    autoFitColumns(evSheet);

    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `Semaphore2026_Master_Export_${timestamp}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(buffer);
  } catch (error) {
    console.error("Export Master Excel Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================================
// 5. JSON REPORT CONTROLLERS (FOR ADMIN DASHBOARD & PREVIEWS)
// ============================================================================

// @desc    Get Teams report as JSON
// @route   GET /api/admin/reports/teams
// @access  Private (Admin / Superadmin)
const getTeamsReportJson = async (req, res) => {
  try {
    const teams = await fetchAllTeamsData();
    res.status(200).json({
      count: teams.length,
      teams,
    });
  } catch (error) {
    console.error("Get Teams Report Error:", error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Helper to fetch complete comprehensive college details including all events and all payment transactions
 */
const fetchCollegeComprehensiveData = async (collegeIdentifier = null) => {
  let collegeQuery = {};
  if (collegeIdentifier) {
    if (mongoose.Types.ObjectId.isValid(collegeIdentifier)) {
      collegeQuery = { _id: collegeIdentifier };
    } else {
      collegeQuery = { collegeName: { $regex: new RegExp(`^${collegeIdentifier.trim()}$`, "i") } };
    }
  }

  const colleges = await College.find(collegeQuery).sort({ collegeName: 1 });
  const result = [];

  for (const college of colleges) {
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

          // Collect and parse all linked payments for this event registration
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
                  approvedByName: appBy.name || "N/A",
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

          let eventStatus = "Yet to Pay";
          if (linkedPayments.length === 0) {
            eventStatus = "Yet to Pay";
          } else if (approvedPaid >= fee && fee > 0) {
            eventStatus = "Approved";
          } else if (approvedPaid > 0 && balanceDue > 0) {
            eventStatus = `Partially Paid (Yet to Pay ₹${balanceDue})`;
          } else if (pendingPaid > 0 && approvedPaid === 0) {
            eventStatus = "Pending Approval";
          } else if (linkedPayments.some((p) => p.status === "rejected")) {
            eventStatus = "Rejected";
          } else {
            eventStatus = linkedPayments[0].status ? linkedPayments[0].status.toUpperCase() : "Pending";
          }

          // Build human-readable breakdown of all payments for this event
          const paymentBreakdownList = linkedPayments.map((p, pIndex) => {
            return `Payment #${pIndex + 1}: ₹${p.amount} (UTR: ${p.utr}, Status: ${p.status.toUpperCase()})`;
          });

          const paymentBreakdownStr = paymentBreakdownList.length > 0
            ? paymentBreakdownList.join(" | ")
            : "No payment submitted yet (Yet to Pay)";

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
            pendingPaid: pendingPaid,
            balanceDue: balanceDue,
            isYetToPay: balanceDue > 0,
            paymentStatus: eventStatus,
            paymentsCount: linkedPayments.length,
            payments: linkedPayments,
            paymentBreakdown: paymentBreakdownStr,
            utrs: linkedPayments.map((p) => p.utr).filter(Boolean),
            paymentUtr: linkedPayments.map((p) => p.utr).filter(Boolean).join(", ") || "N/A",
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
      const teamPendingPaid = teamEvents.reduce((s, e) => s + e.pendingPaid, 0);
      const teamBalanceDue = Math.max(0, teamTotalFee - teamApprovedPaid);

      let teamPaymentStatus = "Yet to Pay";
      if (teamEvents.length === 0) {
        teamPaymentStatus = "No Events Registered";
      } else if (teamApprovedPaid >= teamTotalFee && teamTotalFee > 0) {
        teamPaymentStatus = "Approved";
      } else if (teamApprovedPaid > 0 && teamBalanceDue > 0) {
        teamPaymentStatus = `Partially Paid (Yet to Pay ₹${teamBalanceDue})`;
      } else if (teamPendingPaid > 0) {
        teamPaymentStatus = "Pending Approval";
      } else {
        teamPaymentStatus = "Yet to Pay";
      }

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
        pendingAmount: teamPendingPaid,
        balanceDue: teamBalanceDue,
        isYetToPay: teamBalanceDue > 0,
        paymentStatus: teamPaymentStatus,
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

    // Financial totals
    const totalEventsFee = allCollegeEventsList.reduce((s, e) => s + (e.registrationFee || 0), 0);
    const totalPaymentsSubmitted = paymentsList.reduce((s, p) => s + (p.amount || 0), 0);
    const totalApprovedAmount = paymentsList
      .filter((p) => p.status === "approved" || p.status === "verified")
      .reduce((s, p) => s + (p.amount || 0), 0);
    const totalPendingAmount = paymentsList
      .filter((p) => p.status === "pending" || p.status === "submitted")
      .reduce((s, p) => s + (p.amount || 0), 0);
    const balanceDue = Math.max(0, totalEventsFee - totalApprovedAmount);

    let overallPaymentStatus = "Yet to Pay";
    if (paymentsList.length === 0 && totalEventsFee > 0) {
      overallPaymentStatus = "Yet to Pay";
    } else if (totalApprovedAmount >= totalEventsFee && totalEventsFee > 0) {
      overallPaymentStatus = "Approved";
    } else if (totalApprovedAmount > 0 && balanceDue > 0) {
      overallPaymentStatus = `Partially Paid (Yet to Pay ₹${balanceDue})`;
    } else if (totalPendingAmount > 0) {
      overallPaymentStatus = "Pending Approval";
    } else if (paymentsList.some((p) => p.status === "rejected")) {
      overallPaymentStatus = "Rejected";
    } else {
      overallPaymentStatus = "Unpaid";
    }

    result.push({
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
    });
  }

  return result;
};

// ============================================================================
// 6. EXCEL EXPORT: COMPREHENSIVE COLLEGE DETAILS (WITH ALL EVENTS & PAYMENTS)
// ============================================================================

// @desc    Export Comprehensive Excel file for a single college or all colleges with all events and payments
// @route   GET /api/admin/export/college-comprehensive (or /api/admin/export/college/:collegeId)
// @access  Private (Admin / Superadmin)
const exportCollegeComprehensiveExcel = async (req, res) => {
  try {
    const collegeIdentifier = req.params.collegeId || req.query.collegeId || req.query.collegeName || null;
    const collegesData = await fetchCollegeComprehensiveData(collegeIdentifier);

    if (collegeIdentifier && collegesData.length === 0) {
      return res.status(404).json({ message: "College not found" });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Semaphore 2026 Admin";
    workbook.created = new Date();

    const isSingleCollege = collegesData.length === 1;
    const mainTitle = isSingleCollege
      ? `SEMAPHORE 2026 - ${collegesData[0].collegeName.toUpperCase()} FULL REPORT`
      : "SEMAPHORE 2026 - COLLEGES COMPREHENSIVE REPORT (EVENTS & PAYMENTS)";

    // ------------------------------------------------------------------------
    // Sheet 1: College(s) Summary & Financial Overview
    // ------------------------------------------------------------------------
    const summarySheet = workbook.addWorksheet(
      sanitizeSheetName("College Summary", "College Summary")
    );
    addReportTitle(
      summarySheet,
      mainTitle,
      `Total Colleges: ${collegesData.length} | Includes Teams, Registered Events, Multiple Payments & Yet to Pay Balances`,
      12
    );

    const summaryHeaders = [
      "Sl No",
      "College Name",
      "Teams Registered",
      "Team 1 Name",
      "Team 1 Leader",
      "Team 2 Name",
      "Team 2 Leader",
      "Total Events",
      "Total Fee (₹)",
      "Approved Paid (₹)",
      "Pending (₹)",
      "Yet to Pay / Balance (₹)",
      "Overall Payment Status",
    ];

    const sHeaderRow = summarySheet.addRow(summaryHeaders);
    formatHeaderRow(sHeaderRow);

    collegesData.forEach((col, index) => {
      const t1 = col.team1;
      const t2 = col.team2;
      const fin = col.financialSummary;

      const row = summarySheet.addRow([
        index + 1,
        col.collegeName,
        `${col.registeredTeamsCount} / 2`,
        t1 ? t1.teamName : "No Team",
        t1 && t1.leader ? `${t1.leader.name} (${t1.leader.phone || t1.leader.email})` : "N/A",
        t2 ? t2.teamName : "No Second Team",
        t2 && t2.leader ? `${t2.leader.name} (${t2.leader.phone || t2.leader.email})` : "None",
        col.eventsCount,
        fin.totalEventsFee,
        fin.totalApprovedAmount,
        fin.totalPendingAmount,
        fin.yetToPay,
        fin.overallPaymentStatus,
      ]);

      const isEven = index % 2 === 1;
      formatDataRow(row, isEven, {
        1: { vertical: "middle", horizontal: "center" },
        3: { vertical: "middle", horizontal: "center" },
        8: { vertical: "middle", horizontal: "center" },
        9: { vertical: "middle", horizontal: "right" },
        10: { vertical: "middle", horizontal: "right" },
        11: { vertical: "middle", horizontal: "right" },
        12: { vertical: "middle", horizontal: "right" },
        13: { vertical: "middle", horizontal: "center" },
      });

      applyStatusStyle(row.getCell(13), fin.overallPaymentStatus);
    });

    autoFitColumns(summarySheet, {
      1: 8,
      2: 30,
      3: 18,
      4: 22,
      5: 28,
      6: 22,
      7: 28,
      8: 14,
      9: 16,
      10: 18,
      11: 16,
      12: 24,
      13: 26,
    });

    // ------------------------------------------------------------------------
    // Sheet 2: Teams & Members Roster
    // ------------------------------------------------------------------------
    const rosterSheet = workbook.addWorksheet(
      sanitizeSheetName("Teams & Members", "Teams & Members")
    );
    addReportTitle(
      rosterSheet,
      "TEAMS & PARTICIPANTS ROSTER",
      "List of all registered teams, team leaders, participant members, and payment status",
      13
    );

    const rosterHeaders = [
      "Sl No",
      "College Name",
      "Team Slot",
      "Team Name",
      "Team ID / Code",
      "Member Name",
      "Member Phone",
      "Member Email",
      "Role",
      "Registered Events",
      "Total Fee (₹)",
      "Approved Paid (₹)",
      "Yet to Pay (₹)",
      "Team Payment Status",
    ];

    const rHeaderRow = rosterSheet.addRow(rosterHeaders);
    formatHeaderRow(rHeaderRow);

    let rIdx = 1;
    collegesData.forEach((col) => {
      col.teams.forEach((team) => {
        const teamEventsStr = team.events.map((e) => e.title).join(", ") || "None";
        team.members.forEach((m) => {
          const row = rosterSheet.addRow([
            rIdx++,
            col.collegeName,
            team.slot,
            team.teamName,
            team.teamId,
            m.name || "N/A",
            m.phone || "N/A",
            m.email || "N/A",
            m.role || "Member",
            teamEventsStr,
            team.totalFee,
            team.amountPaid,
            team.balanceDue,
            team.paymentStatus,
          ]);

          const isEven = rIdx % 2 === 0;
          formatDataRow(row, isEven, {
            1: { vertical: "middle", horizontal: "center" },
            3: { vertical: "middle", horizontal: "center" },
            5: { vertical: "middle", horizontal: "center" },
            7: { vertical: "middle", horizontal: "center" },
            9: { vertical: "middle", horizontal: "center" },
            11: { vertical: "middle", horizontal: "right" },
            12: { vertical: "middle", horizontal: "right" },
            13: { vertical: "middle", horizontal: "right" },
            14: { vertical: "middle", horizontal: "center" },
          });

          applyStatusStyle(row.getCell(14), team.paymentStatus);
        });
      });
    });

    autoFitColumns(rosterSheet, {
      1: 8,
      2: 30,
      3: 14,
      4: 22,
      5: 20,
      6: 22,
      7: 18,
      8: 26,
      9: 16,
      10: 32,
      11: 16,
      12: 18,
      13: 18,
      14: 26,
    });

    // ------------------------------------------------------------------------
    // Sheet 3: Registered Events & Payments Detailed
    // ------------------------------------------------------------------------
    const eventsSheet = workbook.addWorksheet(
      sanitizeSheetName("Registered Events", "Registered Events")
    );
    addReportTitle(
      eventsSheet,
      "REGISTERED EVENTS & DETAILED PAYMENTS",
      "Event breakdown with multiple payment transactions, paid amounts, and yet to pay balances",
      15
    );

    const eventHeaders = [
      "Sl No",
      "College Name",
      "Team Slot",
      "Team Name",
      "Team ID",
      "Event Title",
      "Location",
      "Date",
      "Fee (₹)",
      "Amount Paid (₹)",
      "Yet to Pay (₹)",
      "Payment Status",
      "Payment Breakdown (Multiple Payments)",
      "Payment UTR(s)",
      "Assigned Participants",
      "Registered Date",
    ];

    const eHeaderRow = eventsSheet.addRow(eventHeaders);
    formatHeaderRow(eHeaderRow);

    let eIdx = 1;
    collegesData.forEach((col) => {
      col.events.forEach((ev) => {
        const participantsStr = ev.participants
          .map((p) => `${p.name}${p.phone && p.phone !== "N/A" ? ` (${p.phone})` : ""}`)
          .join(", ");

        const regDateStr = ev.registeredAt
          ? new Date(ev.registeredAt).toLocaleDateString("en-IN")
          : "N/A";

        const row = eventsSheet.addRow([
          eIdx++,
          col.collegeName,
          ev.teamSlot,
          ev.teamName,
          ev.teamId,
          ev.title,
          ev.location,
          ev.date ? new Date(ev.date).toLocaleDateString("en-IN") : "N/A",
          ev.registrationFee,
          ev.amountPaid,
          ev.balanceDue,
          ev.paymentStatus,
          ev.paymentBreakdown,
          ev.paymentUtr,
          participantsStr || "Team",
          regDateStr,
        ]);

        const isEven = eIdx % 2 === 0;
        formatDataRow(row, isEven, {
          1: { vertical: "middle", horizontal: "center" },
          3: { vertical: "middle", horizontal: "center" },
          5: { vertical: "middle", horizontal: "center" },
          8: { vertical: "middle", horizontal: "center" },
          9: { vertical: "middle", horizontal: "right" },
          10: { vertical: "middle", horizontal: "right" },
          11: { vertical: "middle", horizontal: "right" },
          12: { vertical: "middle", horizontal: "center" },
          16: { vertical: "middle", horizontal: "center" },
        });

        applyStatusStyle(row.getCell(12), ev.paymentStatus);
      });
    });

    autoFitColumns(eventsSheet, {
      1: 8,
      2: 30,
      3: 14,
      4: 22,
      5: 18,
      6: 24,
      7: 18,
      8: 14,
      9: 12,
      10: 16,
      11: 16,
      12: 24,
      13: 45,
      14: 22,
      15: 36,
      16: 16,
    });

    // ------------------------------------------------------------------------
    // Sheet 4: All Payment Transactions
    // ------------------------------------------------------------------------
    const paymentsSheet = workbook.addWorksheet(
      sanitizeSheetName("Payment Details", "Payment Details")
    );
    addReportTitle(
      paymentsSheet,
      "COLLEGE PAYMENT TRANSACTIONS & PROOF",
      "Full audit trail of all payment submissions, UTR numbers, amounts, approval status, and remarks",
      12
    );

    const paymentHeaders = [
      "Sl No",
      "College Name",
      "Team Name",
      "Team ID",
      "Paid By (User)",
      "Payer Email",
      "Amount (₹)",
      "UTR Number",
      "Payment Status",
      "Admin Remarks",
      "Approved By",
      "Payment Date",
    ];

    const pHeaderRow = paymentsSheet.addRow(paymentHeaders);
    formatHeaderRow(pHeaderRow);

    let pIdx = 1;
    collegesData.forEach((col) => {
      col.payments.forEach((pay) => {
        const payDateStr = pay.createdAt
          ? new Date(pay.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
          : "N/A";

        const row = paymentsSheet.addRow([
          pIdx++,
          col.collegeName,
          pay.teamName,
          pay.teamId,
          pay.paidBy ? pay.paidBy.name : "N/A",
          pay.paidBy ? pay.paidBy.email : "N/A",
          pay.amount,
          pay.utr || "N/A",
          pay.status.toUpperCase(),
          pay.message || "None",
          pay.approvedByName,
          payDateStr,
        ]);

        const isEven = pIdx % 2 === 0;
        formatDataRow(row, isEven, {
          1: { vertical: "middle", horizontal: "center" },
          4: { vertical: "middle", horizontal: "center" },
          7: { vertical: "middle", horizontal: "right" },
          8: { vertical: "middle", horizontal: "center" },
          9: { vertical: "middle", horizontal: "center" },
          12: { vertical: "middle", horizontal: "center" },
        });

        applyStatusStyle(row.getCell(9), pay.status);
      });
    });

    autoFitColumns(paymentsSheet, {
      1: 8,
      2: 30,
      3: 22,
      4: 18,
      5: 22,
      6: 26,
      7: 14,
      8: 22,
      9: 16,
      10: 26,
      11: 22,
      12: 24,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = isSingleCollege
      ? `Semaphore2026_${collegesData[0].collegeName.replace(/\s+/g, "_")}_Full_Details_${timestamp}.xlsx`
      : `Semaphore2026_Colleges_Comprehensive_Details_${timestamp}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(buffer);
  } catch (error) {
    console.error("Export College Comprehensive Excel Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get College comprehensive data (including all events and payments) as JSON
// @route   GET /api/admin/reports/college-comprehensive (or /api/admin/reports/college/:collegeId)
// @access  Private (Admin / Superadmin)
const getCollegeComprehensiveJson = async (req, res) => {
  try {
    const collegeIdentifier = req.params.collegeId || req.query.collegeId || req.query.collegeName || null;
    const colleges = await fetchCollegeComprehensiveData(collegeIdentifier);

    res.status(200).json({
      count: colleges.length,
      colleges,
    });
  } catch (error) {
    console.error("Get College Comprehensive JSON Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get Event participants report as JSON
// @route   GET /api/admin/reports/events
// @access  Private (Admin / Superadmin)
const getEventsReportJson = async (req, res) => {
  try {
    const targetEventId = req.query.eventId || req.query.eventid || null;
    const events = await fetchAllEventsData(targetEventId);
    const totalParticipants = events.reduce((s, e) => s + e.totalParticipantsCount, 0);

    res.status(200).json({
      eventsCount: events.length,
      totalParticipantsCount: totalParticipants,
      events,
    });
  } catch (error) {
    console.error("Get Events Report Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get College-wise 2-teams report as JSON
// @route   GET /api/admin/reports/colleges
// @access  Private (Admin / Superadmin)
const getCollegesReportJson = async (req, res) => {
  try {
    const colleges = await fetchAllCollegesData();
    res.status(200).json({
      collegesCount: colleges.length,
      colleges,
    });
  } catch (error) {
    console.error("Get Colleges Report Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get high-level summary stats for admin dashboard
// @route   GET /api/admin/reports/summary
// @access  Private (Admin / Superadmin)
const getReportsSummaryJson = async (req, res) => {
  try {
    const [totalUsers, totalColleges, totalTeams, totalEvents, totalRegistrations, payments] =
      await Promise.all([
        User.countDocuments(),
        College.countDocuments(),
        Team.countDocuments(),
        Event.countDocuments(),
        EventRegistration.countDocuments(),
        Payment.find(),
      ]);

    const approvedPayments = payments.filter((p) => p.status === "approved" || p.status === "verified");
    const pendingPayments = payments.filter((p) => p.status === "pending" || p.status === "submitted");
    const totalRevenue = approvedPayments.reduce((s, p) => s + (p.amount || 0), 0);

    res.status(200).json({
      summary: {
        totalUsers,
        totalColleges,
        totalTeams,
        totalEvents,
        totalRegistrations,
        totalPayments: payments.length,
        approvedPaymentsCount: approvedPayments.length,
        pendingPaymentsCount: pendingPayments.length,
        totalRevenue,
      },
    });
  } catch (error) {
    console.error("Get Summary Report Error:", error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  exportTeamsExcel,
  exportEventsExcel,
  exportCollegesExcel,
  exportMasterExcel,
  exportCollegeComprehensiveExcel,
  getTeamsReportJson,
  getEventsReportJson,
  getCollegesReportJson,
  getCollegeComprehensiveJson,
  getReportsSummaryJson,
  fetchAllTeamsData,
  fetchAllEventsData,
  fetchAllCollegesData,
  fetchCollegeComprehensiveData,
};

