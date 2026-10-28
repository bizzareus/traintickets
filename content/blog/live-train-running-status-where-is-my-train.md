---
title: "Live Train Running Status: Track Where Is My Train"
description: "Learn how to check live train running status using NTES, the Where Is My Train app, and SMS to 139. Track delays, platform numbers, and your train's location."
date: "2026-06-26"
updated: "2026-10-28"
tags:
  - train booking
  - irctc
  - live train status
  - running status
  - where is my train
  - ntes
---

## TL;DR

- **Where to check:** Use the official **NTES "Spot Your Train"** portal, the **Where Is My Train** app, or send an **SMS to 139** to see exactly where your train is right now.
- **How tracking works:** Most live status today comes from **RTIS** GPS devices fitted on locomotives, which auto-update the train's position to the railway server every few seconds, with no manual entry needed.
- **Why it matters:** Knowing your train is running late buys you time to reach the station, re-plan a connection, or grab a last-minute **current available ticket** if your own ticket is stuck on the waitlist.

---

Few things cause more last-minute panic at an Indian railway station than not knowing where your train actually is. Is it on time? Running two hours late? Already left? Standing on the wrong platform with a heavy bag while the announcement crackles in a language you half understand is a uniquely stressful experience for commuters and tourists alike.

The good news is that you no longer have to guess. Indian Railways and a handful of reliable apps now track almost every train in near real time, down to the minute and the platform. This guide explains exactly how to check live train running status, which tool to trust, and how to turn that information into a confirmed seat instead of a missed journey.

---

## What is Live Train Running Status?

Live train running status is the real-time position of a train along its route, showing its current or last-crossed station, how many minutes it is running early or late, and the expected arrival and departure time at every upcoming stop. It is updated continuously while the train is in motion.

Unlike a static timetable, which only shows the _scheduled_ time, live status reflects what is actually happening on the tracks today. A typical running status screen tells you:

- The **last station crossed** and the current delay (for example, "45 min late").
- The **expected arrival/departure** at each remaining station, adjusted for the delay.
- The **platform number** at major stations, where this data is available.
- Whether the train has **departed, arrived, or is yet to start**.

This is different from your ticket status. Running status tracks the _train_; PNR status tracks _your seat_. We cover that distinction in detail below.

---

## How Can I Check Where My Train Is Right Now?

You can check where your train is right now using the official **National Train Enquiry System (NTES)** "Spot Your Train" feature, the **Where Is My Train** app, or third-party apps like ixigo and RailYatri. Enter the train name or number, and the tool displays its live location and delay instantly.

The most reliable options, in order of authority:

1. **NTES "Spot Your Train" (official):** Run by the Centre for Railway Information Systems (CRIS), this is the source most other apps pull from. Visit the NTES portal, type your train number, and view its live position, halts, and delays.
2. **Where Is My Train app:** Extremely popular for its clean interface and offline mode (more on that below).
3. **ixigo Trains / RailYatri / ConfirmTkt:** These apps layer extra features such as journey alarms, delay predictions, and seat availability on top of the same core data.

To track any train, you only need **one** of these three details: the **train number** (e.g., 12951), the **train name**, or the **PNR** on your ticket, which automatically pulls up the correct train.

> **Tip:** Search by train number, not name. Many trains share similar names (multiple "Express" services run the same route), and the number is unique.

---

## How Do I Check Train Running Status by SMS on 139?

To check train running status by SMS, send the message **"SPOT <train number>"** to **139**, the Railway Enquiry number. You will receive a reply with the train's current location and delay. This works on any basic phone without internet, making it ideal in low-network areas.

The single helpline number **139** handles most railway enquiries through SMS and IVRS (voice menu). Useful SMS formats include:

| What you want       | SMS format                               | Send to |
| ------------------- | ---------------------------------------- | ------- |
| Live running status | `SPOT <train no.>`                       | 139     |
| PNR status          | `PNR <10-digit PNR>`                     | 139     |
| Seat availability   | `AVL <train no.> <date> <class> <quota>` | 139     |
| Fare enquiry        | `FARE <train no.> <from> <to> <class>`   | 139     |

