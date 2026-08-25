const express = require("express");
const router = express.Router();
const {
  loginAdmin,
  addAdmin,
  makeAdmin,
  getAdminProfile,
  getAllAdmins,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getRecentPayments,
  getPaymentDetails,
  updatePaymentStatusWithMessage,
  deletePayment,
  getUserEventsWithDetails,
  getEventParticipantsByEventAndUser,
  getUserFullDetailsForAdmin,
} = require("../controllers/adminController");
const {
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
} = require("../controllers/adminExportController");
const {
  deleteCollege,
} = require("../controllers/collegeController");
const {
  protectAdmin,
  superadminOnly,
} = require("../middleware/adminAuthMiddleware");

// Public route
router.post("/login", loginAdmin);

// Protected routes (Requires valid Admin JWT token)
router.post("/addadmins", protectAdmin, addAdmin);
router.post("/addadmin", protectAdmin, addAdmin); // Alias

// Protected routes (Superadmin ONLY - change roles)
router.put("/makeadmin", protectAdmin, superadminOnly, makeAdmin);
router.patch("/makeadmin", protectAdmin, superadminOnly, makeAdmin); // Alias
router.post("/makeadmin", protectAdmin, superadminOnly, makeAdmin); // Alias

// Admin profile & list routes
router.get("/me", protectAdmin, getAdminProfile);
router.get("/all", protectAdmin, superadminOnly, getAllAdmins);

// ================= USER MANAGEMENT ROUTES =================
// (Requires valid Admin or Superadmin JWT)
router.get("/users", protectAdmin, getAllUsers);
router.get("/users/:id", protectAdmin, getUserById);
router.put("/users/:id", protectAdmin, updateUser);
router.patch("/users/:id", protectAdmin, updateUser); // Alias
router.delete("/users/:id", protectAdmin, deleteUser);

// ================= USER FULL DETAILS ROUTE (ALL DATA FOR USER) =================
// (Requires valid Admin or Superadmin JWT)
router.get("/user-full-details/:userId", protectAdmin, getUserFullDetailsForAdmin);
router.get("/users/:userId/full-details", protectAdmin, getUserFullDetailsForAdmin); // Alias
router.get("/user-details/:userId", protectAdmin, getUserFullDetailsForAdmin); // Alias

// ================= USER EVENTS DETAILS ROUTE =================
// (Requires valid Admin or Superadmin JWT)
router.get("/user-events/:userId", protectAdmin, getUserEventsWithDetails);
router.get("/users/:userId/events", protectAdmin, getUserEventsWithDetails); // Alias
router.get("/events/user/:userId", protectAdmin, getUserEventsWithDetails); // Alias

// ================= EVENT PARTICIPANTS DETAILS BY EVENT ID & USER ID =================
// (Requires valid Admin or Superadmin JWT)
router.get("/event-participants/:eventId/:userId", protectAdmin, getEventParticipantsByEventAndUser);
router.get("/participants/event/:eventId/user/:userId", protectAdmin, getEventParticipantsByEventAndUser); // Alias
router.get("/event-participants", protectAdmin, getEventParticipantsByEventAndUser); // Query params ?eventId=...&userId=...

// ================= ADMIN PAYMENT MANAGEMENT ROUTES =================
// (Requires valid Admin or Superadmin JWT)
router.get("/recent-payments", protectAdmin, getRecentPayments);
router.get("/payments/recent", protectAdmin, getRecentPayments); // Alias

router.get("/payment-details/:paymentId", protectAdmin, getPaymentDetails);
router.get("/payments/:paymentId", protectAdmin, getPaymentDetails); // Alias

router.post("/payment-status", protectAdmin, updatePaymentStatusWithMessage);
router.put("/payment-status", protectAdmin, updatePaymentStatusWithMessage); // Alias
router.put("/payment-status/:paymentId", protectAdmin, updatePaymentStatusWithMessage); // Alias
router.put("/payments/:paymentId/status", protectAdmin, updatePaymentStatusWithMessage); // Alias

router.delete("/payments/:paymentId", protectAdmin, deletePayment);
router.delete("/payment/:paymentId", protectAdmin, deletePayment); // Alias
router.delete("/payments", protectAdmin, deletePayment); // Alias

// ================= EXCEL EXPORT ROUTES =================
// 1. Teams & Participants Excel Export
router.get("/export/teams", protectAdmin, exportTeamsExcel);
router.get("/export/team-participants", protectAdmin, exportTeamsExcel); // Alias

// 2. Events & Participants (with College Name) Excel Export
router.get("/export/events", protectAdmin, exportEventsExcel);
router.get("/export/events/:eventId", protectAdmin, exportEventsExcel);
router.get("/export/event-participants", protectAdmin, exportEventsExcel); // Alias
router.get("/export/event-participants/:eventId", protectAdmin, exportEventsExcel); // Alias

// 3. College-wise (At-most 2 Teams per College) Excel Export
router.get("/export/colleges", protectAdmin, exportCollegesExcel);
router.get("/export/college-teams", protectAdmin, exportCollegesExcel); // Alias

// 4. College Comprehensive Export (All Events & All Payments Details)
router.get("/export/college-comprehensive", protectAdmin, exportCollegeComprehensiveExcel);
router.get("/export/college-comprehensive/:collegeId", protectAdmin, exportCollegeComprehensiveExcel);
router.get("/export/college-details", protectAdmin, exportCollegeComprehensiveExcel); // Alias
router.get("/export/college/:collegeId", protectAdmin, exportCollegeComprehensiveExcel); // Single college export

// 5. Master Consolidated All-In-One Excel Export
router.get("/export/all", protectAdmin, exportMasterExcel);
router.get("/export/master", protectAdmin, exportMasterExcel); // Alias

// ================= ADMIN JSON REPORTS ROUTES =================
router.get("/reports/teams", protectAdmin, getTeamsReportJson);
router.get("/reports/events", protectAdmin, getEventsReportJson);
router.get("/reports/colleges", protectAdmin, getCollegesReportJson);
router.get("/reports/college-comprehensive", protectAdmin, getCollegeComprehensiveJson);
router.get("/reports/college-comprehensive/:collegeId", protectAdmin, getCollegeComprehensiveJson);
router.get("/reports/college/:collegeId", protectAdmin, getCollegeComprehensiveJson); // Alias
router.get("/reports/summary", protectAdmin, getReportsSummaryJson);

// ================= COLLEGE MANAGEMENT ROUTES =================
router.delete("/colleges/:id", protectAdmin, deleteCollege);

module.exports = router;
