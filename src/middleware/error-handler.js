import { AppError } from '../common/errors.js';

export const notFoundHandler = (request, _response, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `No route for ${request.method} ${request.path}`));
};

export const errorHandler = (error, _request, response, _next) => {
  if(error?.sqlState==='45000' && String(error.sqlMessage??error.message).includes('DL_VEHICLE_UNAVAILABLE'))error=new AppError(409,'VEHICLE_UNAVAILABLE','The vehicle was reserved by another operation; refresh availability');
  if(['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(error?.code))error=new AppError(409,'CONCURRENT_OPERATION','Another operation changed this booking. Refresh and retry.');
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
