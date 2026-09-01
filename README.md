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

## 🏗️ Infrastructure & Deployment Architecture

LastBerth runs on a high-efficiency, containerized dual-instance architecture deployed on AWS EC2 (`t3.micro` instances in `ap-south-1` Mumbai) fronted by Cloudflare Proxy and Caddy HTTPS reverse proxies.

```mermaid
flowchart TD
    subgraph Client["🌐 Clients & Browsers"]
        User["User / Mobile Browser"]
    end

    subgraph Cloudflare["🛡️ Cloudflare Edge (DNS & SSL Proxy)"]
        CF_FE["v2.lastberth.com\n(Proxy: 104.21.51.190)"]
        CF_BE["api-v2.lastberth.com\n(Proxy: 172.67.184.39)"]
        CF_PROD["lastberth.com\n(Current Live: 69.46.46.30)"]
    end

    subgraph AWS_FE["🖥️ AWS Frontend Instance (13.202.107.176 - t3.micro)"]
        direction TB
        Caddy_FE["Caddy 2 Proxy\nPorts: 80 / 443\n(Auto Let's Encrypt TLS)"]
        NextJS["Next.js 16 SSR Container\n(frontend:3010)\nNode 22-Alpine"]
        Caddy_FE -->|"Proxy pass http://frontend:3010"| NextJS
    end

    subgraph AWS_BE["🖥️ AWS Backend Instance (13.207.130.42 - t3.micro)"]
        direction TB
        Caddy_BE["Caddy 2 Proxy\nPorts: 80 / 443\n(Auto Let's Encrypt TLS)"]
        NestJS["NestJS API Container\n(backend:3009)\nNode 22-Alpine"]
        Postgres["PostgreSQL 16 Container\n(db:5432)\nVolume: pg_data"]
        
        Caddy_BE -->|"Proxy pass http://backend:3009"| NestJS
        NestJS -->|"Prisma ORM (db:5432)"| Postgres
    end

    subgraph External["🔌 External APIs & Services"]
        IRCTC["IRCTC & Browser-Use API"]
        WATI["WhatsApp API (WATI)"]
        Resend["Resend (Transactional Email)"]
        OpenAI["OpenAI (GPT-4o/5)"]
    end

    subgraph CICD["🚀 GitHub Actions CI/CD"]
        GHA[".github/workflows/deploy-aws.yml\nPush to main"]
    end

    %% Client Traffic
    User -->|"HTTPS GET /"| CF_FE
    User -->|"HTTPS API /api/*"| CF_BE
    User -.->|"Legacy Production"| CF_PROD

    %% Edge to Origin
    CF_FE -->|"HTTPS :443"| Caddy_FE
    CF_BE -->|"HTTPS :443"| Caddy_BE

    %% Frontend to Backend Cross-Origin
    NextJS -.->|"CORS Allowed Origin"| CF_BE

    %% Backend to External
    NestJS --> IRCTC
    NestJS --> WATI
    NestJS --> Resend
    NestJS --> OpenAI

    %% CI/CD Deployment
    GHA -->|"SSH Deploy / Docker Build"| AWS_FE
    GHA -->|"SSH Deploy / Docker Build"| AWS_BE

    classDef aws fill:#FF9900,stroke:#232F3E,stroke-width:2px,color:#fff;
    classDef cf fill:#F38020,stroke:#FAAD3F,stroke-width:2px,color:#fff;
    classDef container fill:#2496ED,stroke:#1D63ED,stroke-width:2px,color:#fff;
    classDef db fill:#336791,stroke:#244D6E,stroke-width:2px,color:#fff;

    class AWS_FE,AWS_BE aws;
    class CF_FE,CF_BE,CF_PROD cf;
    class NextJS,NestJS,Caddy_FE,Caddy_BE container;
    class Postgres db;
```

### 📋 Infrastructure Memory & Topology Reference

| Component | Target Host / IP | Subdomain / Port | Description |
|---|---|---|---|
| **Frontend EC2** | `13.202.107.176` (`t3.micro`, `ap-south-1`) | `v2.lastberth.com` (80/443) | Runs Caddy 2 reverse proxy + Next.js 16 SSR container (`frontend:3010`). Localized JSON content & SSR pages. |
| **Backend EC2** | `13.207.130.42` (`t3.micro`, `ap-south-1`) | `api-v2.lastberth.com` (80/443) | Runs Caddy 2 reverse proxy + NestJS API (`backend:3009`) + PostgreSQL 16 (`db:5432`). |
| **Old Production** | `69.46.46.30` | `lastberth.com` (Apex) | Current live production instance (preserved during parallel verification). |
| **Security Groups** | Both AWS EC2s | Port 22 (SSH), 80 (HTTP), 443 (HTTPS) | SSH restricted to authorized IP `143.58.187.80/32`. Ports 80 and 443 open to Cloudflare proxy. |
| **Database** | Backend EC2 Docker | `postgresql://postgres:postgres@db:5432/railchart` | PostgreSQL 16 container with persistent volume `pg_data`. 36 Prisma migrations applied and seeded. |
| **CORS Policy** | NestJS (`backend/src/main.ts`) | `https://*.lastberth.com`, `localhost` | Dynamic origin validator with credentials support (`access-control-allow-credentials: true`). |
| **CI/CD** | GitHub Actions | Push to `main` branch | Workflow `.github/workflows/deploy-aws.yml` syncs code and rebuilds containers automatically. |

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
├── infra/                # AWS EC2 Docker Compose, Caddyfiles & Terraform
│   ├── Caddyfile         # Backend Caddy reverse proxy config
│   ├── Caddyfile.frontend# Frontend Caddy reverse proxy config
│   ├── docker-compose.yml# Backend + Postgres + Caddy Docker Compose
│   ├── docker-compose.frontend.yml # Frontend + Caddy Docker Compose
│   └── deploy.sh         # Automated zero-downtime deployment script
└── public/               # Static assets & icons
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
