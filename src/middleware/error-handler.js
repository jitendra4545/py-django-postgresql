import { AppError } from '../common/errors.js';

export const notFoundHandler = (request, _response, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `No route for ${request.method} ${request.path}`));
};

export const errorHandler = (error, _request, response, _next) => {
  if (error?.name === 'MulterError') {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 422;
    return response.status(status).json({
      error: { code: error.code, message: error.message },
    });
  }
  const status = error instanceof AppError ? error.status : 500;
  const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
  const message = error instanceof AppError ? error.message : 'An unexpected error occurred';
  if (status >= 500) console.error(error);
  response
    .status(status)
    .json({ error: { code, message, ...(error.details ? { details: error.details } : {}) } });
};
