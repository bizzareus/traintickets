---
title: "IRCTC OTP Not Received? 6 Fixes for Login & Tatkal"
description: "Fix IRCTC OTP not received on mobile for login, Tatkal Aadhaar verification, and password reset. Fast troubleshooting for Jio, Airtel, and Vi users."
date: "2026-08-31"
updated: "2026-08-31"
tags:
  - irctc otp
  - tatkal booking
  - irctc login
  - train booking tips
  - aadhaar verification
---

> **🔔 Never Miss Final Charting:** Waiting for waitlisted seats to confirm? Track your train's exact station charting schedule and set up a free preparation alert on [Chart Times](/chart-times), or check live vacant berths on [Chart Vacancy](/chart-vacancy). Looking for confirmed split seats? Use [Smart Seats](/).

## TL;DR

IRCTC OTP delivery fails primarily due to peak-hour SMS gateway congestion (10:00 AM and 11:00 AM Tatkal rush), telecom DND spam filters, incorrect UIDAI mobile links, or the daily 11:45 PM to 12:20 AM maintenance blackout. You can bypass login OTP delays by switching to the IRCTC Rail Connect app using a 4-digit PIN or biometrics, whitelisting transactional SMS headers (\`VK-IRCTC\`, \`AD-IRCTC\`), and paying via UPI or IRCTC e-Wallet.

---

> [!TIP]
> **Track Available Berths Instantly:** If an OTP timeout cost you a Tatkal seat, find confirmed multi-leg route alternatives on **[Smart Seats](/)** or check coach vacancy status on **[Seat Status](/seat-status)**.

Few experiences in online train booking are as frustrating as staring at a ticking countdown timer while waiting for a 6-digit one-time password that never arrives. During peak booking hours, a 30-second SMS delay can mean the difference between securing a confirmed lower berth and landing at the bottom of a 60-passenger waitlist.

Whether you are logging in from a desktop browser, verifying your Aadhaar credentials for Tatkal quotas, resetting a forgotten password, or authorizing a bank transaction, OTP failures follow specific technical bottlenecks. 

Understanding why these delivery breakdowns happen and applying the right diagnostic fixes can help you secure your tickets without losing critical seconds.

---

## Why Is IRCTC OTP Not Received on Mobile During Login and Booking?

**IRCTC OTP delivery fails primarily due to SMS gateway congestion during Tatkal rush hours, strict telecom DND spam filters blocking official shortcodes, mobile network handshakes, or account discrepancies. During the 10:00 AM AC and 11:00 AM non-AC booking windows, millions of simultaneous requests delay delivery beyond the 60-second validity window.**

When your one-time password fails to arrive, check these core culprits before requesting multiple retries:

| Failure Cause | Primary Symptom | Immediate Fix | Resolution Time |
| :--- | :--- | :--- | :--- |
| **Tatkal Peak Traffic** | Timer expires at 10:00 AM or 11:00 AM | Use IRCTC Rail Connect 4-digit PIN/Biometric login | Instant |
| **TRAI DND Blocking** | Promo/Service filters block shortcodes | Set DND preferences to allow Transactional Service SMS | 5–15 minutes |
| **UIDAI Gateway Lag** | Aadhaar verification OTP hangs | Verify mobile number link on myAadhaar portal | 2–5 minutes |
| **Nightly Maintenance** | "Service Unavailable" or blank error | Wait until 12:20 AM IST maintenance completion | 35 minutes |
| **SIM Network Cache** | General SMS reception frozen | Toggle Airplane mode on for 10 seconds and turn off | 10 seconds |
| **Third-Party SMS App** | Truecaller / Spam filter auto-archives OTP | Check "Spam & Blocked" folder in SMS app | Instant |

---

## How to Fix Aadhaar OTP Not Received During Tatkal Booking?

**To fix Aadhaar OTP failures during Tatkal booking, verify your registered mobile number on the myAadhaar portal, pre-verify your passenger Master List in your IRCTC profile 24 hours in advance, and avoid repeatedly hitting Resend OTP. Repeated resend clicks invalidate previously dispatched SMS tokens and lock your booking attempt.**

To resolve Aadhaar OTP bottlenecks during high-stakes booking:

1. **Verify Your UIDAI Registered Number:** Log into \`myaadhaar.uidai.gov.in\` and use the "Verify Mobile Number" tool. If your current SIM does not match your Aadhaar record, update your biometrics and mobile number at an Aadhaar Seva Kendra.
2. **Complete Master List Aadhaar Verification in Advance:** Never verify passenger Aadhaar during the Tatkal window. Open your IRCTC profile 24 hours prior, navigate to **My Profile → Add/Modify Master List**, and verify all passenger Aadhaar details so the "Verified" green badge is active.
3. **Avoid the Resend OTP Trap:** Clicking "Resend OTP" immediately invalidates the previous token. If an SMS is delayed in transit, clicking resend generates a new sequence, causing an "Invalid OTP" error when the earlier code finally lands. Wait at least 90 seconds before hitting resend.

---

## How to Bypass IRCTC Login OTP Delays Using App Biometrics and PIN?

**You can bypass SMS login OTP delays by enabling 4-digit PIN authentication and biometric fingerprint or Face ID login on the official IRCTC Rail Connect mobile app. The mobile app authenticates your session locally against encrypted on-device tokens, granting instant dashboard access in under two seconds without relying on third-party SMS delivery networks.**

Setting up biometric login takes less than two minutes:

* **Step 1:** Download and open the official **IRCTC Rail Connect** app on Android or iOS.
* **Step 2:** Log in with your username and password, and complete the one-time device verification.
* **Step 3:** When prompted, create a personal 4-digit security PIN.
* **Step 4:** Enable the toggle for **Biometric Authentication** (Fingerprint / Face ID).
* **Step 5:** On subsequent logins, simply tap your sensor or glance at your camera. You will be placed directly onto the search dashboard in under two seconds.

```
Desktop Web Portal (SMS Dependent)    vs.    Rail Connect App (Encrypted Local Auth)
[Username/Password]                          [Biometric Sensor / 4-Digit PIN]
       │                                                    │
[SMS Gateway Request]                                [Local Token Match]
       │                                                    │
[Telecom Congestion Delay]                                  ▼
       │                                         [Instant Dashboard Access]
       ▼                                                (< 2 seconds)
[60s Timer Expiry / Session Lost]
```

---

## How to Fix IRCTC Registration and Password Reset OTP Not Coming?

**To resolve IRCTC registration and password reset OTP issues, check your email Promotions and Spam folders for messages from ticketadmin@irctc.co.in, clear message app storage to prevent buffer overflow, enter domestic numbers as clean 10 digits without leading 0 or +91, and wait at least 90 seconds before requesting a replacement code.**

Follow this systematic checklist to restore access:

1. **Check Email Junk and Spam Folders:** IRCTC transactional emails originating from \`ticketadmin@irctc.co.in\` or \`care@irctc.co.in\` are frequently filtered by Gmail or Outlook into Promotions or Spam folders.
2. **Clear Message App Storage and Cache:** If your device SMS storage exceeds capacity limits, incoming carrier shortcodes are silently dropped. Clear old promotional threads and restart your phone.
3. **Verify Country Code Formatting:** For domestic Indian numbers, ensure your number is entered as 10 digits without leading \`0\` or \`+91\`. For NRI and international accounts, confirm you have selected the designated International Registration pathway with the ₹100 + GST registration fee.

---

## How to Unblock IRCTC Transactional SMS on Jio, Airtel, and Vi?

**To unblock IRCTC SMS delivery, configure your telecom carrier Do Not Disturb (DND) settings to allow Service Explicit and Transactional messages from official entity headers like VK-IRCTC, AD-IRCTC, and VM-CRIS. You can manage DND permissions via the MyJio or Airtel Thanks apps, or by sending SMS START 0 to 1909.**

Here is how to ensure carrier filters never intercept your booking alerts:

* **Reliance Jio:** Open the **MyJio** app → Profile & Settings → Do Not Disturb → Select **Transactional Only** or disable promotional blocks for Banking/Financial/Communication alerts.
* **Bharti Airtel:** Open the **Airtel Thanks** app → Services → Manage DND → Ensure "Service / Transactional SMS" is set to allowed.
* **Vodafone Idea (Vi):** Visit the Vi portal DND management page or send an SMS \`START 0\` to \`1909\` to enable full transactional clearance.
* **Spam Blocker Whitelist:** If you use Truecaller or Google Messages, open Settings → Spam Protection, and ensure IRCTC shortcodes are added to your explicit whitelist.

---

## What Should You Do if Payment OTP Fails but Money Is Deducted?

**If your bank payment OTP is authorized and money is debited but IRCTC fails to generate a PNR, your booking is recorded as a failed transaction. Indian Railways automatically reconciles unmapped bank debits, issuing a 100% full refund with zero clerkage back to your original source account within 3 to 7 business days.**

Here is how refund turnaround works across different payment modes:

| Payment Mode Used | Typical Refund Timeline | Clerkage / Cancellation Fee | Action Required |
| :--- | :--- | :--- | :--- |
| **IRCTC e-Wallet** | Instant to 24 Hours | ₹0 (100% Refund) | None (Auto-credited to wallet balance) |
| **UPI (GPay / PhonePe / Paytm)** | 1 to 2 Working Days | ₹0 (100% Refund) | Check bank account statement |
| **Net Banking** | 3 to 5 Working Days | ₹0 (100% Refund) | Check originating bank account |
| **Credit / Debit Cards** | 3 to 7 Working Days | ₹0 (100% Refund) | Check card statement |

> [!IMPORTANT]
> When booking under tight time constraints, using the **IRCTC e-Wallet** or **UPI AutoPay** significantly reduces gateway latency compared to 3D-Secure credit card SMS OTP flows.

---

## Common Booking Questions (FAQ)

### Why am I not getting IRCTC OTP on my registered mobile number?
IRCTC OTP delivery failure is caused by telecom SMS gateway congestion during peak hours, carrier DND spam filters blocking shortcodes, exhausted device SMS storage, or attempting transactions during the daily 11:45 PM to 12:20 AM maintenance window.

### How long is an IRCTC OTP valid for login and Tatkal booking?
An IRCTC login and transaction OTP is valid for **60 seconds to 3 minutes** depending on the specific authentication flow. During peak Tatkal windows, entering the code within 60 seconds is essential before the session times out.

### Can I book Tatkal tickets without Aadhaar OTP verification?
No, mandatory Aadhaar OTP authentication applies to individual users booking online Tatkal tickets on both the IRCTC website and Rail Connect app. Users must link and pre-verify their Aadhaar profile before attempting Tatkal bookings.

### Why is IRCTC OTP not coming on Airtel, Jio, or BSNL SIM cards?
Carrier-side DND filters often mistakenly route transactional shortcodes like \`VK-IRCTC\` into promotional spam queues. Toggling Airplane mode or verifying that transactional SMS is permitted under your carrier's 1909 DND preferences resolves this.

### How do I receive IRCTC OTP on an international mobile number?
NRI and international travellers must register under the specialized IRCTC International User profile by paying the ₹100 + GST registration fee. OTPs for international profiles are dispatched via dedicated international SMS gateways and registered email addresses.

### What is the IRCTC daily OTP request limit for a single account?
IRCTC restricts users from generating more than **3 to 5 consecutive OTP requests** per session to prevent automated brute-force attempts. If you exceed this threshold, the account authentication is temporarily locked for 15 to 30 minutes.

### How do I change my registered mobile number if I cannot get OTP?
If you have lost access to your registered number, log into the IRCTC desktop portal using your username and password, navigate to **My Profile → Update Profile**, and verify your identity via email OTP to update your phone number.

### Why does IRCTC OTP fail between 11:45 PM and 12:20 AM?
IRCTC servers enter a mandatory daily maintenance blackout from **11:45 PM to 12:20 AM IST (23:45 to 00:20)**. During these 35 minutes, all database querying, ticket bookings, cancellations, and OTP generation services are completely offline.

---

## Bottom line

OTP delays do not have to ruin your travel plans. For everyday journeys and last-minute Tatkal bookings, transition your primary booking workflow to the IRCTC Rail Connect app with biometric PIN access, pre-verify your passenger Master List with Aadhaar, and use instant payment methods like UPI or IRCTC e-Wallet. 

If a missed OTP leaves you stranded with a waitlisted ticket, track live confirmation chances on [Smart Seats](/) or locate available vacant coach segments on [Seat Status](/seat-status).
