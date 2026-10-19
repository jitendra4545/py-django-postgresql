# DigitalOcean production deployment

This release uses DigitalOcean App Platform, a DigitalOcean Managed MySQL database, and DigitalOcean Spaces. It contains no AWS environment-variable contract and does not require an AWS account. The `@aws-sdk/client-s3` dependency is retained only because Spaces implements the S3 API.

## Before deploying

1. Revoke and replace every credential previously sent through chat or ordinary messages.
2. Create a least-privilege Spaces access key for this application. Do not commit it.
3. Keep the `private/` prefix private. Only the `images/` prefix is intended for public/CDN media.
4. Export the Managed MySQL CA certificate as one base64 line and set `DB_SSL_CA_BASE64` as an encrypted runtime variable.
5. Copy `.do/app.yaml.example` to `.do/app.yaml`, replace every `CHANGE_ME`, repository, domain, and origin value, and keep all credentials as encrypted App Platform variables.
6. Configure Google Places API (New) for autocomplete and Routes API for trusted road distance. Restrict the server key to the APIs used by this service; set `GOOGLE_ROUTES_ENABLED=true` only when Routes is actually enabled and authorized.

If any existing `app_documents.storage_disk='s3'` rows point to another object store, copy those objects into the configured Space with the same keys before migration `003`. The migration removes the old provider label; it does not copy remote object bytes.

## Release sequence

Run schema validation and migrations from a one-off trusted environment using the same encrypted database settings:

```bash
npm ci
npm run verify:schema
npm run migrate
npm run build
```

Then deploy the App Platform service. Its `/health` endpoint is used for rollout health checks. The process listens on `0.0.0.0:$PORT` and trusts exactly one platform proxy hop.

## Storage policy

- `DO_SPACES_PUBLIC_ROOT=images`: brand, catalog, and other deliberately public media. CDN URLs are allowed only here.
- `DO_SPACES_PRIVATE_ROOT=private`: chat attachments, invoices, receipts, identity documents, incident evidence, and expenses. Access is issued through short-lived signed URLs after an authorization check.
- `MEDIA_CDN_ENABLED=true` controls public URL generation; it never changes a private document ACL.

## Features that remain disabled until configured

- Keep `MASKED_CALL_PROVIDER=disabled` until a reviewed telecom provider adapter is installed.
- The supplied SQL excerpt contains `reservation_invoices` and `reservation_invoice_details`; the example enables the read-only adapter. Verify their live schema before deployment or set `INVOICE_ADAPTER=disabled`.
- Production startup intentionally rejects mock payment and masked-call providers.
- The supplied dump cuts off before some fleet/rate table definitions; `npm run verify:schema` must pass against a staged copy of the actual shared database. A passing source-only test suite is not a substitute for that check.