Standard SMS charges apply, and you can also **call 139** and follow the voice prompts for the same information in multiple languages. The SMS route is a lifesaver when mobile data is patchy on a moving train or at a remote station.

---

## How Do I Check Running Status for a Specific Train Number?

**To check the running status of one specific train, enter its number on the NTES "Spot Your Train" portal, or send SPOT followed by the number to 139 by SMS. On LastBerth, every train also has a schedule page at `/trains/<number>-<name>` with the full timetable, chart preparation times, and official live-status links.**

For example, [Coromandal Exp (12841)](/trains/12841-coromandal-exp) shows the complete Howrah to Chennai Central timetable, Tatkal booking windows, and chart preparation times, with official NTES and SMS 139 links for live tracking. During the festival rush, the same page connects to the chart vacancy tools you need for last-minute seats.

The URL pattern is always `/trains/<number>-<train-name>`, so the Rajendra Nagar Tejas Rajdhani to New Delhi lives at [/trains/12309-rjpb-tejas-raj](/trains/12309-rjpb-tejas-raj). You can also type any train number into the search box on the LastBerth homepage to reach its page.

---

## Is the "Where Is My Train" App Accurate Without Internet?

Yes, the Where Is My Train app is reasonably accurate offline because it estimates your train's position using nearby mobile cell-tower signals and crowdsourced data from other passengers on board, rather than relying solely on internet GPS. Accuracy improves on busy routes with more active users.

The app, now owned by Google, uses two clever methods:

- **Cell-tower triangulation:** It senses which mobile towers your phone passes and matches them to the route map to estimate location, so this works even with mobile data switched off.
- **Crowdsourcing:** Position reports from many travellers on the same train are combined to refine the estimate.

This makes it excellent for **onboard use** in tunnels, rural stretches, or zones with no data. The trade-off is that offline estimates are _predictions_, not official records. For the precise, authoritative position, especially platform numbers, cross-check with NTES, which is fed by GPS hardware on the train itself.

---

## How Does Indian Railways Track Train Location Live?

Indian Railways tracks live train location mainly through the **Real Time Train Information System (RTIS)**, GPS devices installed on locomotives that automatically transmit the train's exact position to the central server every few seconds. This data flows directly into NTES, removing the old dependence on manual station-by-station updates.

Historically, a train's position was updated only when staff at each station logged its arrival and departure. That meant the status froze between stations and could be wrong if a manual entry was missed. RTIS, developed by CRIS with support from ISRO's satellite network, changed this completely:

- A **GPS unit on the locomotive** continuously reports latitude, longitude, and speed.
- The system **auto-detects** arrivals and departures at each station.
- Updates reach the public portal in **near real time**, often within seconds.

This is why modern running status is far more trustworthy than it was a decade ago. The vast majority of mail, express, and premium trains are now covered, though a few minor passenger services may still rely on manual feeds.

---

## How Do I Find My Train's Platform Number?

You can find your train's platform number on the NTES "Spot Your Train" page, on the Where Is My Train app, on the large electronic display boards at the station, or by listening to the station announcements. Platform numbers are usually confirmed only 30–60 minutes before the train arrives and can change at short notice.

Because platforms are assigned dynamically based on traffic, treat any platform number as **provisional** until you reach the station. Best practice:

- Check the app or NTES **before leaving** for the station to get the likely platform.
- **Re-confirm on the station display board** when you arrive, as last-minute changes are common.
- For long trains, once you know the platform, check **where your specific coach** will stop so you are not sprinting along the length of the train. (Our guide to coach position on the platform covers this.)

Arriving 30–45 minutes early gives you a comfortable buffer to absorb any platform change without missing the train.

---

## What is the Difference Between Live Status and PNR Status?

Live train running status tells you where the **train** is and whether it is delayed. PNR status tells you whether **your seat** is confirmed, on RAC, or still waitlisted. They answer two different questions: "Where is my train?" versus "Do I have a confirmed berth?", and you usually need to check both.

