"""RestStop backend: Flask API in front of Supabase.

Run:  .venv/bin/python app.py   →  http://localhost:8000
"""

import os
import re
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Optional

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from supabase import Client, create_client
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

load_dotenv()

# Accept the URL with or without the /rest/v1 suffix people often copy from the dashboard.
SUPABASE_URL = re.sub(r"(/rest/v1)?/*$", "", os.getenv("SUPABASE_URL", "").strip())
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()
PORT = int(os.getenv("PORT", "8000"))

PHOTO_BUCKET = "photos"
MAX_PHOTO_BYTES = 5 * 1024 * 1024
ALLOWED_PHOTO_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

CATEGORIES = {"shop", "fuel", "public", "restaurant", "other"}
AMENITIES = ["has_toilet", "has_water", "has_charging", "has_shade", "women_safe"]
NEAREST_SEARCH_M = 50000  # how far to look for "nearest place" when the area is empty
VERIFY_STATUSES = {"works", "closed", "denied"}
REPORT_REASONS = {"dirty", "unsafe", "wrong_location", "denied_access", "other"}

# Query-string filter name → column
FILTERS = {
    "toilet": "has_toilet",
    "water": "has_water",
    "charging": "has_charging",
    "shade": "has_shade",
    "women_safe": "women_safe",
    "rider_friendly": "rider_friendly",
}

TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$")
USER_ID_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")

app = Flask(__name__, static_folder="static", static_url_path="")
# Behind a hosting proxy (Render, tunnels), read the visitor's real IP for rate limits.
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
# Slightly above the photo limit so form fields fit too.
app.config["MAX_CONTENT_LENGTH"] = MAX_PHOTO_BYTES + 512 * 1024

_supabase: Optional[Client] = None


def db() -> Client:
    global _supabase
    if _supabase is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env "
                "(see .env.example)"
            )
        _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _supabase


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


class BadRequest(Exception):
    pass


@app.errorhandler(BadRequest)
def handle_bad_request(err):
    return jsonify(error=str(err)), 400


@app.errorhandler(413)
def handle_too_large(_err):
    return jsonify(error="Photo is too large (max 5 MB)"), 413


@app.errorhandler(Exception)
def handle_unexpected(err):
    # Let Flask's own 404/405/etc. through unchanged.
    if isinstance(err, HTTPException):
        return err
    app.logger.exception("Server error")
    return jsonify(error=f"Server error: {err}"), 500


def parse_float(value, name, lo, hi) -> float:
    try:
        f = float(value)
    except (TypeError, ValueError):
        raise BadRequest(f"'{name}' must be a number")
    if not lo <= f <= hi:
        raise BadRequest(f"'{name}' must be between {lo} and {hi}")
    return f


def parse_time(value, name) -> Optional[str]:
    if value in (None, ""):
        return None
    if not TIME_RE.match(value):
        raise BadRequest(f"'{name}' must be HH:MM")
    return value


def parse_user_id(value) -> str:
    if not value or not USER_ID_RE.match(value):
        raise BadRequest("Missing or invalid user_id")
    return value


def truthy(value) -> bool:
    return str(value).lower() in ("1", "true", "on", "yes")


def to_minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")[:2]
    return int(h) * 60 + int(m)


def open_status(place: dict, now_hhmm: Optional[str]) -> str:
    """'open', 'closed' or 'unknown'. Handles overnight hours like 22:00–06:00."""
    if not now_hhmm or not place.get("open_time") or not place.get("close_time"):
        return "unknown"
    now = to_minutes(now_hhmm)
    o, c = to_minutes(place["open_time"]), to_minutes(place["close_time"])
    if o <= c:
        is_open = o <= now <= c
    else:
        is_open = now >= o or now <= c
    return "open" if is_open else "closed"


class RateLimiter:
    """In-memory sliding window. Good enough for a single-server demo."""

    def __init__(self, limit: int, window_s: int):
        self.limit, self.window_s = limit, window_s
        self.hits = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.time()
        q = self.hits[key]
        while q and now - q[0] > self.window_s:
            q.popleft()
        if len(q) >= self.limit:
            return False
        q.append(now)
        return True


add_limiter = RateLimiter(limit=15, window_s=3600)
action_limiter = RateLimiter(limit=60, window_s=3600)
geocode_limiter = RateLimiter(limit=60, window_s=60)


def client_key(user_id: str) -> str:
    return f"{user_id}|{request.remote_addr}"


# ------------------------------------------------------------------
# Pages
# ------------------------------------------------------------------


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/sw.js")
def service_worker():
    # Served from the root so it can control the whole app.
    resp = send_from_directory(app.static_folder, "sw.js")
    resp.headers["Cache-Control"] = "no-cache"
    return resp


# ------------------------------------------------------------------
# API
# ------------------------------------------------------------------


@app.get("/api/config")
def config():
    """Public values only. The anon key is designed to be public (RLS protects data)."""
    return jsonify(
        supabase_url=SUPABASE_URL if SUPABASE_ANON_KEY else None,
        supabase_anon_key=SUPABASE_ANON_KEY or None,
    )


