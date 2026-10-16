# Drive Luxury API Console

Vite React webpages for testing the complete Release 1 backend from three
workspaces:

- Client & Agency Agent
- Chauffeur
- Operations

The API Explorer is generated from `../docs/openapi.json`, so it exposes all 81
documented operations. Guided flows select the APIs in the expected frontend
order.

## Start locally

Terminal 1 — backend:

```bash
cd drive-luxury-backend-r1
cp .env.example .env
npm install
npm run dev
```

Terminal 2 — React console:

```bash
cd drive-luxury-backend-r1/api-console
npm install
npm run dev
```

Open `http://localhost:5173`. The backend URL field at the top defaults to
`http://localhost:3000`, and API requests are sent directly to
`http://localhost:3000/api/v1` without relying on the Vite proxy.

You can enter either a server/domain such as `https://staging.example.com` or a
full API prefix such as `https://staging.example.com/api/v1`. The console adds
`/api/v1` automatically when it is not present and remembers the selected URL
in the browser. The target backend must allow the console origin through
`CORS_ORIGINS`.

## Capabilities

- Login and safe local token storage for testing
- Automatic refresh-token rotation and one retry after an expired-token `401`
- Role-based guided flows
- All-81 API explorer with method/module/search filters
- Generated path, query and header fields from OpenAPI
- Generated JSON request examples from OpenAPI schemas
- Multipart document uploads
- Status, duration, headers and formatted response inspection
- Binary download support
- Clear warnings for Stripe-server-only and development-only endpoints

Do not use historical database password hashes as passwords. Create/invite test
accounts and set known test passwords through the supported activation/reset
flows.
