---
title: "IRCTC Maintenance Time: 11:45 PM to 12:20 AM Rules (2026)"
description: "IRCTC maintenance time runs daily from 11:45 PM to 12:20 AM IST. Check server downtime rules, morning 8 AM ARP, Tatkal slots, and failed payment refunds."
date: "2026-06-18"
updated: "2026-10-27"
tags:
  - train booking
  - irctc
  - irctc maintenance time
  - irctc downtime
  - irctc server down time
  - irctc timings
  - irctc booking timings
  - railway maintenance time
---

> **Traveling on Indian Railways?** When IRCTC maintenance shuts down booking or direct trains show REGRET, find guaranteed confirmed seats and post-charting vacancies on LastBerth:
>
> - [Search Delhi ➔ Patna Special Trains](/?from=NDLS&to=PNBE&fromName=New%20Delhi&toName=Patna%20Jn&src=blog_maintenance)
> - [Search Delhi ➔ Mumbai Confirmed Seats](/?from=NDLS&to=MMCT&fromName=New%20Delhi&toName=Mumbai%20Central&src=blog_maintenance)
> - [Search Mumbai ➔ Danapur Express Seats](/?from=MMCT&to=DNR&fromName=Mumbai%20Central&toName=Danapur&src=blog_maintenance)
> - [Search Bengaluru ➔ Chennai Trains](/?from=SBC&to=MAS&fromName=KSR%20Bengaluru&toName=MGR%20Chennai%20Central&src=blog_maintenance)
> - [Search Howrah ➔ Puri Holiday Trains](/?from=HWH&to=PURI&fromName=Howrah%20Jn&toName=Puri&src=blog_maintenance)
> - Track live released berths on the [Chart Vacancy Map](/chart-vacancy) or check train chart release times on [Chart Times](/chart-times).

## TL;DR

IRCTC ticketing operates daily from **12:20 AM to 11:45 PM IST**, shutting down for a mandatory 35-minute nightly server maintenance window between **11:45 PM and 12:20 AM IST (23:45 to 00:20)**. Morning 60-day Advance Reservation Period (ARP) bookings open at **8:00 AM IST** (restricted to Aadhaar-authenticated profiles on Day 1), while Tatkal opens at **10:00 AM IST for AC** and **11:00 AM IST for Non-AC** classes. If money is debited during midnight maintenance without generating a PNR, IRCTC automatically processes a 100% refund within 3 to 5 business days. When trains show REGRET or heavy waitlists, [Finding Smart Seats](/) discovers confirmed contiguous split tickets on the same train without paying Tatkal markups.

---

## What Is the IRCTC Night Maintenance Time Tonight?

**The daily IRCTC night maintenance time runs strictly from 11:45 PM to 12:20 AM IST (23:45 to 00:20). During this 35-minute downtime window, all online ticket bookings, cancellations, PNR status inquiries, and payment checkouts are completely suspended across the IRCTC website and Rail Connect app.**

This mandatory midnight pause is an architectural requirement for Indian Railways IT infrastructure managed by the Centre for Railway Information Systems (CRIS). Handling millions of passenger queries, seat searches, and banking settlements each day, the central database pauses user-facing connections to execute critical batch reconciliations and maintain data integrity.

During the nightly maintenance window:

- **No Logins or Availability Checks:** Users cannot sign into IRCTC user accounts, search live seat availability, or view active train berth charts.
- **Booking and Cancellation Disabled:** Neither reserved e-tickets nor cancellations can be processed online.
- **Cached Timetables Only:** Static train timetables and station lists remain readable, but any dynamic query requiring real-time PRS server connectivity fails.
- **No PNR Status Updates:** Passenger Reservation System (PRS) servers do not accept status polling during maintenance.

If you attempt to finalize a booking at 11:44 PM and your payment gateway transaction settles at 11:45 PM, the system rejects the booking. Your money is completely safe: IRCTC flags the transaction as an unassigned debit and automatically credits a full refund to your source payment account.

---

## What Is the Master IRCTC Daily Operating Schedule for 2026?