@app.get("/api/places")
def list_places():
    lat = parse_float(request.args.get("lat"), "lat", -90, 90)
    lng = parse_float(request.args.get("lng"), "lng", -180, 180)
    radius = parse_float(request.args.get("radius", 3000), "radius", 100, 25000)
    now_hhmm = parse_time(request.args.get("time"), "time")

    rows = (
        db()
        .rpc(
            "nearby_places",
            {"user_lat": lat, "user_lng": lng, "radius_m": radius, "max_results": 300},
        )
        .execute()
        .data
        or []
    )

    wanted = [col for key, col in FILTERS.items() if truthy(request.args.get(key))]
    open_now = truthy(request.args.get("open_now"))

    def matches(p) -> bool:
        if any(not p.get(col) for col in wanted):
            return False
        p["open_status"] = open_status(p, now_hhmm)
        return not (open_now and p["open_status"] != "open")

    places = [p for p in rows if matches(p)]

    # Nothing here: point the rider at the nearest matching place instead of an empty map.
    nearest = None
    if not places:
        wider = (
            db()
            .rpc(
                "nearby_places",
                {"user_lat": lat, "user_lng": lng, "radius_m": NEAREST_SEARCH_M, "max_results": 300},
            )
            .execute()
            .data
            or []
        )
        hit = next((p for p in wider if matches(p)), None)
        if hit:
            nearest = {k: hit[k] for k in ("id", "name", "lat", "lng", "distance_m")}

    return jsonify(places=places, count=len(places), nearest=nearest)


@app.get("/api/places/<int:place_id>")
def get_place(place_id: int):
    rows = db().table("places").select("*").eq("id", place_id).limit(1).execute().data
    if not rows:
        return jsonify(error="Place not found"), 404
    place = rows[0]

    verifs = (
        db()
        .table("verifications")
        .select("status, created_at")
        .eq("place_id", place_id)
        .execute()
        .data
        or []
    )
    place["works_count"] = sum(1 for v in verifs if v["status"] == "works")
    place["closed_count"] = sum(1 for v in verifs if v["status"] in ("closed", "denied"))
    place["last_verified"] = max((v["created_at"] for v in verifs), default=None)
    place["open_status"] = open_status(place, parse_time(request.args.get("time"), "time"))
    return jsonify(place=place)


@app.post("/api/places")
def add_place():
    f = request.form
    user_id = parse_user_id(f.get("user_id"))
    if not add_limiter.allow(client_key(user_id)):
        return jsonify(error="Too many places added. Try again later."), 429

    name = (f.get("name") or "").strip()
    if not 1 <= len(name) <= 120:
        raise BadRequest("Name is required (max 120 characters)")

    category = f.get("category", "other")
    if category not in CATEGORIES:
        raise BadRequest("Invalid category")

    place = {
        "name": name,
        "lat": parse_float(f.get("lat"), "lat", -90, 90),
        "lng": parse_float(f.get("lng"), "lng", -180, 180),
        "category": category,
        "open_time": parse_time(f.get("open_time"), "open_time"),
        "close_time": parse_time(f.get("close_time"), "close_time"),
        "rider_friendly": truthy(f.get("rider_friendly")),
        "source": "user",
        "created_by": user_id,
    }
    for col in AMENITIES:
        place[col] = truthy(f.get(col))

    if not any(place[col] for col in ("has_toilet", "has_water", "has_charging", "has_shade")):
        raise BadRequest("Select at least one facility (toilet, water, charging or shade)")
    if bool(place["open_time"]) != bool(place["close_time"]):
        raise BadRequest("Give both opening and closing time, or leave both empty")

    photo = request.files.get("photo")
    if photo and photo.filename:
        ext = ALLOWED_PHOTO_TYPES.get(photo.mimetype)
        if not ext:
            raise BadRequest("Photo must be JPEG, PNG or WebP")
        data = photo.read()
        if len(data) > MAX_PHOTO_BYTES:
            raise BadRequest("Photo is too large (max 5 MB)")
        path = f"places/{uuid.uuid4().hex}.{ext}"
        db().storage.from_(PHOTO_BUCKET).upload(
            path, data, {"content-type": photo.mimetype}
        )
        place["photo_url"] = db().storage.from_(PHOTO_BUCKET).get_public_url(path)

    created = db().table("places").insert(place).execute().data
    return jsonify(place=created[0]), 201


