export class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (message = 'Resource not found') => new AppError(404, 'NOT_FOUND', message);

export const forbidden = (message = 'You do not have access to this resource') =>
  new AppError(403, 'FORBIDDEN', message);

export const conflict = (message) => new AppError(409, 'CONFLICT', message);

export const validationError = (details) =>
  new AppError(422, 'VALIDATION_ERROR', 'The request is invalid', details);