**The master IRCTC schedule operates 23 hours and 25 minutes daily, from 12:20 AM to 11:45 PM IST. General 60-day advance reservations open at 8:00 AM IST, AC Tatkal opens at 10:00 AM IST, Non-AC Tatkal opens at 11:00 AM IST, and servers pause nightly between 11:45 PM and 12:20 AM IST.**

To avoid getting caught by daily server maintenance cutoffs or missing high-demand opening windows, keep this official 24-hour operational timetable handy:

| Service / Booking Window | Daily Operating Hours (IST) | Advance Window | Key Rules & System Restrictions |
| :--- | :--- | :--- | :--- |
| **Night Server Maintenance** | 11:45 PM – 12:20 AM | Daily (35 mins) | All booking, cancellations, PNR lookups and logins completely offline |
| **General Booking Window** | 12:20 AM – 11:45 PM | Daily (23h 25m) | Normal reservations across active quotas, classes, and express trains |
| **Opening Day ARP Booking** | 8:00 AM IST | 60 Days prior | **Aadhaar-authenticated profiles only** on opening day |
| **Subsequent ARP Days** | 12:20 AM – 11:45 PM | Days 59 to 1 | Open to both verified and unverified user accounts |
| **AC Tatkal Booking** | 10:00 AM IST | 1 Day prior | 2A, 3A, 3E, CC, EC (No 1A; agents blocked 10:00–10:30 AM) |
| **Non-AC Tatkal Booking** | 11:00 AM IST | 1 Day prior | Sleeper (SL) and 2S (Agents blocked 11:00–11:30 AM) |
| **Premium Tatkal (PT)** | 10:00 AM / 11:00 AM | 1 Day prior | Dynamic pricing; opens concurrently with regular Tatkal |
| **Authorized Agent Tatkal** | 10:30 AM / 11:30 AM | 1 Day prior | 30-minute anti-tout embargo applies to all registered ticketing agents |
| **First Chart Preparation** | ~8 Hours prior (or 9 PM) | Departure day | Primary waitlists finalized; Current Availability opens |
| **Current Availability Booking** | Post 1st Chart to -30 mins | Departure day | Vacant berths sold online and at counters at up to 10% base fare discount |
| **Second / Final Chart** | 30–45 mins prior | Departure day | Online bookings close; final passenger lists transfer to TTE Handheld Terminals (HHT) |
| **Boarding Station Change** | Up to 2nd Charting | Departure day | Permitted online until second chart preparation (~30 mins before train departure) |

For route schedules and coach formations on major trunk routes, check our dedicated [Delhi to Mumbai Train Route](/routes/delhi-to-mumbai) and [Delhi to Patna Train Schedule](/routes/delhi-to-patna).

---

## Why Does IRCTC Shut Down Servers Every Night at 11:45 PM?

**IRCTC shuts down servers every night at 11:45 PM to allow the Centre for Railway Information Systems (CRIS) to flush database transaction logs, synchronize Passenger Reservation System (PRS) records across all 17 railway zones, reconcile interbank payment gateway settlements, purge unauthorized bot sessions, and recalculate waitlists.**

Without this synchronized 35-minute downtime window, the national ticketing grid would face severe transactional risks:

1. **Database Lock Contention:** Over 150,000 concurrent write operations could lock database tables, leading to payment discrepancies, ghost transactions, and duplicate berth allocations.
2. **Interbank Settlement Batch Jobs:** Banking payment gateways (State Bank of India, HDFC, ICICI, and RBI National Payments Corporation switches) run mandatory end-of-day reconciliation batches between 23:45 and 00:15 IST. Disconnecting transaction pipelines prevents orphaned charges.
3. **Waitlist Queue Recalibration:** The system processes cancelled quotas, recalculates quota pools, and prepares fresh inventory for the morning 8:00 AM ARP opening.
4. **Anti-Scraping Security Sweeps:** Automated firewalls purge suspicious IP addresses, rate-limit unauthorized bot scrapers, and clear cached sessions to prepare for morning Tatkal traffic surges.

