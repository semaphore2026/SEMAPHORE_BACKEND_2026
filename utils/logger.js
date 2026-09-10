/**
 * Logger Utility for SEMAPHORE_BACKEND_2026
 * Provides formatted console logging for requests, transactions, updates, and errors.
 */

// List of keys to redact from logs to avoid sensitive data exposure
const SENSITIVE_KEYS = new Set([
  "password",
  "confirmpassword",
  "newpassword",
  "oldpassword",
  "token",
  "secret",
  "authorization",
]);

/**
 * Recursively sanitizes objects to mask sensitive fields like passwords or tokens.
 * @param {any} data 
 * @returns {any}
 */
const sanitizeData = (data) => {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item));
  }

  const sanitized = {};
  for (const key of Object.keys(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = "********";
    } else if (typeof data[key] === "object") {
      sanitized[key] = sanitizeData(data[key]);
    } else {
      sanitized[key] = data[key];
    }
  }
  return sanitized;
};

/**
 * Safely formats payloads or error messages for clean console output.
 * @param {any} data 
 * @returns {string}
 */
const formatPayload = (data) => {
  if (!data) return "";
  if (typeof data === "string") return data;
  try {
    const sanitized = sanitizeData(data);
    return JSON.stringify(sanitized);
  } catch (err) {
    return String(data);
  }
};

const getTimestamp = () => new Date().toISOString();

const logger = {
  /**
   * General informational log
   */
  info: (message, meta) => {
    const metaStr = meta ? ` | ${formatPayload(meta)}` : "";
    console.log(`[INFO] [${getTimestamp()}] ${message}${metaStr}`);
  },

  /**
   * Warning log
   */
  warn: (message, meta) => {
    const metaStr = meta ? ` | ${formatPayload(meta)}` : "";
    console.warn(`[WARN] [${getTimestamp()}] ${message}${metaStr}`);
  },

  /**
   * Log transactional/update operations
   * @param {string} type - e.g., 'TRANSACTION SUCCESS', 'TRANSACTION ERROR', 'UPDATE SUCCESS'
   * @param {Object} details - Details regarding route, method, user, payload, status, response/error
   */
  transaction: (type, details = {}) => {
    const timestamp = getTimestamp();
    const {
      method = "UNKNOWN",
      url = "/",
      status = 200,
      duration = 0,
      user = null,
      query = null,
      params = null,
      body = null,
      response = null,
      error = null,
    } = details;

    const userStr = user
      ? (typeof user === "object" ? `${user._id || user.id || "ID"} (${user.email || user.name || user.role || "User"})` : String(user))
      : "Unauthenticated";

    const isError = status >= 400 || !!error;
    const tag = isError ? `[${type || "TRANSACTION ERROR"}]` : `[${type || "TRANSACTION SUCCESS"}]`;

    console.log(`\n================================================================================`);
    console.log(`${tag} ${timestamp}`);
    console.log(`Method & Route : ${method} ${url}`);
    console.log(`Status Code    : ${status} (${duration}ms)`);
    console.log(`User Context   : ${userStr}`);

    if (params && Object.keys(params).length > 0) {
      console.log(`Params         : ${formatPayload(params)}`);
    }
    if (query && Object.keys(query).length > 0) {
      console.log(`Query          : ${formatPayload(query)}`);
    }
    if (body && Object.keys(body).length > 0) {
      console.log(`Request Body   : ${formatPayload(body)}`);
    }

    if (isError) {
      const errDetail = error || response || "Unknown error";
      console.error(`Error Details  : ${typeof errDetail === "object" ? formatPayload(errDetail) : errDetail}`);
    } else if (response) {
      console.log(`Response Data  : ${formatPayload(response)}`);
    }
    console.log(`================================================================================\n`);
  },

  /**
   * System or unhandled error log
   */
  error: (message, error = null, meta = null) => {
    const timestamp = getTimestamp();
    console.error(`\n[ERROR] [${timestamp}] ${message}`);
    if (meta) {
      console.error(`Meta Context   : ${formatPayload(meta)}`);
    }
    if (error) {
      if (error.stack) {
        console.error(`Stack Trace    :\n${error.stack}`);
      } else {
        console.error(`Error Payload  : ${formatPayload(error)}`);
      }
    }
    console.error(``);
  },

  sanitizeData,
  formatPayload,
};

module.exports = logger;
