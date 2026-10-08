import { validationError } from './errors.js';

export const validate =
  (schema, source = 'body') =>
  (request, _response, next) => {
    const parsed = schema.safeParse(request[source]);
    if (!parsed.success) {
      return next(validationError(parsed.error.flatten()));
    }
    request[source] = parsed.data;
    return next();
  };
