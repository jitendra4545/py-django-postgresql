// Accept existing body payloads and the text payload commonly used by the apps.
// Response keys remain the original body/messageType/documentId contract.
export function normalizeMessageInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const value = { ...input };
  if (value.body === undefined) value.body = value.text ?? value.message;
  if (value.messageType === undefined && value.documentId != null) value.messageType = 'DOCUMENT';
  return value;
}