If you are planning holiday travel on festive corridors, you can track train schedules and confirmation trends on our [Mumbai to Danapur Route Guide](/routes/mumbai-to-danapur).

---

## What Time Does Ticket Booking Open on IRCTC in the Morning?

**General train ticket booking on IRCTC opens every morning at 8:00 AM IST for trains within the 60-day Advance Reservation Period (ARP). For journeys already within the 60-day window, ticket booking remains continuously open 23 hours and 25 minutes a day, from 12:20 AM until 11:45 PM IST.**

Under revised Indian Railways reservation rules, the advance reservation window is set at 60 days (excluding the day of train departure from its originating station). Opening day reservations begin at exactly 8:00 AM IST across both the IRCTC website and physical PRS railway station counters.

Key morning booking rules include:

- **Mandatory Aadhaar Rule on Opening Day:** Under official ticketing guidelines, only Aadhaar-authenticated user accounts are permitted to book general reserved tickets on the opening day of the 60-day ARP. Unverified profiles can book from Day 2 onwards.
- **Master List Pre-Registration:** Before the 8:00 AM opening bell, pre-save passenger names, ages, and berth preferences in your IRCTC Master List to complete checkout within seconds.
- **Monthly Booking Limits:** Unverified accounts can book up to 12 tickets per calendar month, while Aadhaar-verified profiles can book up to 24 tickets per month (provided at least one passenger on tickets 13 to 24 is Aadhaar-verified).
- **Per-User Daily Caps:** IRCTC caps individual users at a maximum of 6 tickets per day overall, preventing commercial hoarding on personal user credentials.

For a comprehensive walkthrough of account verification, read our guide on [IRCTC Ticket Booking Limits and Aadhaar Rules](/blog/irctc-ticket-booking-limits-aadhaar-verification).

---

## What Time Does Tatkal Booking Open on IRCTC for AC and Sleeper?

**Tatkal ticket booking opens daily at 10:00 AM IST for AC classes (2A, 3A, 3E, CC, EC; First AC excluded) and 11:00 AM IST for Non-AC classes (Sleeper, 2S) exactly one day prior to the train's scheduled departure from its originating station.**

Tatkal reservation provides last-minute travel access for passengers who need urgent journey tickets. Because popular train quotas exhaust within 60 to 120 seconds, understanding the exact schedule and booking mechanics is essential:

| Quota / Class | Opening Time (IST) | Advance Booking Window | Refund Policy on Cancellation |
| :--- | :--- | :--- | :--- |
| **AC Tatkal (2A, 3A, 3E, CC, EC)** | 10:00 AM IST | 1 Day Prior to Train Origin | Zero refund on confirmed tickets |
| **Non-AC Tatkal (SL, 2S)** | 11:00 AM IST | 1 Day Prior to Train Origin | Zero refund on confirmed tickets |
| **Premium Tatkal (AC & Non-AC)** | 10:00 AM / 11:00 AM | 1 Day Prior to Train Origin | Dynamic fare pricing; zero refund |
| **Waitlisted Tatkal (TQWL)** | Same as Tatkal | 1 Day Prior to Train Origin | Auto-refund if not confirmed at charting |

To ensure fair public access and curb ticket touts:

1. **30-Minute Agent Ban:** Registered IRCTC travel agents cannot access Tatkal booking during the first 30 minutes of opening (10:00 AM to 10:30 AM for AC, and 11:00 AM to 11:30 AM for Non-AC).
2. **Passenger Caps:** A maximum of 4 passengers can be booked per Tatkal PNR, compared to 6 passengers on general quota bookings.
3. **Daily Tatkal Limit:** Individual users are restricted to booking a maximum of 2 Tatkal PNRs per day.
4. **Instant Payment Gateway:** Use instantaneous payment channels like IRCTC e-Wallet or direct UPI QR to complete payment before quotas fill up.

For speed tactics and booking workflows, review our in-depth guides on [Tatkal vs Current Availability](/blog/tatkal-vs-current-availability-last-minute-train-ticket) and [Ultimate Tatkal Booking Speed Hacks](/blog/ultimate-tatkal-booking-guide-speed-hacks).

