# 🚆 LastBerth (RailChart)

> **Never miss a vacant berth after chart preparation.** Real-time Indian Railways seat availability tracking, chart preparation timelines, PNR status insights, and official IRCTC food menu guides.

[![Website](https://img.shields.io/badge/Website-lastberth.com-0284c7?style=for-the-badge&logo=googlechrome)](https://lastberth.com)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=nextdotjs)](https://nextjs.org)
[![NestJS](https://img.shields.io/badge/NestJS-Backend-E0234E?style=for-the-badge&logo=nestjs)](https://nestjs.com)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma)](https://prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql)](https://postgresql.org)

---

## 🌟 Key Features

LastBerth brings transparency to Indian Railways train journeys by transforming complex raw IRCTC data into simple, actionable tools for passengers:

### 1. 📊 Real-Time Chart Vacancy Tracker & Coach Map
* **Visual Coach Layout**: View exact free berths (Lower, Middle, Upper, Side Lower, Side Upper) coach-by-coach after chart preparation.
* **Current Reservation Seat Finder**: Spot unallotted quota berths and last-minute cancellations available for instant booking.

### 2. ⏱️ IRCTC Chart Preparation Time Predictor
* **1st Chart Timeline (4 Hours Prior / 8 PM Rule)**: Calculate exact 1st chart preparation times based on departure schedule (e.g. 8 PM previous evening for morning departures up to 14:00).
* **2nd Chart Timeline (30 Minutes Prior)**: Track 2nd chart preparation window when final passenger lists are handed to TTEs.
* **Station-Wise Chart Ingestion**: Real-time station chart status tracking for intermediate stations along train routes.

### 3. 🍱 IRCTC Railway Food Menu & Standard Meal Price Guide
* **Official Approved Rates**: Detailed price lookup for IRCTC standard meals (Veg Thali, Non-Veg Thali, Breakfast, Standard Tea/Coffee).
* **Pantry Car & Station Menu Guide**: Price transparency for passengers to avoid overcharging on express & mail trains.

### 4. 🎫 PNR Status & Waitlist Confirmation Analytics
* **Confirmation Probability**: Data-backed insights for GNWL, PQWL, and RLWL tickets.
* **Instant Availability Alerts**: Receive push, SMS, or WhatsApp alerts the moment a vacant berth opens up at chart time.

### 5. 🗺️ Interactive Train Routes & Station Timings
* Complete route schedules, arrival/departure delays, platform numbers, and distance maps for all Indian Railways trains.

### 📖 Passenger Glossary & Educational Guides
* Comprehensive breakdown of IRCTC quotas (Tatkal, Premium Tatkal, Ladies Quota, Senior Citizen Quota) and refund rules.

---

## 🛠️ Tech Stack & Monorepo Architecture

This monorepo consists of a Next.js frontend and a NestJS backend powered by PostgreSQL & Prisma ORM:

```
traintickets/
├── app/                  # Next.js (App Router) frontend (Port 3010)
│   ├── chart-times/      # Chart preparation timing calculator pages
│   ├── irctc-train-food/ # Food menu & price transparency guides
│   ├── pnr-status/       # PNR prediction & status lookup
│   ├── routes/           # Interactive train route schedules
│   └── trains/           # Chart vacancy maps & seat availability
├── backend/              # NestJS backend API & background workers (Port 3009)
│   ├── prisma/           # PostgreSQL schema & database migrations
│   └── src/              # Ingestion engines, monitoring crons & webhooks
└── public/               # Static assets & GitHub Pages micro-utilities
```

---

## ⚙️ Quick Start Setup

### Prerequisites
* Node.js 22.x
* PostgreSQL 16 local instance (`railchart` database)

### 1. Database & Backend Setup

```bash
cd backend

# Create environment file
cp .env.example .env
# Ensure DATABASE_URL="postgresql://postgres:postgres@localhost:5432/railchart"

# Install dependencies and run migrations
npm install
npm run db:migrate
npm run db:seed

# Start backend dev server
npm run start:dev
```
*Backend API runs at `http://localhost:3009`.*

### 2. Frontend Setup

```bash
# From repository root
npm install

# Start Next.js frontend dev server
npm run dev:web
```
*Frontend opens at `http://localhost:3010`.*

---

## 🔑 Environment Variables

| Variable | Scope | Description |
|---|---|---|
| `DATABASE_URL` | Backend | PostgreSQL connection string (`postgresql://postgres:postgres@localhost:5432/railchart`) |
| `JWT_SECRET` | Backend | Secret for authentication tokens |
| `CHART_TIME_INGESTION_PASSWORD` | Backend | Password to unlock `/admin/*` chart ingestion tools |
| `API_URL` | Backend | Backend base origin (`http://localhost:3009`) |
| `FRONTEND_URL` | Backend | Frontend base origin (`http://localhost:3010`) |
| `NEXT_PUBLIC_API_URL` | Frontend | Public backend API URL |
| `NEXT_PUBLIC_APP_URL` | Frontend | Public app URL |

---

## 📜 Key NPM Scripts

| Command | Description |
|---|---|
| `npm run dev` | Run both frontend (3010) and backend (3009) concurrently |
| `npm run dev:web` | Start Next.js web application only |
| `npm run dev:api` | Start NestJS API server only |
| `npm run db:migrate` | Apply Prisma database migrations |
| `npm run db:seed` | Seed initial train database and chart rules |
| `npm run db:studio` | Open Prisma Studio database UI |
| `npm run test:e2e` | Run Playwright end-to-end test suite |

---

## 🔐 Admin Ingestion Tools

- Admin routes under `/admin/chart-time-ingestion` require password unlocking using `CHART_TIME_INGESTION_PASSWORD`.
- Ingestion fetches station composition and chart finalization timestamps directly to populate real-time vacancy maps.

---

## 🌐 Live Product & Communities

* **Official Website**: [lastberth.com](https://lastberth.com)
* **Medium Blog**: [Medium @kartik.arora1508](https://medium.com/@kartik.arora1508)
* **License**: Proprietary / All rights reserved.
