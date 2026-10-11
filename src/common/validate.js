// import { validationError } from './errors.js';

// export const validate =
//   (schema, source = 'body') =>
//   (request, _response, next) => {
//     const parsed = schema.safeParse(request[source]);
//     if (!parsed.success) {
//       return next(validationError(parsed.error.flatten()));
//     }
//     request[source] = parsed.data;
//     return next();
//   };


import { validationError } from './errors.js';

export const validate =
  (schema, source = 'body') =>
  (request, _response, next) => {
    const parsed = schema.safeParse(request[source]);

    if (!parsed.success) {
      return next(validationError(parsed.error.flatten()));
    }

    if (source === 'query') {
      /*
       * Express 5 defines request.query as a getter-only property.
       * Define a request-level value containing Zod's validated and
       * transformed query parameters.
       */
      Object.defineProperty(request, 'query', {
        value: parsed.data,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } else {
      request[source] = parsed.data;
    }

    return next();
  };