---

## What Happens If Money Is Deducted During IRCTC Maintenance?

**If money is debited from your bank account near 11:45 PM without generating a PNR, your funds are completely safe. The payment is flagged as an unassigned settlement and IRCTC automatically initiates a 100% full refund to your original payment method within 3 to 5 business days.**

When this occurs, you are protected by statutory payment clearing rules:

- **Zero Cancellation Fee Deducted:** Because no ticket or PNR was generated, Indian Railways does not deduct clerkage charges, GST, or convenience fees.
- **Automatic Reconciliation:** Once servers resume operations at 12:20 AM IST, the CRIS financial engine reconciles pending payment gateway logs against generated PNR databases. Unmatched debits trigger instant reversal commands.
- **Checking Refund Status:** Log into your IRCTC account dashboard and navigate to _My Transactions ➔ Ticket Refund History_. The transaction appears with an official Refund Reference Number and payment gateway trace ID.
- **Banking Turnaround:** UPI transactions typically credit within 24 to 48 hours, while net banking and debit/credit card refunds take 3 to 5 business days depending on your bank's clearing cycle.

If your funds are not restored within 7 business days, lodge an automated grievance on the [RailMadad portal](https://railmadad.indianrailways.gov.in) or call the unified railway helpline at **139** with your bank Transaction ID. For complete refund tracking instructions, see our master guide on [IRCTC Refund Status Tracking](/blog/irctc-refund-status-check-track-ticket-refund).

---

## Why Is IRCTC Login Access Denied or Not Working at Night?

**IRCTC login access is denied or displays connection errors between 11:45 PM and 12:20 AM IST because user authentication services are deliberately disconnected during nightly server maintenance. If you receive an access denied error outside this window, clear your browser cache or disable third-party VPNs.**

Thousands of commuters encounter cryptic error banners such as "Access Denied," "Session Expired," or "Service Unavailable" when attempting to log in near midnight. Understanding the underlying causes prevents panic:

1. **Scheduled Maintenance Blackout:** Every night at 11:45 PM IST, the central authentication gateway severs active sessions. Even if you entered the correct username, password, and captcha, the server refuses verification until 12:20 AM IST.
2. **VPN and Proxy Blocks:** IRCTC actively blocks traffic originating from known commercial VPNs and international proxy IP addresses to safeguard against automated scalpers. Ensure your VPN is disabled.
3. **Geo-Location and Overseas Access:** If you are accessing IRCTC from abroad (such as the USA, Canada, or the UK), keep in mind that 11:45 PM to 12:20 AM IST corresponds to daytime in North America (for example, 2:15 PM to 2:50 PM EDT). Always verify Indian Standard Time before attempting a login.
4. **Stale Session Cookies:** If the error persists after 12:20 AM IST, hard-refresh your browser (`Ctrl + F5` or `Cmd + Shift + R`) or use an incognito window to clear cached session cookies.

---

## What Can You Do While IRCTC Is Down for Maintenance?

**While IRCTC servers are down for maintenance between 11:45 PM and 12:20 AM IST, you can book unreserved tickets on the independent UTS mobile app, check real-time train running status via the 139 railway helpline, view offline station timetables, or explore post-charting seat maps on LastBerth.**

The 35-minute midnight blackout does not mean your travel preparations must come to a halt. You can leverage several active tools and alternative channels during this window:

- **Unreserved Ticket Booking via UTS:** The official UTS mobile application operates on a separate, dedicated server cluster. You can purchase general second-class tickets and suburban platform tickets even while IRCTC is down.
- **Track Train Running Status:** Live GPS train tracking continues uninterrupted through the unified railway helpline **139**, SMS services, and railway tracking applications.
- **Explore Chart Vacancies on LastBerth:** While PRS booking is paused, you can use the [Chart Vacancy Map](/chart-vacancy) to study coach layout diagrams and evaluate physical vacant berth trends on popular routes.
- **Verify Chart Times:** Look up historical chart finalization schedules on [Chart Times](/chart-times) to know exactly when morning charts will be released for your upcoming departure.
- **Plan Contiguous Split Journeys:** When direct tickets on long-distance trains are completely sold out, prepare your booking strategy with [Smart Seats](/) so you can book immediately once servers reopen at 12:20 AM IST.

---

## Can You Book Tickets on the UTS App or Station Counters During Maintenance?

**Yes, the UTS mobile app allows unreserved ticket booking during IRCTC maintenance because it runs on an independent server infrastructure. However, physical station PRS reservation counters are closed overnight, and 24-hour station current booking counters pause operations between 11:45 PM and 12:20 AM IST.**

Key operational differences across railway ticketing channels include:

- **UTS Mobile App:** You can book unreserved general second-class coach tickets and station platform tickets between 11:45 PM and 12:20 AM. However, avoid recharging your UTS R-Wallet through net banking or UPI during this window, as third-party banking batch runs may delay wallet credit.
- **Station PRS Counters:** Station advance reservation counters operate standard shifts from 8:00 AM to 8:00 PM and are already closed during midnight hours.
- **Station Current Booking Counters:** 24x7 current ticket counters at major junction stations temporarily halt issuing reserved tickets between 11:45 PM and 12:20 AM because their terminals connect to the same central PRS database.
- **139 Phone Enquiry:** Calling **139** for general train timetables and schedule inquiries remains operational, but real-time PNR berth status lookups are paused until 12:20 AM.

For complete suburban and general ticket booking rules, consult our [IRCTC UTS App Booking Guide](/blog/irctc-uts-app-booking-guide).

---

## What Time Does Current Availability Booking Open After Charting?

**Current availability ticket booking opens immediately following first chart preparation, approximately 8 hours before train departure from origin (or 9:00 PM the previous evening for morning departures before 14:00). Current availability seats remain bookable online and at counters until 30 minutes before train departure.**

When train berths remain unsold after primary reservation charts are finalized, Indian Railways releases them as **Current Availability** tickets. Unlike waitlisted tickets, a current availability ticket guarantees a **100% fully confirmed berth** with designated coach and berth numbers.

Key rules of Current Availability bookings:

1. **Guaranteed Confirmation:** Status `CURR_AVBL` or `CURR AVL` indicates a confirmed seat. You will never be assigned RAC or waiting list status under current booking.
2. **Up to 10% Fare Discount:** Indian Railways applies up to a **10% discount on base fares** for vacant berths sold under current availability to maximize coach occupancy.
3. **Closing Window:** Booking remains active online and at station counters until the second reservation chart is prepared, roughly 30 to 45 minutes before train departure.
4. **Boarding Station Modification:** You can change your boarding station online on IRCTC up until the preparation of the second reservation chart (~30 minutes before departure).

You can check live vacant berths released after chart preparation on [Chart Vacancy](/chart-vacancy) and look up train charting schedules using [Chart Times](/chart-times). For complete booking rules, read our dedicated breakdown on [IRCTC Current Availability Explained](/blog/irctc-current-availability-explained).

---

## How to Find Confirmed Seats When Online Booking Closes or Shows REGRET?

**When a direct train shows REGRET or deep waitlist, you can secure confirmed accommodation through LastBerth Smart Seats by booking contiguous confirmed segments on the same train, tracking vacant berths on live chart maps, or reserving unallocated current availability seats up to 30 minutes before departure.**

Indian Railways standby bookings follow a strict queue progression:

$$\text{WL (Waiting List)} \rightarrow \text{RAC (Reservation Against Cancellation)} \rightarrow \text{Confirmed}$$

Here, **WL full form is Waiting List**. If an online e-ticket remains on the waiting list after final chart preparation, the IRCTC system automatically cancels the ticket and refunds the fare to your bank account. You cannot board reserved coaches on a waitlisted e-ticket. Under the Jan Vishwas Act 2026, traveling in a reserved coach without a valid confirmed ticket attracts a flat **₹500 penalty under Section 138** plus the single fare difference.

When faced with no direct availability, use these four proven rescue strategies:

1. **Smart Seats Split Booking:** When a direct route (such as New Delhi to Patna) is completely sold out, [Finding Smart Seats](/) discovers contiguous confirmed legs on the same train (for example, New Delhi to Kanpur in Coach B2, and Kanpur to Patna in Coach B5). You remain on the same train without having to disembark.
2. **Post-Charting Vacant Berths:** Monitor [Chart Vacancy](/chart-vacancy) after primary charts are finalized (~8 hours prior to departure) to discover empty berths released across remote location quotas and book them as `CURR_AVBL`.
3. **Chart Finalization Tracking:** Verify your train's historical charting timeline and set up alerts on [Chart Times](/chart-times) so you know the exact minute current availability seats go live.
4. **Mid-Route Seat Status Lookup:** Use [Seat Status Lookup](/seat-status) to inspect station-to-station berth occupancy and spot seats that fall vacant mid-journey when passengers deboard at intermediate junctions.

---

## Common Booking Questions (FAQ)

### What time does IRCTC night maintenance start and end tonight?

IRCTC night maintenance starts every night at 11:45 PM IST (23:45) and concludes at 12:20 AM IST (00:20), lasting for exactly 35 minutes across all 365 days of the year.

### Why is the IRCTC website down every night from 11:45 PM to 12:20 AM?

The nightly 35-minute maintenance allows CRIS to synchronize passenger reservation databases across all 17 railway zones, reconcile daily payment gateway settlements, purge unauthorized bot sessions, and prepare fresh inventory for the morning 8:00 AM booking opening.

### Can I check PNR status or cancel a ticket during night maintenance?

No, online ticket cancellations, PNR status lookups, and account logins are completely offline from 11:45 PM to 12:20 AM IST because central PRS database connections are temporarily suspended.

### What should I do if money was debited from my account during IRCTC maintenance?

Do not worry. The failed transaction is automatically logged by CRIS reconciliation systems, and IRCTC initiates a 100% full refund to your original payment account within 3 to 5 business days without deducting any clerkage or cancellation charges.

### What time does normal 60-day train ticket booking open every morning?

General 60-day Advance Reservation Period (ARP) ticket booking opens daily at 8:00 AM IST. Under 2026 guidelines, only Aadhaar-authenticated accounts can book general tickets on the opening day of the 60-day window.

### What time does Tatkal booking open for AC and Non-AC classes?

AC Tatkal (2A, 3A, 3E, CC, EC) opens at 10:00 AM IST, and Non-AC Tatkal (Sleeper and 2S) opens at 11:00 AM IST, exactly one day prior to the train's scheduled departure from its originating station.

### Can I book unreserved train tickets on the UTS app during IRCTC maintenance?

Yes, the UTS mobile application functions on an independent server cluster and allows unreserved ticket and suburban platform ticket booking during the midnight maintenance window.

### Can I change my boarding station online during night maintenance?

No, boarding point modifications require active PRS connectivity and cannot be executed during maintenance. However, outside maintenance hours, you can change your boarding station online up until second chart preparation (~30 minutes before departure).

### What time does Current Availability booking open on IRCTC?

Current availability booking opens immediately following first chart preparation, roughly 8 hours before train departure (or 9:00 PM the previous evening for morning departures before 14:00), and stays open until 30 minutes before train departure.

### What is the penalty for boarding a reserved train coach during maintenance blackout?

Boarding a reserved coach with an unconfirmed waiting list e-ticket or general ticket incurs a flat ₹500 fine under Section 138 of the Railways Act (as amended by the Jan Vishwas Act 2026), plus the fare difference to the boarded class.

---

## Bottom line

IRCTC operates on a synchronized daily rhythm: general reservations open at **8:00 AM**, Tatkal opens at **10:00 AM (AC) and 11:00 AM (Non-AC)**, and servers pause for maintenance from **11:45 PM to 12:20 AM IST**. When direct tickets sell out or midnight maintenance blocks your plans, use [Finding Smart Seats](/) to uncover confirmed split routes, track live chart releases on [Chart Vacancy](/chart-vacancy), and book confirmed berths with confidence.