Here, **WL full form is Waiting List**. A waitlisted ticket moves through a fixed sequence as other passengers cancel:

**WL (Waiting List) → RAC (Reservation Against Cancellation) → Confirmed**

Your position in the queue matters a lot. A ticket at **WL/1** is far more likely to confirm than one at **WL/10**, because fewer people ahead of you need to cancel. If a waitlisted **e-ticket** does not clear by chart preparation, the system **automatically cancels it and refunds** the fare, so you cannot board on a fully waitlisted e-ticket. So while running status reassures you the train is coming, PNR status tells you whether you can legally travel on it.

---

## How Can Running Status Help You Secure a Confirmed Seat?

Running status helps you secure a seat by revealing delays that give you extra time to find alternatives, and by signalling when a train is approaching chart preparation. If your own ticket is waitlisted, those extra minutes let you book a **current available ticket** or split your journey across confirmed segments.

LastBerth turns this window of time into a confirmed journey with three features:

- **Finding Smart Seats:** When no single direct berth is free, our **[Smart Seats](/)** feature searches for split availability: it breaks your journey into available legs across different coaches on the same train, stitching together a confirmed trip.
- **PNR Status Search & Direct Booking:** Check your PNR on LastBerth to see the **waitlist confirmation probability**. If your ticket is unlikely to clear, we instantly suggest alternative trains and seat options so you are not left stranded.
- **Get Confirmed Tickets:** Use our **[Get Confirmed Tickets](/)** to see exactly from which station to which station a specific berth is booked, helping you find open berths on a running train and request them from the TTE.

If you are searching last-minute, always look for a `"current available ticket"`. A current available ticket is a **fully confirmed seat** with coach and berth numbers, released to the public roughly **8 hours before departure** and closing about **30 minutes before** the train leaves. Combined with live running status, it is the fastest, cheapest way to lock in a confirmed berth at the eleventh hour.

---

## Which Train Running Status Pages Are Trending Right Now?

**The most searched running status checks this week are festival-season workhorses: the Coromandel Expresses between Howrah and Chennai, Mumbai's Durontos and Humsafars to Bengaluru, the Rajendra Nagar Tejas Rajdhani, and a wave of 0-prefix festival specials. The table below lists all 50 rising train numbers with their route and where to check each one.**

The ranking mirrors Google Trends rising searches in India for October 27 to 28, 2026, and the mix is unmistakably festival-driven: Kolkata to Chennai, Mumbai to Bhubaneswar and Bengaluru, Secunderabad to Hisar, and the Jaynagar to Mumbai corridor for Mithila-bound travellers. Train names appear exactly as they do in official railway records.

