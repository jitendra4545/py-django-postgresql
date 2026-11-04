// MySQL exposes JSON as a native wire type; MariaDB exposes its JSON alias as
// LONGTEXT. Normalize only known JSON fields so the frontend keeps the object/
// array contract. Ordinary descriptions, notes and strings are never parsed.
export const JSON_FIELDS = new Set([
  'data', 'details', 'quote_data', 'quoteData', 'provider_payload', 'providerPayload',
  'pickup_details', 'dropoff_details', 'pickupDetails', 'dropoffDetails',
  'requested_changes', 'requestedChanges', 'document_ids', 'documentIds',
  'response_body', 'responseBody',
]);
export const normalizeJsonRows = (rows) => {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => {
    if (row == null || typeof row !== 'object' || Array.isArray(row)) return row;
    for (const field of JSON_FIELDS) {
      if (typeof row[field] !== 'string') continue;
      try { row[field] = JSON.parse(row[field]); } catch { /* Legacy non-JSON text is preserved. */ }
    }
    return row;
  });
};
