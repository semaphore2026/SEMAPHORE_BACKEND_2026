const Payment = require("../models/Payment");

/**
 * Normalizes and strictly validates a UTR (Unique Transaction Reference) string.
 * Rules:
 * 1. Required (rejects null, undefined, empty, or whitespace-only)
 * 2. Trims leading/trailing whitespace
 * 3. Uppercase normalized
 * 4. Only alphanumeric characters (A-Z, 0-9)
 * 5. Length must be between 12 and 22 characters
 *
 * @param {string} utr - The raw UTR input string
 * @returns {string} Normalized uppercase alphanumeric UTR
 * @throws {Error} If validation fails
 */
const normalizeAndValidateUTR = (utr) => {
  if (!utr || typeof utr !== "string" || !utr.trim()) {
    const err = new Error("UTR number is required for payment verification.");
    err.statusCode = 400;
    throw err;
  }

  const normalized = utr.trim().toUpperCase();

  // Allowed characters: A-Z, 0-9; Length: 12-22
  const utrRegex = /^[A-Z0-9]{12,22}$/;
  if (!utrRegex.test(normalized)) {
    const err = new Error(
      "Invalid UTR format. UTR must contain only letters and numbers (no special characters or spaces) and be between 12 and 22 characters long."
    );
    err.statusCode = 400;
    throw err;
  }

  return normalized;
};

/**
 * Checks if a UTR has already been submitted in the system.
 * Handles duplicate detection:
 * - If UTR belongs to a different user -> Reject as duplicate/suspicious.
 * - If UTR belongs to the same user and is approved/pending -> Notify or allow safe update.
 *
 * @param {string} normalizedUtr - Validated uppercase UTR
 * @param {string|ObjectId} currentUserId - ID of the user submitting the payment
 * @param {string|ObjectId|null} excludePaymentId - Optional Payment ID to exclude (for updates)
 * @returns {Promise<{ isExisting: boolean, existingPayment: Object|null }>}
 */
const checkUTRUniqueness = async (normalizedUtr, currentUserId, excludePaymentId = null) => {
  const query = { utr: normalizedUtr };
  if (excludePaymentId) {
    query._id = { $ne: excludePaymentId };
  }

  const existingPayment = await Payment.findOne(query);

  if (existingPayment) {
    const existingUserId = existingPayment.user
      ? (existingPayment.user._id ? existingPayment.user._id.toString() : existingPayment.user.toString())
      : "";

    const currUserStr = currentUserId ? currentUserId.toString() : "";

    // If another user already submitted this UTR (or if user field is set and differs)
    if (!existingUserId || existingUserId !== currUserStr) {
      const err = new Error(
        `UTR '${normalizedUtr}' has already been submitted for another registration. If you believe this is an error, please contact the Semaphore support/helpdesk.`
      );
      err.statusCode = 409;
      throw err;
    }

    return { isExisting: true, existingPayment };
  }

  return { isExisting: false, existingPayment: null };
};

module.exports = {
  normalizeAndValidateUTR,
  checkUTRUniqueness,
};
