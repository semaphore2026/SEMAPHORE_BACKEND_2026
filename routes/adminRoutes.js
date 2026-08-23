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
  getUserEventsWithDetails,
  getEventParticipantsByEventAndUser,
} = require("../controllers/adminController");
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

module.exports = router;
