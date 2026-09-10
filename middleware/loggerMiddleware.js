const logger = require("../utils/logger");

/**
 * Express middleware to log every HTTP request, especially transactional operations,
 * state updates, and error responses to the console.
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

    // Check user/admin identity attached during request lifecycle
    const userContext = req.user || req.admin || null;

    // Determine if request is a transactional or update operation
    const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
    const isError = statusCode >= 400;

    if (isMutation) {
      const logType = isError ? "TRANSACTION ERROR" : "TRANSACTION SUCCESS";
      logger.transaction(logType, {
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
      // GET or HEAD request resulted in error (4xx / 5xx)
      logger.transaction("REQUEST ERROR", {
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
      // Standard successful read/GET request
      const userStr = userContext
        ? ` | User: ${userContext._id || userContext.id} (${userContext.email || userContext.name || "User"})`
        : "";
      logger.info(`[HTTP ${method}] ${url} - Status: ${statusCode} (${duration}ms)${userStr}`);
    }
  });

  next();
};

module.exports = loggerMiddleware;
