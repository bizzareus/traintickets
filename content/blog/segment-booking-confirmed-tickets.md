---
title: "Find Confirmed Tickets on WL Trains with Segment Booking"
description: "When the full journey shows WL/Regret, segment booking can still get you moving. Learn the method, the tradeoffs, and how to choose the best train."
date: "2026-05-15"
updated: "2026-05-15"
tags:
  - segment booking
  - confirmed tickets
  - last minute tickets
  - irctc
---

## TL;DR

If A → D is WL/Regret, you can sometimes still book:

- A → B (confirmed)
- B → C (confirmed)
- C → D (maybe check realtime / wait for chart movement)

The goal is to secure a **confirmed start from your origin**, then maximize how far you can travel on confirmed legs.

## Why segment booking works

IRCTC availability is not only “per train”. It’s often “per train + station pair + class + quota”.

That means:

- A → D might be blocked
- but A → B or A → C might still be confirmed
- or B → D might have seats because fewer people board at B

## A simple decision rule

When comparing trains for last-minute travel, don’t start with the train name.
Start with these signals:

1. **Confirmed time from origin** (how many hours you can travel on confirmed legs)
2. **Confirmed from origin** (a hard requirement if you don’t want to gamble at the first boarding)
3. **Fastest overall train** from origin to destination
4. **Total price** across all booked legs
5. **Longest single confirmed leg** (fewer swaps, less hassle)

This ranking matches how real travelers think: first secure movement, then optimize comfort and speed.

## Tradeoffs to be aware of

- Segment booking can mean **multiple tickets**.
- You may need to change coach/class between legs.
- Some legs can remain “check realtime” until charting happens.

If you want minimal complexity, prefer trains with a single long confirmed leg from origin.

## The workflow

1. Search your route and date.
2. Use the “scan all trains” action on [LastBerth](/) to evaluate every listed train.
3. Open the top-ranked plan and book the confirmed legs.
4. If your plan ends early, monitor the next leg near chart time.

## When not to use segment booking

If you require a single PNR or you cannot handle any uncertainty near charting, segment booking may not be a good fit.

In that case, prioritize trains that already show confirmed/RAC for the full journey, even if they depart at a less convenient time.

## Related guides

- [Why confirmed from origin matters in segment booking](/blog/confirmed-from-origin-segment-booking)
- [Best train when all trains show WL/RAC/Regret](/blog/best-train-when-all-trains-show-waiting-list)
- [How to check vacant berths after chart preparation](/blog/how-to-check-vacant-berths-after-chart-preparation)
