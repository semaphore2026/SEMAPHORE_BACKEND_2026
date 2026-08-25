const ExcelJS = require("exceljs");
const mongoose = require("mongoose");
const User = require("../models/User");
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
  getTeamsReportJson,
  getEventsReportJson,
  getCollegesReportJson,
  getReportsSummaryJson,
  fetchAllTeamsData,
  fetchAllEventsData,
  fetchAllCollegesData,
};
