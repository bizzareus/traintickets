# OpenAI computer-use reservations

Split-ticket fulfillment now uses the OpenAI Responses API's native `computer`
tool. OpenAI chooses the UI actions from screenshots; Playwright provides an
isolated Chromium context, mouse/keyboard input and screenshots. There are no
portal-specific reservation selectors or model-generated scripts.

## Configuration

Set these in `backend/.env` (see `backend/.env.example`):

- `OPENAI_API_KEY`: a server-side key with access to a computer-capable model.
- `OPENAI_BOOKING_MODEL`: defaults to `gpt-6.1-sol`, as in the current OpenAI
  native-computer-tool guide. It is independent of the seat-planning model.
- `TRIPMGT_BOOKING_URL`: the current train portal URL for your agent account.
- `TRIPMGT_COOKIES` or `TRIPMGT_USERNAME` and `TRIPMGT_PASSWORD`: agent session/login.
- `TRIPMGT_ALLOWED_ORIGINS`: comma-separated **exact origins** for the portal and
  PSP pages it uses. Default: TripMgt, www.TripMgt and www.irctc.co.in over HTTPS.
  Other navigation, fetch/XHR, redirects and resources are blocked. Add an origin
  only after checking that it belongs to the intended booking flow.
  The adapter currently uses one tab; flows that require a popup stop for review.
- `OPENAI_BOOKING_MAX_TURNS`: responses per leg, default 80, maximum 200.
- `OPENAI_BOOKING_TIMEOUT_MS`: entire booking deadline, default 600000 (10 minutes).
- `PLAYWRIGHT_HEADLESS`: default true. Set false to observe local runs.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`: optional system Chromium path. The AWS
  backend Dockerfile already provides Chromium and sets this variable.

For local development, install Chromium with `npx playwright install chromium`
from `backend/` if a system browser is not configured. Use the project's local
database and URL overrides when starting the backend.

## Request and fulfillment

The existing `POST /api/split-booking/create` and status endpoint remain in use.
Each of the two `legs` now requires an explicit `boardingDate` (`YYYY-MM-DD`),
in addition to `from`, `to`, `travelClass` and `fare`. These dates are passed from
the alternate-path search through the booking modal and stored in `legsPayload`.
Missing dates, disconnected legs and amounts exceeding the total are rejected
before payment. This avoids guessing the second boarding date on overnight trips.

1. A captured, amount-matched payment moves the stored request to `QUEUED`.
2. A conditional database update claims it as `IN_PROGRESS`; concurrent callbacks
   cannot start a second reservation run.
3. For each leg, the agent selects the exact train/date/class/quota, enters the
   passengers, reviews the form, and submits through the agent wallet. Its
   instructions limit the fare, including fees, to that leg's stored fare.
4. Each `computer_call` is executed in order and receives a viewport screenshot
   as `computer_call_output` with the original `call_id`. `previous_response_id`
   continues the conversation. The same browser stays open for both legs.
5. The agent reports the visible labelled PNR. The backend stores it immediately,
   then checks it using the existing PNR status provider against train, date,
   route, class and confirmed adult passenger count.
6. Only two independently verified reservations produce `CONFIRMED`.

Credentials are substituted locally into focused login inputs, never included in
the model prompt. Booking/passenger data and viewport screenshots are sent to
OpenAI. Screenshots stay out of public status logs and are saved under
`backend/storage/bookings/<bookingRef>/` when the backend runs from its directory,
with restrictive file permissions. This directory is git-ignored; apply the
deployment's private-storage retention policy to these passenger-data artifacts.

## Stopped and partially completed bookings

CAPTCHA, OTP, interactive payment, fare changes, API safety checks, incomplete
responses, deadlines and missing confirmations stop the run. Safety checks are
never auto-acknowledged. A stopped run currently uses the existing `FAILED`
status and `bookingError`; there is no interactive resume endpoint.

An issued PNR remains stored even if verification is delayed or the second leg
fails. Inspect those PNRs and the portal before taking further action. The runner
does not automatically replay submissions or refund/cancel a partially booked
journey. A process crash leaves `IN_PROGRESS` for reconciliation rather than
silently replaying a possibly successful purchase. Execution remains the existing
in-process background workflow, not a durable queue.

## Verification

From `backend/`:

```sh
npm test -- --runInBand --testPathPatterns='computer-use|split-booking'
npx tsc -p tsconfig.build.json --noEmit
```

The browser integration test uses local HTTP fixtures and real Chromium. The
model-loop and booking tests use mocked OpenAI/PNR responses; they exercise
action ordering, screenshots, safety stops, cancellation, confirmation checks,
partial PNR persistence and concurrent payment callbacks without buying tickets.

To inspect an existing request against a running local backend:

```sh
API_URL=http://localhost:3009 npx tsx scripts/tripmgt-booking-cli.ts BOOKING_REF
```

Adding `--simulate-payment` invokes the development-only payment simulation
endpoint and **starts the actual configured AI booking flow** for that stored
request. It does not create a sample booking or fake passenger details. Use only
an intended booking or a test portal. Live portal/model acceptance still needs a
configured agent account, wallet and an authorized test reservation.

Reference: https://developers.openai.com/api/docs/guides/tools-computer-use
