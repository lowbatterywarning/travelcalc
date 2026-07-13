# Travel Allowance Calculator — Handoff

## Overview
Single-page web app for estimating US domestic trip costs: transportation (car/flight/taxi), lodging, and meals. Uses GSA FY2026 per-diem rates. Runs entirely client-side — no backend.

**Live at:** open `index.html` in any browser or serve statically.

## File Structure
```
travelcalc/
├── index.html      # DOM structure, CDN links (Leaflet, jsPDF, EmailJS)
├── app.js          # All logic: legs, validation, geocoding, per-diem, map, PDF, email
├── style.css       # Full styling, responsive breakpoint at 640px
└── per-diem.json   # GSA FY2026 rates: destinations, zip→dest lookup tables
```

## Key Architecture

### Leg System
- 4 transport types: `personal_car`, `rental_car`, `flight`, `taxi`
- Legs are cloned from `<template id="legTemplate">`, managed by `createLeg()`/`removeLeg()`
- Drag-and-drop reordering supported
- Receipt upload: stored as base64 data attributes (not persisted across sessions)

### Calculation Flow
1. `runCalculation()` → `validateForm()` → `loadPerDiemData()` → `doCalculation()`
2. Geocodes zip codes via **Nominatim** (1.1s delay between calls)
3. Routes via **OSRM** driving directions; falls back to **Haversine** straight-line if OSRM fails
4. Per-diem looked up by destination zip → `per-diem.json` (zip prefix + exact match)
5. **GSA 75% M&IE rule** applied: first and last travel day meals at 75%

### Per-Diem Data
- FY2026 (Oct 2025 – Sep 2026). Dates beyond Sep 30 2026 fall back to standard rates.
- `zipPrefixLookup` maps first 3 digits → destination ID
- `zipLookup` maps full 5-digit → destination ID (takes priority over prefix)

### Email
- Uses **EmailJS** free tier (no attachments, HTML body only)
- Credentials in `app.js` lines ~988–990:
  - Public Key: `G_plCuyI5GtqvIaCw`
  - Service ID: `service_3pg4h95`
  - Template ID: `template_jhibair`
- Template variables: `{{to_email}}`, `{{subject}}`, `{{{message}}}` (triple braces for HTML)

### PDF
- Generated client-side via **jsPDF** (`jspdf.umd.min.js`)
- Includes static map image from `openstreetmap.de` (unreliable — shows fallback text on failure)

## External Dependencies (CDN)
| Library | Version | Purpose |
|---------|---------|---------|
| Leaflet | 1.9.4 | Interactive route map |
| jsPDF | 2.5.1 | PDF generation |
| EmailJS | 4.x | Sending email reports |

## Known Caveats
1. **Nominatim rate limits** — rapid geocoding may trigger 429s. Delays (1.1s) help but aren't bulletproof.
2. **OSRM public router** — no SLA, may be slow or unavailable. Falls back to straight-line distance.
3. **Static map in PDF** — `openstreetmap.de` has no uptime guarantee.
4. **EmailJS free tier** — ~50KB payload limit. PDF attachment removed; HTML body only.
5. **No state persistence** — refreshing the page loses all data.
6. **US-only** — zips geocoded with `country=us`; per-diem data is CONUS only.

## Adding/Updating Per-Diem Data
Edit `per-diem.json`:
- `fiscalYear`: update for new FY
- `standardLodging` / `standardMeals`: base rates
- `destinations`: keyed by string ID, each with `name`, `state`, `rates` (12-month array Oct–Sep), `meals`
- `zipPrefixLookup`: `"3-digit-prefix": "destId"`
- `zipLookup`: `"5-digit-zip": "destId"`

## Bug Fixes Applied (July 2026)
- Rate-per-mile NaN validation
- FY year boundary guard (dates past Sep 2026)
- Nominatim delay on all zip lookups (not just toZip)
- `formatCurrency` / `formatDistance` null/NaN guards
- Email concurrent-send guard (`emailSending` flag)
- Per-diem load-before-calculate race fix
- 75% M&IE on first/last travel day
- `escapeHtml` performance (regex vs DOM)
- Map resize via `requestAnimationFrame` (was `setTimeout 100ms`)
- `doCalculation` now returns its promise chain
- `resetAll` resets `emailSending`
- Summary grid CSS uses `border-top` for consistent odd/even row borders
- PDF map failure shows `"(Route map unavailable)"` text
