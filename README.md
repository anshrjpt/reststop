<div align="center">

<img src="static/icons/icon-192.png" width="88" alt="RestStop logo">

# RestStop

**Toilets, drinking water, charging and shade for the people who deliver our cities.**

A crowdsourced, rider-verified map built for delivery and gig workers, in Hindi and English.

*Built for the **Hack the Unseen** hackathon.*

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.1-000000?logo=flask&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostGIS-3FCF8E?logo=supabase&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900?logo=leaflet&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?logo=pwa&logoColor=white)

</div>

![RestStop on desktop](docs/screenshots/desktop.png)

## The unseen problem

Delivery riders spend long hours on the road, and when they need a toilet, drinking water, a place to charge their phone or some shade, **there's often nowhere to go.** Many shops turn them away and public facilities are hard to find. Women riders face this most.

Everyone who orders food or a parcel depends on these workers, yet almost nobody thinks about where they rest. The problem hides in plain sight.

## The solution

RestStop is a map of places where riders are welcome:

1. **Find:** the nearest toilet, water point, charging point or shade, filtered for what's needed right now.
2. **Verify:** riders confirm a place still works, or flag that it's closed, so the map stays trustworthy.
3. **Welcome:** shop owners mark their shop as *rider-friendly* and open their doors.

It's seeded with real public toilets and water points from OpenStreetMap, so it's useful from the first day, and the community fills in the rest.

## Screenshots

<p align="center">
  <img src="docs/screenshots/mobile.png" alt="RestStop on mobile: map, place details and add place">
</p>

<p align="center"><em>Mobile: nearby map, place details with rider verification, and adding a new place</em></p>

<p align="center">
  <img src="docs/screenshots/impact.png" width="720" alt="RestStop impact dashboard">
</p>

<p align="center"><em>Live impact dashboard</em></p>

## Features

| | Feature | Details |
|---|---|---|
| 🗺️ | **Nearby map** | Places near the rider's live location, nearest first |
| 📍 | **Location search** | Search any area, landmark or address with suggestions as you type, then see or add places there |
| 🔍 | **Smart filters** | Toilet, water, charging, shade, women-safe, rider-friendly, open now |
| ✅ | **Rider verification** | "Verified by 12 riders, last checked 2 h ago" |
| ⚑ | **Problem reports** | Dirty, unsafe, wrong location, not allowed in |
| ➕ | **Add a place** | Pin on the map, facilities, hours and a photo (compressed on the phone) |
| ⭐ | **Rider-friendly shops** | Owners welcome riders and get a badge on the map |
| 🇮🇳 | **Hindi and English** | One-tap language switch across the whole app |
| 🎤 | **Voice search** | Say "पानी" or "toilet" while riding (Chrome) |
| 🛡️ | **Safety share** | Send your live location to someone on WhatsApp in one tap |
| 🧭 | **Navigate** | Opens Google Maps two-wheeler directions |
| ⚡ | **Live updates** | New places appear on every open map instantly |
| 📊 | **Impact dashboard** | Live totals of places, verifications and riders |
| 📱 | **Installable app** | Add to home screen, and the app shell loads offline |

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS and JavaScript, no framework or build step |
| Map | Leaflet 1.9.4 with OpenStreetMap tiles |
| Backend | Python 3 and Flask |
| Database | Supabase: Postgres with **PostGIS** for nearest-place queries |
| File storage | Supabase Storage (place photos) |
| Live updates | Supabase Realtime |
| Seed data | OpenStreetMap Overpass API |
| Voice | Web Speech API (`hi-IN`, `en-IN`) |

### Architecture

```
┌──────────────────────────┐      fetch /api/*       ┌───────────────────┐   supabase-py   ┌──────────────────────────┐
│  Phone / laptop browser  │ ──────────────────────► │   Flask (app.py)  │ ──────────────► │         Supabase         │
│  HTML · CSS · JS         │                         │   validation,     │                 │  Postgres + PostGIS      │
│  Leaflet map             │ ◄────────────────────── │   rate limiting,  │ ◄────────────── │  Storage (photos)        │
└────────────┬─────────────┘         JSON            │   photo uploads   │                 │  Realtime                │
             │                                       └───────────────────┘                 └────────────┬─────────────┘
             └────────────── Realtime subscription (read-only public key) ──────────────────────────────┘
```

**Security:** the secret service key lives only on the server in `.env`. The browser only receives the public anon key, and row-level security limits that key to *reading* places. All writes go through Flask, which validates every field, checks photo type and size, and rate-limits each rider.

## Getting started

### Prerequisites

