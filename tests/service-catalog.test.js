import { describe, expect, it } from 'vitest';
import {
  serviceCodeFromWebsiteRow,
  websiteServiceToCatalogItem,
} from '../src/services/service-catalog.js';

const legacyTypes = { CHAUFFEUR: 1, CAR_RENTAL: 2, TRANSFER: 3 };

describe('website services table mapping', () => {
  it.each([
    ['chauffeur-service', 'Chauffeur Service', 'CHAUFFEUR', 1],
    ['limousine', 'Limousine', 'CHAUFFEUR', 1],
    ['airport-transfer', 'Airport Transfer', 'TRANSFER', 3],
    ['point-to-point-transfer', 'Point to Point', 'TRANSFER', 3],
    ['rent-a-car', 'Rent A Car', 'CAR_RENTAL', 2],
    ['self-drive-luxury-cars', 'Self Drive Cars', 'CAR_RENTAL', 2],
    ['airport-vip', 'VIP Airport Assistance', 'AIRPORT_VIP', null],
    ['airport-meet-and-greet', 'Airport Meet & Greet', 'AIRPORT_VIP', null],
    ['concierge', 'Private Concierge', 'CONCIERGE', null],
  ])('maps %s to %s', (slug, title, expectedCode, expectedLegacyId) => {
    const result = websiteServiceToCatalogItem(
      { id: 88, slug, title, description_en: 'Details', image: '/test.jpg' },
      legacyTypes,
    );
    expect(result).toEqual({
      code: expectedCode,
      title,
      description: 'Details',
      iconUrl: '/test.jpg',
      bookingMode: expectedLegacyId === null ? 'MANUAL_REQUEST' : 'INSTANT',
      legacyServiceId: expectedLegacyId,
    });
  });

  it('does not interpret arbitrary website IDs as reservation service types', () => {
    const item = websiteServiceToCatalogItem(
      { id: 999, title: 'Private Jet Charter', slug: 'private-jet-charter' },
      legacyTypes,
    );
    expect(item).toEqual({
      code: 'PRIVATE_JET_CHARTER',
      title: 'Private Jet Charter',
      description: null,
      iconUrl: null,
      bookingMode: 'MANUAL_REQUEST',
      legacyServiceId: null,
    });
  });

  it('can classify a service by title when slug is missing', () => {
    expect(serviceCodeFromWebsiteRow({ title: 'Car with Driver' })).toBe('CHAUFFEUR');
  });
});
