# Google login, password recovery and profile APIs

All paths below use the `/api/v1` prefix. The OpenAPI contract at `/docs` is the
authoritative field-level reference.

## 1. Google login

The frontend completes Google authentication with the platform SDK and sends the
returned **Google ID token** to the backend. Do not send a Google access token.

```http
POST /api/v1/auth/google
Content-Type: application/json
```

```json
{
  "idToken": "GOOGLE_ID_TOKEN",
  "device": {
    "deviceId": "installation-uuid",
    "platform": "ANDROID",
    "pushToken": "ExponentPushToken[...]",
    "appVersion": "1.0.0"
  }
}
```

The API verifies the token signature, issuer, expiry and audience with Google's
official server library. `GOOGLE_CLIENT_IDS` may contain the Android, iOS and Web
OAuth client IDs separated by commas.

### Existing users

- Client, Agency Agent and Chauffeur accounts are matched by verified email on
  the first Google login.
- The permanent Google subject is then stored in `app_user_oauth_accounts`.
- Later logins use the subject link rather than trusting a mutable email match.
- Agent and Chauffeur accounts must already be invited and active. Google login
  never self-registers those roles or bypasses invitation activation.

### New Client users

Google does not normally provide a phone number. If the verified Google email has
no account, the first call returns:

```json
{
  "error": {
    "code": "GOOGLE_REGISTRATION_REQUIRED",
    "message": "A phone number is required to create a new client account",
    "details": { "requiredFields": ["phone"] }
  }
}
```

Show the existing phone/country/city form and call the same endpoint again:

```json
{
  "idToken": "GOOGLE_ID_TOKEN",
  "phone": "+41790000000",
  "language": "en",
  "countryId": 3,
  "city": "Geneva",
  "device": {
    "deviceId": "installation-uuid",
    "platform": "IOS"
  }
}
```

An existing login returns `200`; a newly created Client returns `201`. Both
responses contain the same `user`, `tokens` and `isNewAccount` fields. Store the
tokens through the same secure session mechanism used by password login.

## 2. SMTP password recovery

### Request the email

```http
POST /api/v1/auth/password/forgot
Content-Type: application/json
```

```json
{ "email": "client@example.com" }
```

The endpoint always returns a generic response when the account is absent. For an
active account it invalidates older unused reset tokens, creates a hashed token
with a 30-minute expiry, and sends the reset link through configured SMTP.

In non-production environments with `EMAIL_PROVIDER=disabled`, the raw token is
returned only in the `X-Debug-Reset-Token` response header. Production refuses to
start unless SMTP is enabled.

### Complete the reset

The backend serves a minimal browser UI at:

```text
https://drive-luxury.onrender.com/reset-password?token=...
```

The page reads the token once, removes it from the address bar, validates the
two password fields and submits:

```http
POST /api/v1/auth/password/reset
Content-Type: application/json
```

```json
{
  "token": "RAW_TOKEN_FROM_EMAIL",
  "password": "new-secure-password"
}
```

The reset is transactionally single-use. After success, every active refresh
token for the user is revoked, so all devices must authenticate again.

## 3. Client profile

```http
GET /api/v1/client/profile
PATCH /api/v1/client/profile
Authorization: Bearer <accessToken>
```

Editable fields:

```json
{
  "title": "Mr",
  "fullName": "Client Name",
  "lastName": "Surname",
  "phone": "+41790000000",
  "dateOfBirth": "1990-05-20",
  "countryId": 3,
  "city": "Geneva",
  "state": "Geneva",
  "zipCode": "1201",
  "addressOne": "Primary address",
  "addressTwo": null,
  "language": "en"
}
```

Only supplied fields are changed. Explicit `null` clears supported optional
fields. Email remains read-only because an email-change verification workflow is
not part of this release.

## 4. Agency Agent profile

```http
GET /api/v1/agent/profile
PATCH /api/v1/agent/profile
Authorization: Bearer <accessToken>
```

Editable fields are `fullName`, `phone`, `address` and `language`. The response
also returns the read-only email, agency ID, agent type and current photo.

```json
{
  "fullName": "Agent Name",
  "phone": "+41790000001",
  "address": "Agency office address",
  "language": "en"
}
```

## 5. Chauffeur profile

```http
GET /api/v1/chauffeur/profile
PATCH /api/v1/chauffeur/profile
Authorization: Bearer <accessToken>
```

Editable fields are `title`, `fullName`, `lastName`, `phone`, `countryId`,
`cityId`, `state`, `street`, `city`, `zip`, `address` and `language`.

```json
{
  "fullName": "Chauffeur Name",
  "phone": "+41790000002",
  "countryId": 3,
  "cityId": 18,
  "city": "Geneva",
  "address": "Home address",
  "language": "fr"
}
```

Driving licence, passport and professional-licence fields are intentionally not
editable through this general profile endpoint. They remain controlled through
private document and Operations workflows.

## 6. Environment configuration

```dotenv
GOOGLE_CLIENT_IDS=android-client-id.apps.googleusercontent.com,ios-client-id.apps.googleusercontent.com,web-client-id.apps.googleusercontent.com

EMAIL_PROVIDER=smtp
MAIL_HOST=mail.infomaniak.com
MAIL_PORT=587
MAIL_ENCRYPTION=tls
MAIL_USERNAME=provided-securely
MAIL_PASSWORD=provided-securely
MAIL_FROM_ADDRESS=noreply@drive-luxury.com
MAIL_FROM_NAME=Drive Luxury
MAIL_REPLY_TO=support@drive-luxury.com
PASSWORD_RESET_URL=https://drive-luxury.onrender.com/reset-password
```

Never commit real OAuth, SMTP, database or payment credentials. Configure them in
the deployment environment's secret settings and rotate any credentials that
were previously shared through ordinary messages.