- **Python 3.10+.** On macOS, run `brew install python@3.12`; the built-in Python 3.9 has an outdated SSL library.
- A free [Supabase](https://supabase.com) account.

### 1. Set up Supabase

1. Create a new project.
2. Open **SQL Editor**, paste the full contents of [`schema.sql`](schema.sql) and click **Run**. This creates the tables, PostGIS functions, security policies, Realtime publication and the `photos` storage bucket.
3. From **Project Settings → API**, copy the **Project URL**, the **anon** (publishable) key and the **service_role** (secret) key.

### 2. Install

```bash
git clone https://github.com/anshrjpt/reststop.git
cd reststop

python3.12 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env               # then fill in your Supabase values
```

### 3. Load real data

Import public toilets and water points from OpenStreetMap around any location:

```bash
# Example: 8 km around Connaught Place, New Delhi
python seed_osm.py --lat 28.6315 --lng 77.2167 --radius 8000 --dry-run                          # preview
python seed_osm.py --lat 28.6315 --lng 77.2167 --radius 8000 --cache osm_cache_delhi.json      # import
```

The public OpenStreetMap servers are often busy. The script retries across several mirrors, and `--cache` saves the download so a re-run doesn't fetch it again. Re-running is safe: existing places are updated, not duplicated.

The map opens on New Delhi by default. To change the area, set `DEFAULT_CENTER` at the top of [`static/js/common.js`](static/js/common.js).

### 4. Run

```bash
python app.py
```

Open **http://localhost:8000**.

### 5. Use it on a phone

Browsers only share location over HTTPS, so expose your local server through a tunnel:

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:8000
```

Open the printed `https://…trycloudflare.com` link on your phone.

## API reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/places` | Nearby places. Query: `lat`, `lng`, `radius` (m), `time` (HH:MM), and filters `toilet`, `water`, `charging`, `shade`, `women_safe`, `rider_friendly`, `open_now` (`=1`) |
| `GET` | `/api/places/<id>` | One place with verification counts |
| `POST` | `/api/places` | Add a place (multipart form, optional `photo` up to 5 MB) |
| `POST` | `/api/places/<id>/verify` | `{ "user_id", "status": "works" \| "closed" \| "denied" }` |
| `POST` | `/api/places/<id>/report` | `{ "user_id", "reason": "dirty" \| "unsafe" \| "wrong_location" \| "denied_access" \| "other" }` |
| `GET` | `/api/geocode?q=&lat=&lng=` | Location search (Photon, falling back to Nominatim), biased toward `lat`/`lng` |
| `GET` | `/api/stats` | Totals for the impact dashboard |
| `GET` | `/api/config` | Public Realtime configuration |

## Project structure

```
├── app.py               Flask API, also serves the frontend
├── schema.sql           Database: tables, PostGIS functions, security, storage
├── seed_osm.py          OpenStreetMap importer
├── requirements.txt
├── .env.example         Environment variable template
├── docs/
│   ├── TEAM.md          Team workflow, build plan and demo script
│   └── screenshots/
└── static/
    ├── index.html       Map, list and place details
    ├── add.html         Add a place
    ├── dashboard.html   Impact dashboard
    ├── css/style.css    Design system
    ├── js/
    │   ├── common.js    Language strings, API helper, rider ID
    │   ├── map.js       Map, filters, verification, voice, realtime
    │   ├── add.js       Add-place form and photo compression
    │   └── dashboard.js Impact stats
    ├── icons.svg        Icon set
    ├── manifest.json    Installable app manifest
    └── sw.js            Service worker
```

## Impact and scale

- **For riders:** less time searching, safer breaks, and a way for women riders to find women-safe places.
- **For shops:** the rider-friendly badge brings footfall and goodwill.
- **For delivery platforms:** the map could be built into rider apps as a welfare feature.
- **For cities:** where riders search and find nothing shows exactly where public toilets and water points are missing.

## Roadmap

- [ ] "Toilet desert" heatmap of areas with no facilities nearby, for city planners
- [ ] QR stickers for rider-friendly shops: scan to verify
- [ ] Phone-number login to strengthen verification trust
- [ ] Facilities along a delivery route, not just near a point
- [ ] More languages: Tamil, Telugu, Bengali, Marathi, Kannada

## Limitations

- Data quality depends on the community. Verification counts and reports are the trust signal.
- OpenStreetMap includes only tagged facilities. Riders add the rest, for example fuel stations whose toilets aren't tagged.
- Riders are identified by an anonymous ID stored on their device. A production version would add phone login.
- Voice search requires Chrome.

## Acknowledgements

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors · Maps by [Leaflet](https://leafletjs.com) · Backend by [Supabase](https://supabase.com) · Fonts: Inter and Noto Sans Devanagari
