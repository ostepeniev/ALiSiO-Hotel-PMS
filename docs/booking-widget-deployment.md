# ALiSiO Glamping — Booking Widget Deployment Guide

## Overview

This guide explains how to deploy the booking form on a **separate domain/subdomain** (e.g. `booking.glamping.cz`) while keeping it synchronized with the ALiSiO PMS backend for real-time availability, pricing, and reservation creation.

## Architecture

```
┌──────────────────────────┐         ┌──────────────────────────┐
│  booking.glamping.cz     │  API    │  pms.alisio.cz           │
│  (Booking Frontend)      │ ◄─────► │  (ALiSiO PMS Backend)    │
│                          │  CORS   │                          │
│  - Date selection        │         │  /api/booking/availability│
│  - House cards           │         │  /api/booking/reserve     │
│  - Guest form            │         │  SQLite DB (units, prices,│
│  - 4 languages           │         │   reservations, guests)   │
└──────────────────────────┘         └──────────────────────────┘
```

## Files to Copy

All booking form source files are in the `src/app/booking/` directory:

| File | Purpose |
|------|---------|
| `page.tsx` | Main booking page component (3-step wizard) |
| `booking.css` | All styles (dark nature theme) |
| `translations.ts` | 4 languages: UK, EN, CS, DE |
| `layout.tsx` | Page metadata |

## Setup Instructions

### Option A: Deploy as Part of the Main PMS (Recommended)

The booking page is already available at `/booking` on the PMS server. Simply point a subdomain to the same server:

```nginx
# Nginx example
server {
    server_name booking.glamping.cz;
    location / {
        proxy_pass http://localhost:3000/booking;
    }
}
```

### Option B: Standalone Next.js App on Separate Server

1. **Create a new Next.js project:**
```bash
npx -y create-next-app@latest booking-widget --ts --app --no-tailwind --no-eslint ./
```

2. **Copy the booking files** into the new project:
```
src/app/booking/page.tsx    → src/app/page.tsx
src/app/booking/booking.css → src/app/booking.css
src/app/booking/translations.ts → src/app/translations.ts
```

3. **Fix imports** in `page.tsx`:
```diff
-import './booking.css';
+import './booking.css';
-import { ... } from './translations';
+import { ... } from './translations';
```

4. **Set the PMS API URL** in `.env.local`:
```env
NEXT_PUBLIC_PMS_API_URL=https://pms.alisio.cz
```

> **IMPORTANT:** This URL must point to the running ALiSiO PMS server. All API calls (availability check, booking creation) go to this URL.

5. **Load the Inter font** — add to `layout.tsx`:
```tsx
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
```

6. **Build and deploy:**
```bash
npm run build
npm start
```

## API Endpoints (on the PMS server)

The booking form communicates with two public API endpoints. Both have **CORS enabled** (accept requests from any origin).

### GET `/api/booking/availability`

Checks available glamping houses for given dates.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `checkIn` | `YYYY-MM-DD` | ✅ | Check-in date |
| `checkOut` | `YYYY-MM-DD` | ✅ | Check-out date |
| `promoCode` | `string` | ❌ | Promo code |
| `certificateCode` | `string` | ❌ | Certificate code |

**Response:**
```json
{
  "checkIn": "2026-06-16",
  "checkOut": "2026-06-18",
  "nights": 2,
  "unitTypes": [
    {
      "id": "ut_stealth",
      "name": "Stealth House (2 beds)",
      "description": "...",
      "maxOccupancy": 2,
      "availableCount": 4,
      "avgPricePerNight": 2500,
      "totalPrice": 5000,
      "hasPricing": false,
      "currency": "CZK"
    }
  ],
  "promoDiscount": null,
  "certificate": null
}
```

---

### POST `/api/booking/reserve`

Creates a tentative reservation.

**Request body:**
```json
{
  "unitTypeId": "ut_stealth",
  "checkIn": "2026-06-16",
  "checkOut": "2026-06-18",
  "adults": 2,
  "children": 0,
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+380501234567",
  "promoCode": "",
  "certificateCode": ""
}
```

**Response (201):**
```json
{
  "success": true,
  "reservationId": "r_1773846395966",
  "unitName": "Stealth 1",
  "checkIn": "2026-06-16",
  "checkOut": "2026-06-18",
  "nights": 2,
  "totalPrice": 5000,
  "currency": "CZK"
}
```

## Environment Variable

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_PMS_API_URL` | `""` (same server) | Full URL of the PMS API server. Set when deploying on a separate domain. |

## How Syncing Works

- **Availability** — the form queries the PMS database in real-time for free/booked units
- **Pricing** — reads from `price_calendar` table, falls back to 2500 CZK/night if not configured
- **Booking** — creates a `tentative` reservation in the PMS database, visible in the admin calendar
- **New houses** — when new unit types/units are added to the PMS, they automatically appear in the form
