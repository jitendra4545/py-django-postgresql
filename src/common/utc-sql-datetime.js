// The Node MySQL pool uses timezone:'Z'. Persist ISO-8601 instants as UTC
// DATETIME strings instead of truncating the submitted clock time: an input
// like 12:10+05:30 represents 06:40 UTC, not 12:10 UTC.
export const toUtcSqlDateTime = (isoDateTime) => {
  const instant = new Date(isoDateTime);
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError('Invalid ISO-8601 datetime');
  }
  return instant.toISOString().slice(0, 19).replace('T', ' ');
};
