# Team workflow

Internal notes for building and demoing RestStop at the hackathon. Setup steps are in the [README](../README.md#getting-started).

## Before you start

- **One person** creates the Supabase project, runs `schema.sql` and shares the keys **privately** (not in the repo or a public chat).
- **Everyone** clones the repo, creates `.venv`, installs requirements, creates `.env` and runs `python app.py`.
- **Never commit** `.env` or `.venv/`. Both are in `.gitignore`.

## Git routine

```bash
git checkout main && git pull
git checkout -b feature/<name>        # e.g. feature/voice-search
# ...work, commit small and often...
git push -u origin feature/<name>     # open a PR, or merge to main after a quick check
```

- Pull `main` every hour or so.
- Each person owns different files (below), which keeps merge conflicts rare.
- `static/css/style.css` is shared. Keep edits small and pull right before changing it.

## Who owns what (team of 4)

| Person | Owns | Tasks |
|---|---|---|
| **A: Backend** | `app.py`, `schema.sql`, `seed_osm.py` | Supabase setup, seed data around the venue, run the tunnel, fix API bugs |
| **B: Map** | `static/js/map.js`, `static/index.html` | Map polish, test filters and voice on a real Android phone |
| **C: Forms** | `static/js/add.js`, `static/add.html`, `static/dashboard.html` | Test add-place on a phone, add real places near the venue with photos |
| **D: Pitch** | `static/js/common.js` (text), slides | Check the Hindi text, pitch deck, demo script, backup video |

With 3 people, A also takes D's text and slides work.

## Build plan

| Time | Goal |
|---|---|
| 0:00–0:45 | Supabase project, run `schema.sql`, everyone runs the app locally |
| 0:45–1:30 | Seed OSM data around the venue, set `DEFAULT_CENTER`, test on a phone through the tunnel |
| 1:30–4:00 | Walk around the venue and add 10–15 real places with photos. Test verify, report and filters. Fix bugs. |
| 4:00–5:30 | Roadmap extras if time allows, UI polish |
| 5:30–6:30 | Pitch deck, record a backup demo video |
| 6:30–7:30 | Two full demo rehearsals on the real phone and projector |

## Demo checklist

- [ ] Venue area seeded, and `DEFAULT_CENTER` set to the venue
- [ ] At least 10 real places added with photos, some marked rider-friendly
- [ ] A few verifications done, so "Verified by N riders" shows
- [ ] `SUPABASE_ANON_KEY` set in `.env`, so live updates work
- [ ] Tunnel running, with the HTTPS link open on two phones
- [ ] Phone location permission allowed in Chrome
- [ ] Backup demo video recorded, in case the venue WiFi fails

## Demo script, about 3 minutes

1. **Hook (20 s):** "The person who delivered your dinner tonight has probably been riding for hours. Where do they use a toilet?"
2. **Problem (30 s):** Gig workers have nowhere to use a toilet, drink water or rest. It's hidden in plain sight.
3. **Live demo (90 s):**
   - Open the map on a phone. Nearby toilets and water points appear.
   - Tap **Toilet** and **Open now**, open a place, show "Verified by N riders" and tap **Navigate**.
   - Tap the microphone and say "पानी". The water filter turns on.
   - Toggle to **हिंदी**.
   - Add a place from a second phone. It appears live on the projected map.
   - Open **Impact** and show the live numbers.
4. **Scale (30 s):** delivery platforms, rider-friendly shops and city planners. See "Impact and scale" in the README.
5. **Close (10 s):** "RestStop: because the people who keep our cities running deserve a place to rest."

## If something breaks

| Problem | Fix |
|---|---|
| `SUPABASE_URL and SUPABASE_SERVICE_KEY must be set` | Create `.env` from `.env.example` and restart `app.py` |
| `function st_makepoint does not exist` | Enable **postgis** in Database → Extensions, then re-run `schema.sql` |
| The map never finds your location on a phone | Open the `https://` tunnel link, not `http://192.168…` |
| Port already in use | Set `PORT=8001` in `.env` |
| `seed_osm.py` fails | The Overpass servers are busy; wait a minute and run it again |
| SSL errors on a Mac | Use Python 3.12 from Homebrew, not the built-in Python 3.9 |
| No live updates | Set `SUPABASE_ANON_KEY` in `.env`, then make sure `schema.sql` ran fully (it adds `places` to Realtime) |
