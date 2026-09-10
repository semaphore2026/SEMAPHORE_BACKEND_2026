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
 * Recursively sanitizes objects to mask sensitive fields like passwords or tokens,
 * while safely handling circular references, Mongoose documents, and deep nesting.
 * @param {any} data 
 * @param {WeakSet} [seen]
 * @param {number} [depth]
 * @returns {any}
 */
const sanitizeData = (data, seen = new WeakSet(), depth = 0) => {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;

  // Max recursion depth safety net
  if (depth > 6) return "[MaxDepth]";

  // Handle circular references
  if (seen.has(data)) return "[Circular]";
  seen.add(data);

  // Convert Mongoose documents to plain objects if applicable
  if (typeof data.toObject === "function") {
    try {
      return sanitizeData(data.toObject(), seen, depth);
    } catch (e) {}
  } else if (typeof data.toJSON === "function" && !(data instanceof Date)) {
    try {
      return sanitizeData(data.toJSON(), seen, depth);
    } catch (e) {}
  }

  // Handle special object types
  if (data instanceof Date) return data.toISOString();
  if (data instanceof RegExp) return data.toString();
  if (Buffer.isBuffer(data)) return "[Buffer]";
  if (data._bsontype || (data.constructor && data.constructor.name === "ObjectId")) {
    return data.toString();
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item, seen, depth + 1));
  }

  const sanitized = {};
  for (const key of Object.keys(data)) {
    // Skip internal Mongoose or Node private fields except _id
    if (key.startsWith("$") || (key.startsWith("_") && key !== "_id" && key !== "__v")) {
      continue;
    }

    const lowerKey = key.toLowerCase();
    const value = data[key];

    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = "********";
    } else if (value !== null && typeof value === "object") {
      sanitized[key] = sanitizeData(value, seen, depth + 1);
    } else if (typeof value === "function") {
      continue;
    } else {
      sanitized[key] = value;
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
    return "[Unserializable Data]";
  }
};

/**
 * Formats current date & time to Indian Standard Time (IST - Asia/Kolkata)
 * Example output: "18 Sept 02:08 PM"
 */
const getTimestamp = () => {
  const date = new Date();
  const options = {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  };
  const parts = new Intl.DateTimeFormat("en-IN", options).formatToParts(date);

  let day = "", month = "", hour = "", minute = "", dayPeriod = "";
  for (const part of parts) {
    if (part.type === "day") day = part.value;
    if (part.type === "month") month = part.value;
    if (part.type === "hour") hour = part.value;
    if (part.type === "minute") minute = part.value;
    if (part.type === "dayPeriod") dayPeriod = part.value.toUpperCase();
  }
  return `${day} ${month} ${hour}:${minute} ${dayPeriod}`;
};

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

  getTimestamp,
  sanitizeData,
  formatPayload,
};

module.exports = logger;