Numbers beginning with 0 are festival and announcement specials with temporary numbers, so they do not appear in permanent timetables or on LastBerth schedule pages yet. Track those live on the official [NTES portal](https://enquiry.indianrail.gov.in/mntes), and check our [festival specials list](/special-trains) for booking details.

| Train | Route |
| :--- | :--- |
| [**20932 Indb Tvcn Sf Ex**](/trains/20932-indb-tvcn-sf-ex) | Indore ➔ Trivandrum North |
| [**22737 Sc Hsr Sf Exp**](/trains/22737-sc-hsr-sf-exp) | Secunderabad ➔ Hisar |
| [**22833 Humsafar Expres**](/trains/22833-humsafar-expres) | Bhubaneswar ➔ SMVT Bengaluru |
| [**12483 Tvcn Asr Sf Exp**](/trains/12483-tvcn-asr-sf-exp) | Trivandrum North ➔ Amritsar |
| [**12879 Ltt Bbs Express**](/trains/12879-ltt-bbs-express) | Mumbai LTT ➔ Bhubaneswar |
| [**12220 Ltt Duronto**](/trains/12220-ltt-duronto) | Secunderabad ➔ Mumbai LTT |
| **09324** (0-series special) | [Festival specials list](/special-trains) |
| [**22104 Ltt Express**](/trains/22104-ltt-express) | Ayodhya Cantt ➔ Mumbai LTT |
| **09011** (0-series special) | [Festival specials list](/special-trains) |
| **09426** (0-series special) | [Festival specials list](/special-trains) |
| **08610** (0-series special) | [Festival specials list](/special-trains) |
| [**17221 Coa Ltt Express**](/trains/17221-coa-ltt-express) | Kakinada Port ➔ Mumbai LTT |
| [**12251 Wainganga Exp**](/trains/12251-wainganga-exp) | Yesvantpur ➔ Korba |
| [**22709 Ned Aadr Sf Exp**](/trains/22709-ned-aadr-sf-exp) | H Sahib Nanded ➔ Amb Andaura |
| [**17068 Bbsn Chz Exp**](/trains/17068-bbsn-chz-exp) | Bhubaneswar New ➔ Charlapalli |
| [**12309 Rjpb Tejas Raj**](/trains/12309-rjpb-tejas-raj) | Rajendra Nagar ➔ New Delhi |
| [**12936 St Bdts Sf Exp**](/trains/12936-st-bdts-sf-exp) | Surat ➔ Bandra Terminus |
| [**17290 Mys Cct Exp**](/trains/17290-mys-cct-exp) | Mysuru ➔ Kakinada Town |
| [**12841 Coromandal Exp**](/trains/12841-coromandal-exp) | Howrah ➔ Chennai Central |
| **13038** | [Track live on NTES](https://enquiry.indianrail.gov.in/mntes) |
| [**22887 Smvb Humsafar**](/trains/22887-smvb-humsafar) | Howrah ➔ SMVT Bengaluru |
| [**12172 Hw Ltt Ac Exp**](/trains/12172-hw-ltt-ac-exp) | Haridwar ➔ Mumbai LTT |
| [**12245 Smvb Duronto Exp**](/trains/12245-smvb-duronto-exp) | Howrah ➔ SMVT Bengaluru |
| [**22113 Ltt Tvcn Sf Exp**](/trains/22113-ltt-tvcn-sf-exp) | Mumbai LTT ➔ Trivandrum North |
| [**12842 Coromandel Exp**](/trains/12842-coromandel-exp) | Chennai Central ➔ Howrah |
| [**12685 Mas Maq Sf Exp**](/trains/12685-mas-maq-sf-exp) | Chennai Central ➔ Mangaluru |
| [**12431 Rajdhani Exp**](/trains/12431-rajdhani-exp) | Trivandrum ➔ Hazrat Nizamuddin |
| [**22955 Kutch Express**](/trains/22955-kutch-express) | Bandra Terminus ➔ Bhuj |
| [**12449 Goa Smprk K**](/trains/12449-goa-smprk-k) | Madgaon ➔ Chandigarh |
| **13201** | [Track live on NTES](https://enquiry.indianrail.gov.in/mntes) |
| [**12864 Smvb Howrah Exp**](/trains/12864-smvb-howrah-exp) | SMVT Bengaluru ➔ Howrah |
| [**11062 Jyg Ltt Exp**](/trains/11062-jyg-ltt-exp) | Jaynagar ➔ Mumbai LTT |
| [**12919 Malwa Express**](/trains/12919-malwa-express) | Dr Ambedkar Nagar ➔ Shri Mata Vaishno Devi Katra |
| [**17016 Visakha Exp**](/trains/17016-visakha-exp) | Secunderabad ➔ Bhubaneswar New |
| **02564** (0-series special) | [Festival specials list](/special-trains) |
| [**12216 Dee Garibrath**](/trains/12216-dee-garibrath) | Bandra Terminus ➔ Delhi Sarai Rohilla |
| [**18519 Vskp Ltt Expres**](/trains/18519-vskp-ltt-expres) | Visakhapatnam ➔ Mumbai LTT |
| [**17310 Vsg Ypr Exp**](/trains/17310-vsg-ypr-exp) | Vasco Da Gama ➔ Yesvantpur |
| [**16526 Kanyakumari Exp**](/trains/16526-kanyakumari-exp) | KSR Bengaluru ➔ Kanyakumari |
| [**12615 Grand Trunk Exp**](/trains/12615-grand-trunk-exp) | Chennai Central ➔ New Delhi |
| [**12261 Howrah Duronto**](/trains/12261-howrah-duronto) | Mumbai CSMT ➔ Howrah |
| [**12134 Majn Csmt Sf Exp**](/trains/12134-majn-csmt-sf-exp) | Mangaluru ➔ Thane |
| [**12805 Janmabhoomi Exp**](/trains/12805-janmabhoomi-exp) | Visakhapatnam ➔ Lingampalli |
| [**18238 Chhatisgarh Exp**](/trains/18238-chhatisgarh-exp) | Amritsar ➔ Bilaspur |
| [**12003 Swaran Shatabdi**](/trains/12003-swaran-shatabdi) | Lucknow ➔ New Delhi |
| [**11447 Shaktipunj Exp**](/trains/11447-shaktipunj-exp) | Jabalpur ➔ Howrah |
| [**12776 Cocanada Sf Exp**](/trains/12776-cocanada-sf-exp) | Lingampalli ➔ Kakinada Town |
| [**19020 Hw Bdts Exp**](/trains/19020-hw-bdts-exp) | Haridwar ➔ Bandra Terminus |
| [**12955 Mmct Jaipur Sf**](/trains/12955-mmct-jaipur-sf) | Mumbai Central ➔ Jaipur |
| [**12806 Janmabhoomi Sf**](/trains/12806-janmabhoomi-sf) | Lingampalli ➔ Visakhapatnam |

---

## Common Questions About Live Train Status (FAQ)

### How can I check where my train is right now?

Enter your train number or name on the NTES "Spot Your Train" portal, the Where Is My Train app, or apps like ixigo and RailYatri. You can also send `SPOT <train number>` to 139. Each shows the train's current location, last station crossed, and how many minutes it is running late.

### Is the Where Is My Train app accurate?

It is fairly accurate, especially on busy routes. The app estimates location using mobile cell-tower signals and crowdsourced reports from other passengers, so it works even without internet. For the most precise, official position and platform numbers, cross-check with the NTES portal, which is fed by GPS devices on the trains.

### How do I check train running status without internet?

Send an SMS in the format `SPOT <train number>` to 139, the railway enquiry number, from any phone. You will receive the live location and delay by reply. The Where Is My Train app also has an offline mode that estimates position using nearby cell towers, useful while on board.

### Why does my train's running status show "no GPS feed"?

A few older or minor passenger trains are not yet fitted with RTIS GPS devices, so their status falls back to manual station updates and may freeze between stations. Most mail, express, and premium trains have live GPS tracking, which updates automatically every few seconds.

### Can live running status tell me if my waitlisted ticket will confirm?

No. Running status only shows the train's location and delay. To know if your seat will confirm, check your PNR status, which shows whether you are Confirmed, on RAC, or still on the Waiting List (WL). A position like WL/1 has a much higher chance of confirming than WL/10.

### How early should I reach the station if my train is on time?

Arrive at least 30–45 minutes before the scheduled departure. This gives you time to confirm the platform number on the display board, locate where your coach will stop, and absorb any last-minute platform change without having to rush across the station with luggage.

### How do I check the running status of a specific train number?

Open the NTES "Spot Your Train" portal and enter the number, or send `SPOT <train number>` to 139. On LastBerth, open the train's schedule page, such as [/trains/12841-coromandal-exp](/trains/12841-coromandal-exp) for the Coromandal Express, which links to official live tracking alongside the full timetable.

### Why are train running status searches spiking during the festival season?

Diwali and Chhath Puja put hundreds of extra special trains on the network, and passengers track them closely for delays and platform changes. Festival specials carry temporary 0-prefix numbers and are often announced only days before departure, so travellers check their status right up to boarding time.
