'use strict';

function errorHandler(err, req, res, next) {
  const isProduction = process.env.NODE_ENV === 'production';

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  console.error(`[${new Date().toISOString()}] Error ${status}: ${message}`);
  if (!isProduction && err.stack) {
    console.error(err.stack);
  }

  const response = { error: message };

  if (!isProduction && err.details) {
    response.details = err.details;
  }

  res.status(status).json(response);
}

function createError(message, status = 500, details = null) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

module.exports = { errorHandler, createError };
