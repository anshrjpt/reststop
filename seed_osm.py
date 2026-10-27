"""Seed RestStop with real public toilets, drinking water and fuel stations
from OpenStreetMap, around a point.

Usage:
  .venv/bin/python seed_osm.py --lat 19.0760 --lng 72.8777 --radius 5000
  .venv/bin/python seed_osm.py --lat 19.0760 --lng 72.8777 --dry-run

Run it once before the demo. Re-running is safe: rows are upserted on osm_id.
Only amenities that OSM actually tags are marked — riders verify the rest.
"""

import argparse
import sys
import time

import requests

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
HEADERS = {"User-Agent": "RestStop-hackathon-seed/1.0"}

DEFAULT_NAMES = {
    "toilets": "Public toilet",
    "drinking_water": "Drinking water",
    "fuel": "Fuel station",
}


def build_query(lat: float, lng: float, radius: int) -> str:
    around = f"(around:{radius},{lat},{lng})"
    return f"""
[out:json][timeout:90];
(
  nwr["amenity"="toilets"]{around};
  nwr["amenity"="drinking_water"]{around};
  nwr["amenity"="fuel"]{around};
);
out center tags;
"""


def fetch(query: str, attempts: int = 3) -> list:
    """Public Overpass servers are often busy (429/502/504), so retry with backoff."""
    last_err = None
    for attempt in range(1, attempts + 1):
        for url in OVERPASS_URLS:
            try:
                resp = requests.post(url, data={"data": query}, headers=HEADERS, timeout=100)
                resp.raise_for_status()
                return resp.json().get("elements", [])
            except (requests.RequestException, ValueError) as err:
                last_err = err
                print(f"  attempt {attempt}: {url} failed: {err}", file=sys.stderr)
        if attempt < attempts:
            wait = 10 * attempt
            print(f"  waiting {wait}s before retrying...", file=sys.stderr)
            time.sleep(wait)
    raise SystemExit(f"All Overpass servers failed (they are often busy — try again in a minute): {last_err}")


def hours(tags: dict):
    # Only the unambiguous case; anything else stays "unknown".
    if tags.get("opening_hours", "").strip() == "24/7":
        return "00:00", "23:59"
    return None, None


def to_place(el: dict):
    tags = el.get("tags", {})
    if tags.get("access") in ("private", "no", "customers"):
        return None

    if el["type"] == "node":
        lat, lng = el.get("lat"), el.get("lon")
    else:
        center = el.get("center") or {}
        lat, lng = center.get("lat"), center.get("lon")
    if lat is None or lng is None:
        return None

    amenity = tags.get("amenity")
    open_time, close_time = hours(tags)
    place = {
        "osm_id": f"{el['type']}/{el['id']}",
        "name": (tags.get("name") or tags.get("brand") or DEFAULT_NAMES.get(amenity, "Place"))[:120],
        "lat": lat,
        "lng": lng,
        "category": "fuel" if amenity == "fuel" else "public",
        "has_toilet": amenity == "toilets" or tags.get("toilets") == "yes",
        "has_water": amenity == "drinking_water" or tags.get("drinking_water") == "yes",
        "has_charging": False,
        "has_shade": tags.get("covered") == "yes",
        "women_safe": False,
        "rider_friendly": False,
        "open_time": open_time,
        "close_time": close_time,
        "source": "osm",
    }
    # Skip fuel stations with no tagged facility — they'd add noise to the map.
    if not (place["has_toilet"] or place["has_water"] or place["has_shade"]):
        return None
    return place


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lng", type=float, required=True)
    ap.add_argument("--radius", type=int, default=5000, help="metres (default 5000, max 20000)")
    ap.add_argument("--dry-run", action="store_true", help="print counts, write nothing")
    args = ap.parse_args()

    if not 100 <= args.radius <= 20000:
        raise SystemExit("--radius must be between 100 and 20000 metres")

    print(f"Fetching OSM data within {args.radius} m of {args.lat}, {args.lng} ...")
    elements = fetch(build_query(args.lat, args.lng, args.radius))
    places = [p for p in (to_place(el) for el in elements) if p]

    print(f"  {len(elements)} OSM elements → {len(places)} usable places")
    print(f"    toilets: {sum(p['has_toilet'] for p in places)}")
    print(f"    water:   {sum(p['has_water'] for p in places)}")

    if args.dry_run or not places:
        print("Nothing written." if args.dry_run else "No places found — try a larger --radius.")
        return

    # Imported here so --dry-run works without a configured .env.
    from app import db

    for i in range(0, len(places), 200):
        chunk = places[i : i + 200]
        db().table("places").upsert(chunk, on_conflict="osm_id").execute()
        print(f"  upserted {i + len(chunk)}/{len(places)}")
    print("Done.")


if __name__ == "__main__":
    main()
