---
title: "IRCTC Maintenance Time Tonight (11:45 PM–12:20 AM Rules 2026)"
description: "IRCTC night maintenance runs daily from 11:45 PM to 12:20 AM IST. Check complete server downtime hours, Tatkal opening slots, and failed booking refund rules."
date: "2026-06-18"
updated: "2026-09-09"
tags:
  - train booking
  - irctc
  - irctc timings
  - irctc maintenance time
  - irctc server down time
  - railway booking timings
---

> **🔔 Never Miss Final Charting:** Waiting for waitlisted seats to confirm? Track your train's exact station charting schedule and set up a free preparation alert on [Chart Times](/chart-times), or check live vacant berths on [Chart Vacancy](/chart-vacancy). If you need an alternative confirmed route across sold-out stretches, search [Smart Seats](/), or verify rake layouts with [Coach Journey Lookup](/seat-status).

## TL;DR

- **Daily Night Maintenance:** IRCTC servers shut down daily from **11:45 PM to 12:20 AM IST (23:45 to 00:20)** for a mandatory 35-minute batch database backup and banking payment reconciliation.
- **Service Suspension:** All online ticket booking, cancellations, PNR status lookups, and e-wallet transactions are completely paused during this 35-minute window across both the website and mobile app.
- **Morning Reservation Slots:** General 60-day Advance Reservation Period (ARP) opens daily at **8:00 AM IST** (Aadhaar authentication mandatory on opening day); AC Tatkal opens at **10:00 AM IST**; Non-AC Tatkal opens at **11:00 AM IST**.
- **Failed Midnight Transactions:** If money is deducted during the maintenance cutoff without generating a PNR, IRCTC automatically refunds 100% of the debited amount to your original payment mode within 3 to 5 business days.

---

## What Is the IRCTC Night Maintenance Time & Server Downtime Window?

**The daily IRCTC night maintenance time runs from 11:45 PM to 12:20 AM IST (23:45 to 00:20). During this mandatory 35-minute server downtime window, all online ticket bookings, cancellations, PNR status queries, and e-wallet transactions are completely suspended across the IRCTC website and Next-Gen mobile application.**

This 35-minute midnight pause is an architectural requirement for Indian Railways IT infrastructure managed by the Centre for Railway Information Systems (CRIS). Handling millions of passenger queries, seat searches, and financial transactions each day, the central database must pause active connections to execute critical data syncs and maintain transactional integrity.

During the night maintenance window:
- **No Logins or Availability Checks:** Users cannot log into IRCTC accounts, verify seat availability, or view current coach charts.
- **Booking & Cancellation Disabled:** Neither reserved e-tickets nor cancellations can be processed online.
- **Cached Schedules Only:** Static train time tables and station lists remain readable, but any dynamic query requiring real-time PRS server connectivity will fail.

If you attempt to finalize a booking at 11:44 PM and your payment gateway transaction settles at 11:45 PM, the system rejects the booking. Your money is safe: IRCTC flags the transaction as an unassigned debit and automatically initiates a full refund.

---

## Master IRCTC Daily Operating Schedule (2026)

To avoid getting caught by daily server maintenance cutoffs, bookmark this official 24-hour operational timetable:

| Service / Booking Window | Daily Operating Hours (IST) | Advance Window | Key Rules & System Restrictions |
| :--- | :--- | :--- | :--- |
| **Night Server Maintenance** | 11:45 PM – 12:20 AM | Daily (35 mins) | All booking, cancellations, PNR lookups & logins disabled |
| **General Booking Window** | 12:20 AM – 11:45 PM | Daily (23h 25m) | Normal reservations across all active quotas & trains |
| **Opening Day ARP Booking** | 8:00 AM IST | 60 Days prior | **Aadhaar-authenticated profiles only** on opening day |
| **Subsequent ARP Days** | 12:20 AM – 11:45 PM | Days 59 to 1 | Open to both verified and unverified user accounts |
| **AC Tatkal Booking** | 10:00 AM IST | 1 Day prior | 2A, 3A, 3E, CC, EC (No 1A; agents blocked 10:00–10:30 AM) |
| **Non-AC Tatkal Booking** | 11:00 AM IST | 1 Day prior | Sleeper (SL) & 2S (Agents blocked 11:00–11:30 AM) |
| **Premium Tatkal (PT)** | 10:00 AM / 11:00 AM | 1 Day prior | Dynamic pricing; opens concurrently with regular Tatkal |
| **First Chart Preparation** | ~8 Hours prior (or 9 PM) | Departure day | Primary waitlists finalized; Current Availability opens |
| **Current Availability Booking** | Post 1st Chart to -30 mins | Departure day | Vacant berths sold at up to 10% base fare discount |
| **Second / Final Chart** | 30–45 mins prior | Departure day | Online bookings close; TTE Handheld Terminal (HHT) sync |
| **Boarding Station Change** | Up to 2nd Charting | Departure day | Permitted online until second chart preparation (~30m) |

