export const asyncHandler = (fn) => (req, res, next) => void Promise.resolve(fn(req, res, next)).catch(next);
export function validate(schema, value) {
    return schema.parse(value);
}
export function ok(res, data, status = 200) {
    return res.status(status).json({ success: true, data });
}
