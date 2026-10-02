# AI and manual reservations

Split-ticket fulfillment supports AI reservations and manual booking requests.
AI mode uses the OpenAI Responses API's native `computer` tool. OpenAI chooses the UI actions from screenshots; Playwright provides an
isolated Chromium context, mouse/keyboard input and screenshots. There are no
portal-specific reservation selectors or model-generated scripts.

## Select the fulfillment mode

Set this in `backend/.env` and restart the backend:

```dotenv
SPLIT_BOOKING_MODE=manual
SPLIT_BOOKING_ADMIN_EMAIL=me@kartikarora.in
SPLIT_BOOKING_ADMIN_WHATSAPP=+919999224767
```

Use `SPLIT_BOOKING_MODE=ai` for computer-use reservations. The default is `ai`;
unknown values are rejected at startup. The mode is saved on each booking when
the customer submits their details, so changing the flag affects only new
requests. Existing records retain AI fulfillment through the migration default.

### Manual fulfillment

After payment confirmation, the backend emails the full request to
`me@kartikarora.in` through Resend and sends the same details to `+919999224767`
through Wasender. The booking-specific recipient variables above override these
defaults. Set `RESEND_API_KEY` and `WASENDER_API_KEY` for delivery. Manual WhatsApp
always uses Wasender directly, regardless of the general `WHATSAPP_PROVIDER`.
Manual mode does not require an OpenAI key or a TripMgt session.

Both messages contain the reference, train, route, each leg's boarding date,
class, quota, fares and timings, every passenger and infant, ages, genders,
berth and senior-citizen preferences, auto-upgrade choice, customer contact
details, and payment/order references. Customer text is escaped in the email.

After handoff the booking stays `MANUAL_PENDING`, with no PNR or completion time
created automatically. The customer sees that manual reservation is pending.
Email and WhatsApp delivery receipts are persisted separately. A failed channel
does not prevent the other from sending; failure is recorded in `bookingError`.
Repeated payment callbacks retry only missing manual deliveries, never an AI
purchase or a channel already marked sent. These notifications use the existing
in-process dispatcher, so they are not a durable background retry queue.

Apply the schema migration with `npm run db:migrate` against the local development
database (or the deployment's normal migration procedure before updating production).

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

## Ticket pricing and service fee

When a confirmed leg offers multiple classes, the customer must select one in
that leg's class rows before opening the booking form. A leg with only one class
is selected automatically. Classes without a quoted fare cannot be selected.
The ticket total is the sum of the selected class fares, not the search result's
original cheapest-class total. The form shows each leg's chosen class, and those
exact classes and fares are sent to both AI and manual fulfillment. Selections
are scoped to the current search result; a new result requires fresh choices.

`totalFare` in the create request is the ticket price in whole rupees. The backend
adds a **₹50 service fee once per booking**, in either AI or manual mode. Do not
include that fee in the request's `totalFare` or individual leg fares.

For example, a ₹1,110 ticket request returns this payment breakdown:

```json
{ "totalFare": 1110, "serviceFee": 50, "amount": 1160 }
```

The checkout, payment receipt, owner notifications, Razorpay order, QR and UPI
intents use this breakdown. Payment callbacks must match `amount`, including the
fee. Existing bookings keep a stored fee of zero so their previous payment orders
remain valid. AI ticket budgets remain the individual leg fares, excluding our
service fee.

## AI request and fulfillment

The existing `POST /api/split-booking/create` and status endpoint remain in use.
The request accepts **two or more legs, with no fixed maximum leg count**.
Each leg requires an explicit `boardingDate` (`YYYY-MM-DD`),
in addition to `from`, `to`, `travelClass` and `fare`. These dates are passed from
the alternate-path search through the booking modal and stored in `legsPayload`.
Missing dates, disconnected legs and amounts exceeding the total are rejected
before payment. This avoids guessing boarding dates on overnight trips. Adjacent
legs must connect at the same station and their boarding dates cannot go backwards.
Search endpoints may use a known city sibling, such as NDLS for DEE; reservations
store and display the actual first and last stations from the selected legs.

1. A captured, amount-matched payment moves the stored request to `QUEUED`.
2. A conditional database update claims it as `IN_PROGRESS`; concurrent callbacks
   cannot start a second reservation run.
3. For each leg, the agent selects the exact train/date/class/quota, enters the
   passengers, reviews the form, and submits through the agent wallet. Its
   instructions limit the fare, including fees, to that leg's stored fare.
4. Each `computer_call` is executed in order and receives a viewport screenshot
   as `computer_call_output` with the original `call_id`. `previous_response_id`
   continues the conversation. The same browser stays open for all legs.
5. The agent reports the visible labelled PNR. The backend stores it immediately,
   then checks it using the existing PNR status provider against train, date,
   route, class and confirmed adult passenger count.
6. Only when all requested reservations are independently verified does the booking
   become `CONFIRMED`. Status responses include an ordered `pnrs` array for every
   leg. `pnrLeg1` and `pnrLeg2` remain aliases for the first two PNRs for older clients.

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

An issued PNR remains stored even if verification is delayed or a later leg
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
endpoint and **starts that request's saved fulfillment mode**: AI mode books
tickets, while manual mode sends owner notifications. It does not create a sample booking or fake passenger details. Use only
an intended booking or a test portal. Live portal/model acceptance still needs a
configured agent account, wallet and an authorized test reservation.

Reference: https://developers.openai.com/api/docs/guides/tools-computer-use