---

## Why Does IRCTC Shut Down Servers Every Night at 11:45 PM?

**IRCTC shuts down its ticketing servers every night at 11:45 PM to allow the Centre for Railway Information Systems (CRIS) to flush database transaction logs, synchronize Passenger Reservation System (PRS) records across all 17 railway zones, reconcile interbank payment gateway settlements, and execute anti-bot security sweeps.**

Without this synchronized 35-minute downtime:
1. **Database Lock Contention:** Over 150,000 concurrent write operations could lock database rows, leading to payment discrepancies and duplicate berth allocations.
2. **Interbank Settlement Batch Jobs:** Banks (SBI, HDFC, ICICI, and RBI payment switches) run end-of-day reconciliation batches between 23:45 and 00:15. Disconnecting transaction pipelines prevents orphaned charges.
3. **Waitlist Queue Cleansing:** The system recalibrates cancelled quotas and prepares inventory for the next morning's 8:00 AM ARP opening.
4. **Anti-Scraping Security Scans:** Automated security firewalls purge suspicious IP addresses, rate-limit unauthorized scraping bots, and clear cached sessions to prepare for morning Tatkal traffic.

---

## What Happens If Money Is Deducted During IRCTC Maintenance?

**If your bank account or credit card is debited for an IRCTC ticket right around 11:45 PM but no PNR is generated due to server maintenance, your money is completely safe. IRCTC reconciliation systems mark the transaction as a "Payment Received Without PNR Generation" and automatically credit 100% of the funds back to your original payment source within 3 to 5 working days.**

