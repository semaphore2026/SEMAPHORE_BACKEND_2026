const logger = require("../utils/logger");
const TransactionLog = require("../models/TransactionLog");
const mongoose = require("mongoose");
/**
 * Express middleware to log every HTTP request to the console and persist
 * transaction & error logs into the MongoDB `TransactionLog` collection.
 */
const loggerMiddleware = (req, res, next) => {
  const startTime = Date.now();

  // Intercept response payload
  let responseBody = null;

  const originalJson = res.json;
  res.json = function (body) {
    responseBody = body;
    return originalJson.apply(this, arguments);
  };

  const originalSend = res.send;
  res.send = function (body) {
    if (responseBody === null) {
      try {
        responseBody = typeof body === "string" ? JSON.parse(body) : body;
      } catch (e) {
        responseBody = body;
      }
    }
    return originalSend.apply(this, arguments);
  };

  // When request completes
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const method = req.method;
    const url = req.originalUrl || req.url;

    // Skip logging the logs-fetching endpoint itself to prevent noise
    if (url.includes("/api/admin/logs")) {
      return;
    }

    // Check user/admin identity attached during request lifecycle
    const userContext = req.user || req.admin || null;
    let sanitizedUser = null;
    if (userContext) {
      sanitizedUser = {
        id: userContext._id || userContext.id || null,
        email: userContext.email || null,
        name: userContext.name || null,
        role: userContext.role || "user",
      };
    }

    // Determine request type
    const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
    const isError = statusCode >= 400;

    let type = "HTTP GET";
    if (isMutation) {
      type = isError ? "TRANSACTION ERROR" : "TRANSACTION SUCCESS";
    } else if (isError) {
      type = "REQUEST ERROR";
    }

    // 1. Console Output
    if (isMutation) {
      logger.transaction(type, {
        method,
        url,
        status: statusCode,
        duration,
        user: userContext,
        query: req.query,
        params: req.params,
        body: req.body,
        response: isError ? null : responseBody,
        error: isError ? responseBody : null,
      });
    } else if (isError) {
      logger.transaction(type, {
        method,
        url,
        status: statusCode,
        duration,
        user: userContext,
        query: req.query,
        params: req.params,
        body: req.body,
        error: responseBody,
      });
    } else {
      const userStr = userContext
        ? ` | User: ${userContext._id || userContext.id} (${userContext.email || userContext.name || "User"})`
        : "";
      logger.info(`[HTTP ${method}] ${url} - Status: ${statusCode} (${duration}ms)${userStr}`);
    }

    // 2. Asynchronous MongoDB Persistence (Only when DB connection is active)
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const logDoc = {
        type,
        method,
        url,
        statusCode,
        duration,
        user: sanitizedUser,
        queryParams: req.query && Object.keys(req.query).length > 0 ? logger.sanitizeData(req.query) : null,
        requestParams: req.params && Object.keys(req.params).length > 0 ? logger.sanitizeData(req.params) : null,
        requestBody: req.body && Object.keys(req.body).length > 0 ? logger.sanitizeData(req.body) : null,
        responseData: !isError && responseBody ? logger.sanitizeData(responseBody) : null,
        errorDetails: isError && responseBody ? logger.sanitizeData(responseBody) : null,
        formattedTime: logger.getTimestamp(),
      };

      TransactionLog.create(logDoc).catch((err) => {
        // Non-blocking log persistence error handler
        console.error("[DB LOG SAVE ERROR]", err.message);
      });
    }
  });

  next();
};

module.exports = loggerMiddleware;
