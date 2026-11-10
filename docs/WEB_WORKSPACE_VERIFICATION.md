# Verification on 10 November 2026

| Check | Observed result |
| --- | --- |
| Backend syntax and coverage | 139 JS files; 97 documented operations passed |
| Original mobile contract | Existing route declarations and original 96-operation OpenAPI snapshot unchanged |
| Backend unit tests | 125 passed across 20 files |
| Payment policy and route tests | 23 passed with provider mocks |
| Frontend tests | 29 passed |
| MySQL integration | 67 core/tax plus 25 balance/availability assertions passed on MySQL 8.0.46 |
| Full Chromium browser journey | Passed against the actual Node backend and MySQL |
| Browser request trace | All 45 observed backend calls had matching trace entries |
| Browser JavaScript errors | None |
| Mobile layout | No horizontal document overflow at 390 px |
| Final schema verification | Passed after browser writes |

The disposable test database imported the supplied 165-table native client schema, initialized the reported three ID tables/51 columns/11 indexes, and applied the cumulative upgrade. No real client local or hosted database was accessed. The fixture scripts are destructive test preparation for a disposable schema only; the ordinary upgrade does not initialize test fixtures.

The real-browser flow created an agent-managed customer, selected a native class and an extra with quantity 2, saved details, quoted and checked out Pay Later. The server priced two chauffeur hours at 100 plus extra total 40, base-only VAT 40 and payable 280. The agent requested a notes change; Admin approved it and the extra remained present. Admin assigned a chauffeur and allocated a physical vehicle. The chauffeur acknowledged, progressed and submitted an expense; Admin reviewed it. Airport VIP and a generic catalog service were submitted through the native inquiry flow. The request inspector captured every backend request without exposing the test password.

The MySQL assertions additionally verify staff authorization, paginated review queues, directories without password fields, native extras/payment/task-window reads, own-leg vehicle availability, vehicle reallocation, and absence preservation for partial change fields. The previous native storage/booking/dispatch/coupon/payment regressions also pass.

Frontend tests cover the 97 endpoint definitions/mappings, request building, file transfers, redaction, request correlation, guided multi-leg/extra payloads, manual service routing, review decisions, public-host configuration guard and separation of portal Basic authentication from backend Bearer authentication.

Not executed: real Stripe card confirmation or signed provider delivery, Google Places/Routes network routing, SMTP/Expo/Telnyx delivery, private hosted storage, native PHP admin runtime, native accounting/Zoho/Odoo integration, load testing, and migration of populated historical duplicate app stores. The Stripe Payment Element code is included, but real test-card/webhook acceptance is still required with your provider configuration. A protected portal can be deployed after those environment-specific checks; these results do not certify every original admin feature or production dataset.