When this occurs:
- **No Cancellation Fee Deducted:** Because no ticket or PNR was ever created, Indian Railways does not deduct clerkage charges, GST, or convenience fees.
- **Tracking the Refund:** Check your IRCTC account dashboard under *My Transactions ➔ Ticket Refund History* once the servers come back online at 12:20 AM. The transaction will appear with an official Refund Reference Number.
- **Escalation Protocol:** If the money is not returned to your bank account after 7 business days, lodge a quick digital complaint on the [RailMadad portal](https://railmadad.indianrailways.gov.in) or call the unified railway helpline at **139** with your bank Transaction ID (TXN ID).

For a detailed breakdown of failed booking scenarios, read our guide on [IRCTC Booking Failed Money Deducted Refund Rules](/blog/irctc-booking-failed-money-deducted-refund-rules).

---

## What Error Messages Appear During IRCTC Server Downtime?

**During the nightly 11:45 PM to 12:20 AM downtime window, IRCTC displays standard system notices including "IRCTC site is under maintenance", "User not allowed to login during maintenance window", or an HTTP 503 "Service Temporarily Unavailable" error message.**

Common error alerts encountered at midnight include:
- *"Site is under maintenance from 23:45 to 00:20 hrs. Please try after 00:20 hrs."*
- *"User is not allowed to login during maintenance hours."*
- *"503 Service Unavailable / Request Timed Out."*

If you encounter these messages precisely between 23:45 and 00:20 IST, do not panic, reset your router, or repeatedly change your account password. The server shutdown is planned and routine. Simply wait until 12:20 AM IST, refresh your browser cache, and log in again.

If the website remains inaccessible well past 12:30 AM IST, it indicates an unscheduled emergency technical outage. In such rare instances, monitor official announcements on the IRCTC official Twitter/X handle (`@IRCTCofficial`).

---

## Does the UTS App or Station PRS Counter Work During IRCTC Maintenance?

**Yes, the UTS mobile app for unreserved general tickets continues to function during IRCTC night maintenance because it operates on a separate CRIS server cluster. However, physical railway station PRS reservation counters are closed overnight, and 24-hour station Current Counters pause operations during the 23:45 to 00:20 maintenance window.**

Key operational nuances across ticketing channels:
- **UTS Unreserved App:** You can book general unreserved second-class coach tickets and suburban platform tickets between 11:45 PM and 12:20 AM. However, avoid recharging your UTS R-Wallet through net banking or UPI during this window, as banking gateway batch runs may cause top-up delays.
- **Station PRS Counters:** Regular station advance reservation windows operate between 8:00 AM and 8:00 PM. They are already closed during midnight hours.
- **Station Current Booking Counters:** 24x7 current ticket counters at major junction stations temporarily halt issuing reserved tickets between 11:45 PM and 12:20 AM because their terminals connect to the same central PRS database.
- **Enquiry & 139 IVR:** Dialing **139** for train schedule and running status remains functional, though real-time PNR allotment updates are paused until 00:20 AM.

---

## What Are the Daily Ticket Booking Hours on IRCTC?

**IRCTC daily ticket booking hours operate from 12:20 AM to 11:45 PM IST. The system supports 60-day Advance Reservation Period (ARP) bookings starting daily at 8:00 AM IST. Powered by Next-Gen PRS infrastructure, the portal handles over 150,000 booking transactions per minute during peak volume periods.**

Outside of the 35-minute nightly maintenance break, the IRCTC ticketing platform is operational 23 hours and 25 minutes every day. Passengers can book tickets across all standard quotas, including General, Senior Citizen, Ladies, and Divyangjan.

Key booking timing rules include:
- **General Advance Reservation:** Opens daily at **8:00 AM IST** exactly 60 days before the date of journey from originating station.
- **Mandatory Aadhaar Rule on Opening Day:** Under official 2026 ticketing guidelines, only Aadhaar-authenticated user accounts are permitted to book general reserved tickets on the opening day of the 60-day ARP. Unverified profiles can book from Day 2 onwards.
- **Monthly Booking Limits:** Unverified accounts can book up to 12 tickets per calendar month, while Aadhaar-verified profiles can book up to 24 tickets per month. Read our full guide on [IRCTC Ticket Booking Limits](/blog/irctc-ticket-booking-limits-aadhaar-verification).
- **Waitlist Confirmation Queues:** Standby tickets progress sequentially through:

$$\text{WL (Waiting List)} \rightarrow \text{RAC (Reservation Against Cancellation)} \rightarrow \text{Confirmed}$$

If an e-ticket remains fully waitlisted (**WL full form is Waiting List**) after chart preparation, the IRCTC system automatically cancels the ticket and refunds the base fare to the passenger's bank account.

---

## What Time Does Tatkal Booking Open on IRCTC?

**Tatkal ticket booking opens daily at 10:00 AM IST for AC classes (2A, 3A, 3E, CC, EC; 1A excluded) and 11:00 AM IST for Non-AC classes (Sleeper, 2S) one day prior to train departure from origin. Mandatory Aadhaar OTP authentication applies to verified IRCTC user accounts booking Tatkal seats.**

Tatkal reservation provides last-minute travel access for passengers who need urgent travel bookings. Because seats sell out within seconds, knowing the exact opening schedule and preparation steps is crucial:

| Quota / Class | Booking Opening Time (IST) | Advance Days | Refund Policy |
| :--- | :--- | :--- | :--- |
| **AC Tatkal (2A, 3A, 3E, CC, EC)** | 10:00 AM IST | 1 Day Prior | No refund on confirmed tickets |
| **Non-AC Tatkal (SL, 2S)** | 11:00 AM IST | 1 Day Prior | No refund on confirmed tickets |
| **Premium Tatkal (AC & Non-AC)** | Same as Tatkal (10 AM / 11 AM) | 1 Day Prior | Dynamic pricing; no refund |

To prevent automated bot abuse and ticket hoarding:
1. **Agent Restrictions:** Authorized travel agents are strictly barred from booking Tatkal tickets during the first 30 minutes of opening (10:00 AM to 10:30 AM for AC; 11:00 AM to 11:30 AM for Non-AC).
2. **Master List Preparation:** Passengers must pre-save passenger names and age details in their IRCTC Master List prior to 9:55 AM.
3. **Payment Speed:** Use instantaneous payment modes like IRCTC e-Wallet or direct UPI to complete checkout before quotas fill up. Check our comparison guide on [Tatkal vs Current Availability](/blog/tatkal-vs-current-availability-last-minute-train-ticket).

---

## What Time Does Current Availability Booking Open?

**Current availability ticket booking opens approximately 8 hours before scheduled train departure (or 9:00 PM the previous evening for pre-14:00 departures) immediately following first reservation chart preparation. This discounted or normal fare booking window remains active on the IRCTC portal and PRS counters until roughly 30 minutes prior to departure time.**

When train seats remain unsold after the primary reservation charts are finalized, Indian Railways releases them as **Current Availability** tickets. Unlike waitlisted options, a current availability ticket guarantees a **fully confirmed berth** with designated coach and seat numbers.

Features of Current Availability booking:
- **Opening Time:** Opens right after 1st Chart Preparation (~8 hours before train departure from origin, or 9:00 PM previous day for pre-14:00 departures).
- **Closing Time:** Closes 30 minutes before departure or when 2nd Chart Preparation occurs.
- **Fare Discounts:** Indian Railways often applies up to a **10% discount** on basic fares for vacant berths sold under current availability to maximize coach occupancy.
- **Live Vacancy Check:** You can inspect available empty berths in real time using [Chart Vacancy](/chart-vacancy) or check your boarding station chart generation status on [Chart Times](/chart-times).

---

## Common Booking Questions (FAQ)

### What time does IRCTC maintenance start tonight?
IRCTC night maintenance starts every night at 11:45 PM IST (23:45) and concludes at 12:20 AM IST (00:20), lasting for exactly 35 minutes.

### Can I check PNR status during the night maintenance window?
No, real-time PNR status queries cannot be processed between 11:45 PM and 12:20 AM IST because central PRS database connections are temporarily suspended.

### What should I do if my money is debited at 11:45 PM without getting a ticket?
Do not worry. The transaction will automatically be flagged as failed, and IRCTC will initiate a 100% refund to your bank account within 3 to 5 business days without any cancellation fee.

### Does IRCTC maintenance happen on weekends and holidays?
Yes, IRCTC night maintenance occurs every single day of the year, including Saturdays, Sundays, national holidays, and major festivals.

### What time does ticket booking open on IRCTC in the morning?
General 60-day Advance Reservation Period (ARP) ticket booking opens every morning at 8:00 AM IST. Note that only Aadhaar-authenticated accounts can book general tickets on the opening day.

### What time does AC and Non-AC Tatkal booking open?
AC Tatkal (2A, 3A, 3E, CC, EC) opens at 10:00 AM IST, while Non-AC Tatkal (Sleeper and 2S) opens at 11:00 AM IST, exactly one day prior to the train's departure from its origin station.

### Can I book unreserved tickets on the UTS app during IRCTC maintenance?
Yes, the UTS mobile app operates on a separate server network and allows unreserved ticket booking during the midnight maintenance window, though wallet recharges should be avoided.

### Can I change my boarding station during night maintenance?
No, boarding point changes require active PRS access. However, under 2026 rules, you can change your boarding station online any time outside maintenance hours up until the preparation of the second reservation chart.

### When is the first and second reservation chart prepared?
The first chart is prepared roughly 8 hours before train departure (or 9:00 PM the previous evening for morning departures before 14:00), and the second final chart is prepared 30 to 45 minutes before departure.

### Can I cancel a confirmed ticket during the night maintenance window?
No, online cancellations are disabled from 11:45 PM to 12:20 AM IST. If your train departs early in the morning and you need to cancel, do so before 11:45 PM or immediately after 12:20 AM.