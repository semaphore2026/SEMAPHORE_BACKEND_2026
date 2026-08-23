/**
 * Helper function to format an EventRegistration document consistently across all endpoints.
 * @param {Object} reg - The EventRegistration Mongoose document (populated with eventId and paymentId)
 * @returns {Object} Cleanly formatted registration object matching API contracts
 */
const formatRegistration = (reg) => {
  if (!reg) return null;

  const ev = reg.eventId || {};
  const isEvObj = typeof ev === "object" && ev !== null && ev._id;

  const paymentIds = Array.isArray(reg.paymentId)
    ? reg.paymentId.map((p) => (p && p._id ? p._id.toString() : p.toString()))
    : [];

  const userIdStr =
    reg.userId && reg.userId._id
      ? reg.userId._id.toString()
      : reg.userId
      ? reg.userId.toString()
      : "";

  const formattedParticipants = Array.isArray(reg.participants)
    ? reg.participants.map((p) => {
        const item = {
          name: p && p.name ? String(p.name).trim() : "",
          phone: p && p.phone ? String(p.phone).trim() : "",
        };
        if (p && p.email) item.email = String(p.email).trim();
        return item;
      })
    : [];

  return {
    _id: reg._id ? reg._id.toString() : "",
    userId: userIdStr,
    eventId: isEvObj
      ? {
          _id: ev._id ? ev._id.toString() : "",
          title: ev.title || "",
          registrationFee:
            typeof ev.registrationFee === "number"
              ? ev.registrationFee
              : ev.actualPrice || 0,
          ...(ev.description ? { description: ev.description } : {}),
          ...(ev.image ? { image: ev.image } : {}),
          ...(ev.location ? { location: ev.location } : {}),
          ...(ev.date ? { date: ev.date } : {}),
          ...(ev.timings ? { timings: ev.timings } : {}),
          ...(ev.minParticipants !== undefined
            ? { minParticipants: ev.minParticipants }
            : {}),
          ...(ev.maxParticipants !== undefined
            ? { maxParticipants: ev.maxParticipants }
            : {}),
        }
      : ev
      ? ev.toString()
      : "",
    paymentId: paymentIds,
    participants: formattedParticipants,
    createdAt: reg.createdAt || null,
    updatedAt: reg.updatedAt || null,
  };
};

module.exports = { formatRegistration };