@app.post("/api/places/<int:place_id>/verify")
def verify_place(place_id: int):
    body = request.get_json(silent=True) or {}
    user_id = parse_user_id(body.get("user_id"))
    status = body.get("status")
    if status not in VERIFY_STATUSES:
        raise BadRequest("status must be one of: works, closed, denied")
    if not action_limiter.allow(client_key(user_id)):
        return jsonify(error="Too many actions. Try again later."), 429

    if not db().table("places").select("id").eq("id", place_id).execute().data:
        return jsonify(error="Place not found"), 404

    db().table("verifications").upsert(
        {
            "place_id": place_id,
            "user_id": user_id,
            "status": status,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="place_id,user_id",
    ).execute()
    return jsonify(ok=True)


@app.post("/api/places/<int:place_id>/report")
def report_place(place_id: int):
    body = request.get_json(silent=True) or {}
    user_id = parse_user_id(body.get("user_id"))
    reason = body.get("reason")
    if reason not in REPORT_REASONS:
        raise BadRequest("Invalid reason")
    note = (body.get("note") or "").strip()[:500] or None
    if not action_limiter.allow(client_key(user_id)):
        return jsonify(error="Too many actions. Try again later."), 429

    if not db().table("places").select("id").eq("id", place_id).execute().data:
        return jsonify(error="Place not found"), 404

    db().table("reports").insert(
        {"place_id": place_id, "user_id": user_id, "reason": reason, "note": note}
    ).execute()
    return jsonify(ok=True), 201


# ------------------------------------------------------------------
# Location search
# Photon (OSM-based, allows search-as-you-type); Nominatim as fallback.
# Proxied so we can send a proper User-Agent and cache repeat queries.
# ------------------------------------------------------------------

GEOCODE_HEADERS = {"User-Agent": "RestStop/1.0 (hackathon project; https://github.com/anshrjpt/reststop)"}
GEOCODE_CACHE: dict = {}
GEOCODE_CACHE_MAX = 500


def _join_unique(parts, skip=None):
    out = []
    for p in parts:
        if p and p != skip and p not in out:
            out.append(p)
    return ", ".join(out)


def photon_search(q: str, lat: Optional[float], lng: Optional[float]) -> list:
    params = {"q": q, "limit": 6}
    if lat is not None and lng is not None:
        params.update(lat=lat, lon=lng)
    resp = requests.get("https://photon.komoot.io/api/", params=params, headers=GEOCODE_HEADERS, timeout=6)
    resp.raise_for_status()
    results = []
    for f in resp.json().get("features", []):
        coords = (f.get("geometry") or {}).get("coordinates") or []
        if len(coords) != 2:
            continue
        p = f.get("properties", {})
        street = " ".join(x for x in (p.get("housenumber"), p.get("street")) if x)
        name = p.get("name") or street or p.get("city") or p.get("state")
        if not name:
            continue
        results.append({
            "name": name,
            "address": _join_unique(
                [street, p.get("locality"), p.get("district"), p.get("city"), p.get("state"), p.get("country")],
                skip=name,
            ),
            "lat": coords[1],
            "lng": coords[0],
            # A named point of interest (shop, toilet, station...) rather than a street or area.
            "is_poi": bool(p.get("name")) and p.get("osm_key") not in ("place", "highway", "boundary"),
        })
    return results


def nominatim_search(q: str) -> list:
    params = {"q": q, "format": "jsonv2", "limit": 6, "countrycodes": "in", "addressdetails": 0}
    resp = requests.get(
        "https://nominatim.openstreetmap.org/search", params=params, headers=GEOCODE_HEADERS, timeout=6
    )
    resp.raise_for_status()
    results = []
    for r in resp.json():
        display = r.get("display_name", "")
        name = r.get("name") or display.split(",")[0]
        results.append({
            "name": name,
            "address": _join_unique([s.strip() for s in display.split(",")], skip=name),
            "lat": float(r["lat"]),
            "lng": float(r["lon"]),
            "is_poi": r.get("category") not in ("place", "highway", "boundary"),
        })
    return results


@app.get("/api/geocode")
def geocode():
    q = " ".join((request.args.get("q") or "").split())
    if len(q) < 2:
        return jsonify(results=[])
    if len(q) > 120:
        raise BadRequest("Search text is too long")
    lat = request.args.get("lat")
    lng = request.args.get("lng")
    lat = parse_float(lat, "lat", -90, 90) if lat else None
    lng = parse_float(lng, "lng", -180, 180) if lng else None

    # Round the bias so nearby users share cache entries.
    key = (q.lower(), round(lat, 1) if lat is not None else None, round(lng, 1) if lng is not None else None)
    if key in GEOCODE_CACHE:
        return jsonify(results=GEOCODE_CACHE[key])

    if not geocode_limiter.allow(request.remote_addr or "?"):
        return jsonify(error="Too many searches. Wait a moment."), 429

    results = []
    try:
        results = photon_search(q, lat, lng)
    except (requests.RequestException, ValueError) as err:
        app.logger.warning("Photon failed: %s", err)
    if not results:
        try:
            results = nominatim_search(q)
        except (requests.RequestException, ValueError) as err:
            app.logger.warning("Nominatim failed: %s", err)
            return jsonify(error="Search is unavailable right now. Try again."), 502

    if len(GEOCODE_CACHE) >= GEOCODE_CACHE_MAX:
        GEOCODE_CACHE.pop(next(iter(GEOCODE_CACHE)))
    GEOCODE_CACHE[key] = results
    return jsonify(results=results)


@app.get("/api/stats")
def stats():
    return jsonify(stats=db().rpc("reststop_stats").execute().data)


if __name__ == "__main__":
    print(f"RestStop running on http://localhost:{PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=True)
