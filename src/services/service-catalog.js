// The existing website `services` table stores editorial fields, not the
// mobile app's service codes or booking modes. Translate known services into
// the existing mobile contract without assuming `services.id` is the same as
// reservations.service_type.
const normalizeWords = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const serviceCodeFromWebsiteRow = (service) => {
  const words = normalizeWords(`${service.slug ?? ''} ${service.title ?? ''}`);

  // More specific service names must take precedence over broad ones like
  // "airport transfer" or "chauffeur".
  if (/\bconcierge\b/.test(words)) return 'CONCIERGE';
  if (
    /\b(?:vip|meet and greet|meet greet|fast track)\b/.test(words) &&
    /\b(?:airport|terminal|flight)\b/.test(words)
  ) {
    return 'AIRPORT_VIP';
  }
  if (/\btransfer(s)?\b|\bpoint to point\b/.test(words)) return 'TRANSFER';
  if (
    /\b(?:car rental|car rentals|rent a car|rent car|car rent|rental car|self drive|self driven)\b/.test(
      words,
    )
  ) {
    return 'CAR_RENTAL';
  }
  if (/\b(?:chauffeur|chauffeured|limousine|limo)\b|\bcar with driver\b/.test(words)) {
    return 'CHAUFFEUR';
  }

  // Preserve other website services in the catalog but do not pretend they
  // support instant checkout. They need their own manual-booking integration.
  const fallback = normalizeWords(service.slug || service.title || `service ${service.id}`)
    .replace(/\s+/g, '_')
    .toUpperCase();
  return fallback || `SERVICE_${service.id}`;
};

export const websiteServiceToCatalogItem = (service, legacyServiceTypes) => {
  const code = serviceCodeFromWebsiteRow(service);
  const legacyServiceId = legacyServiceTypes[code] ?? null;
  return {
    code,
    title: service.title,
    description: service.description_en ?? null,
    iconUrl: service.image ?? null,
    bookingMode: legacyServiceId === null ? 'MANUAL_REQUEST' : 'INSTANT',
    legacyServiceId,
  };
};
