# 🛠️ Developer & API Guide

Technical overview of the LastBerth architecture, Prisma data models, and chart time ingestion workflows.

---

## 🏛️ System Architecture Overview

LastBerth is structured as a high-performance two-service monorepo:

* **Frontend**: Next.js 16 (App Router) + Tailwind CSS + Lucide Icons (Port 3010)
* **Backend**: NestJS + Prisma ORM + PostgreSQL 16 (Port 3009)
* **Database**: PostgreSQL (Supabase / Local) storing trains, stations, chart events, and monitoring requests.

```
+-------------------+        HTTP / REST        +-------------------+
| Next.js Frontend  | ------------------------> |  NestJS Backend   |
|   (Port 3010)     |                           |   (Port 3009)     |
+-------------------+                           +-------------------+
                                                          |
                                                    Prisma ORM
                                                          |
                                                          v
                                                +-------------------+
                                                |  PostgreSQL 16    |
                                                |   (railchart DB)  |
                                                +-------------------+
```

---

## 🗄️ Database Models (`backend/prisma/schema.prisma`)

Key domain models managed by Prisma:

* `Train`: Core train details (number, name, origin, destination).
* `TrainStationChartTime`: Station-wise chart preparation rules and recorded chart finalization timestamps.
* `MonitoringRequest`: User seat alert requests for specific routes/dates.
* `ChartEventInstance`: Scheduled cron instances claiming chart checks via background workers.

---

## 🔑 Admin Chart Ingestion Endpoints

The backend exposes secured chart time ingestion endpoints unlocked via `CHART_TIME_INGESTION_PASSWORD`:

```http
POST /api/chart-time-ingestion/verify
Content-Type: application/json

{
  "password": "<CHART_TIME_INGESTION_PASSWORD>"
}
```

```http
POST /api/chart-time-ingestion/run
Content-Type: application/json

{
  "trainNumber": "12951",
  "journeyDate": "2026-07-28"
}
```

---

## 🌐 External Resources & Web App

* **Production Web App**: [https://lastberth.com](https://lastberth.com)
* **GitHub Repository**: [bizzareus/traintickets](https://github.com/bizzareus/traintickets)
