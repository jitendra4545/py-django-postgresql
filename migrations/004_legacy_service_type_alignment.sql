-- app_service_catalog.legacy_service_id is written directly to reservations.service_type.
-- The PHP reservation flow uses 1=car with driver, 2=rent a car, 3=transfer.
UPDATE app_service_catalog SET legacy_service_id=1,updated_at=NOW() WHERE code='CHAUFFEUR';
UPDATE app_service_catalog SET legacy_service_id=2,updated_at=NOW() WHERE code='CAR_RENTAL';
UPDATE app_service_catalog SET legacy_service_id=3,updated_at=NOW() WHERE code='TRANSFER';
