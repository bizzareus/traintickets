---
title: "IRCTC Booking Failed, Money Deducted? Refund Timeline"
description: "Did your IRCTC ticket booking fail but the money was deducted from your bank? Learn the exact refund timelines for UPI, cards, net banking, and how to track it."
date: "2026-07-05"
updated: "2026-07-22"
tags:
  - irctc refund
  - failed booking
  - money deducted
  - bank refund
  - upi refund
  - irctc ipay
---

> [!TIP]
> **Check Refund & Booking Status:** If your transaction failed, track your ticket status on [Smart Seats](/) or verify coach berth availability on [Chart Vacancy](/chart-vacancy).

## TL;DR

If your IRCTC ticket booking failed but the money was debited from your bank account, **your money is completely safe**. Indian Railways automatically initiates a refund for all failed transactions. Depending on your payment method, the refund will reflect in your account within **24 hours to 7 business days**. You do not need to file a TDR for failed bookings; the refund is automatic.

---

## Why Did IRCTC Deduct Money if My Ticket Booking Failed?

A failed booking with a successful bank debit usually happens due to a communication breakdown between the **three nodes** of the transaction: your bank, the payment gateway, and the IRCTC server. 

When you click "Pay" on the booking page, your bank debits the money and sends a confirmation to the payment gateway. However, during times of peak network congestion—especially during the daily **Tatkal booking windows (10:00 AM and 11:00 AM)**—the gateway may fail to convey this confirmation to IRCTC within the session timeout limit. 

Because the session expires before IRCTC receives the confirmation, the ticket reservation is aborted. However, since the bank has already debited the amount, the money remains temporarily in the gateway's pool. The system detects this mismatch and automatically schedules the transaction for an auto-refund.

---

## IRCTC Failed Transaction Refund Timelines (UPI vs Cards)

Refund processing speeds depend entirely on the payment mode and gateway routing. Transactions routed through IRCTC's proprietary payment gateway (**IRCTC iPay**) are processed much faster than external banking gateways.

Here is the official refund timeline for failed transactions on Indian Railways:

| Payment Method | Typical Processing Time | Gateway Details |
| :--- | :--- | :--- |
| **IRCTC iPay (e-Wallet)** | Instant to 24 Hours | Internal wallet settlement. |
| **UPI (GPay / PhonePe / Paytm)** | 1 to 3 Business Days | Settlement depends on NPCI and your UPI bank. |
| **Debit / Credit Cards** | 3 to 7 Business Days | Settlement through card networks (Visa/Mastercard/RuPay). |
| **Net Banking** | 3 to 5 Business Days | Settled via the bank's merchant clearance portal. |

> [!TIP]
> To avoid booking failures during the Tatkal rush, use **IRCTC iPay** or keep your **IRCTC e-Wallet** pre-loaded. Because these payment methods use direct internal ledgers, they bypass bank network latency, resulting in a 99% booking success rate and instant refunds if a booking does fail.

---

## What Does a Zero (₹0) Refund Status Mean?

Many passengers panic when they inspect their IRCTC transaction history and see a refund status of **Zero (₹0)** or "No Refund Initiated" for a failed transaction. 

This is a common visual glitch in the IRCTC database interface. When a booking fails, the system does not generate a PNR. Since there is no PNR, the database lacks a primary key to associate with the refund entry immediately. As a result, the default refund amount is displayed as ₹0 in the transaction logs. 

Once the merchant reconciliation run completes at the end of the day (usually around 11:30 PM), the gateway reconciles the debited amount with the failed transaction ID. The status will then update, and the full debited amount (including GST and convenience fees) will be released back to the source account.

---

## How to Track a Missing IRCTC Refund with Your Bank

If the refund has not credited to your account within the standard timeline, you can track its progress using the **Acquirer Reference Number (ARN)** or **Transaction Reference Number**.

1. **Locate the Transaction ID:** Log in to your IRCTC account, go to **My Transactions > Failed Transaction History**, and copy the Transaction ID.
2. **Contact IRCTC Support:** Email `care@irctc.co.in` or `etickets@irctc.co.in` with your Transaction ID, date of transaction, and registered email address to request the ARN.
3. **Contact Your Bank:** Once you receive the ARN (an 11 to 23-digit unique number), provide it to your bank's customer service or visit your branch. The bank can track the exact clearing house stage of the funds using this number.

---

## What Happens if Money Is Deducted After a Tatkal Session Timeout?

When a Tatkal session times out after payment authorization, IRCTC marks the transaction as failed and does not generate a PNR. The money is auto-refunded to the source account within 3–5 working days for UPI or 5–7 working days for Net Banking.

During peak Tatkal hours, payment gateways process thousands of requests simultaneously. If the gateway authorization response takes longer than IRCTC's 3-minute session limit, the reservation engine releases the locked berth back to the quota pool. However, since the bank already debited your account, the funds enter the gateway's holding pool. The merchant auto-reversal protocol triggers during nightly reconciliation, initiating a chargeback credit to your originating bank without requiring manual intervention or TDR filing.

---

## How to Check Bank Refund Status via IRCTC Ticket Refund History

Log into the IRCTC portal → My Account → My Transactions → Ticket Refund History or Failed Transaction History. Copy the 15-digit Bank Reference Number or PG Reference ID and quote it to your bank's customer support if the refund is delayed beyond 5 business days.

To locate your payment gateway reference code, open your IRCTC account dashboard and navigate to **My Transactions > Failed Transaction History**. Select the specific transaction to view the detailed payment breakdown. Note the **PG Reference ID** and **Bank Reference Number** (ARN for card payments). If your refund is not credited within the expected window, contact your bank's nodal officer or raise a query via their online grievance portal referencing this 15-digit ID for rapid resolution.

---

## Common Booking Questions (FAQ)

### Why is my IRCTC ticket booking failed but money deducted?
This happens when your bank successfully debits the money but fails to transmit the payment confirmation to the IRCTC servers within the session timeout limit, usually due to high network traffic during Tatkal hours.

### How many days does IRCTC take to refund failed transaction?
Failed transaction refunds are processed automatically. UPI transactions take 1–3 business days, net banking takes 3–5 business days, and credit/debit cards can take 3–7 business days to reflect in your bank account.

### What is ARN number in IRCTC refund?
An Acquirer Reference Number (ARN) is a unique tracking number assigned to a card or net banking transaction as it moves from the merchant's bank to the cardholder's bank. It serves as proof that the refund has been initiated.

### How do I complain to IRCTC about a failed transaction refund?
You can complain by sending an email to `care@irctc.co.in` with your transaction ID, booking date, and bank statement proof. You can also call their 24/7 customer support helpline at `14646` or tweet to `@IRCTCofficial`.

### Does IRCTC refund GST on failed bookings?
Yes. Unlike voluntary ticket cancellations where GST is deducted, failed bookings are not the passenger's fault. The railways will refund the entire amount, including the ticket fare, GST, and booking convenience fees.

### What is the refund timeline for UPI transactions on IRCTC?
UPI refunds generally reflect in your linked bank account within 24 to 72 hours (1–3 business days) after the transaction fails, once NPCI completes the settlement cycle.

### How can I get an instant refund for failed bookings on IRCTC?
To get the fastest refunds, use the **IRCTC iPay** payment gateway or the pre-funded **IRCTC e-Wallet**. Since these are internal railway payment tools, failed bookings routed through them are refunded within hours.

### Why is my refund status showing zero (₹0) on IRCTC?
This is a database logging error that occurs because no PNR is generated for failed bookings. Once the nightly ledger reconciliation is completed by the payment gateway, the system updates and refunds the full amount.

### Can I claim interest or compensation if IRCTC delays my refund beyond 7 days?
As per Reserve Bank of India (RBI) turnaround time (TAT) guidelines, if an auto-refund for a failed electronic transaction is delayed beyond T+1 business days due to bank or payment gateway delays, the customer is entitled to compensation of ₹100 per day of delay. You can escalate the delayed refund to the banking ombudsman if the issuing bank fails to credit the compensation.

### What should I do if the money was deducted but no PNR was sent to my mobile?
Check your IRCTC account under **My Transactions > Booked Ticket History** and your registered email inbox. If no PNR appears in your account history, the booking failed and no SMS was generated. The debited money will be automatically credited back to your bank account within 3–5 business days.

---

## Related Guides

- [IRCTC Refund Status Check: Track Cancelled Ticket Refund](/blog/irctc-refund-status-check-track-ticket-refund)
- [How to File a TDR in IRCTC: Step-by-Step Refund Rules](/blog/how-to-file-tdr-irctc-refund-rules)
- [IRCTC Chart Preparation: Live Booking Timelines & Rules](/blog/irctc-chart-preparation-guide)
- [Difference Between RAC and Waitlist: RAC vs WL vs Confirmed Tickets](/blog/rac-vs-wl-explained)
