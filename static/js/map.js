// Map page: nearby places, filters, list + detail panel, verify/report, voice, share, realtime.

(() => {
  const MIN_ZOOM_FOR_PLACES = 12;
  const MAX_RADIUS_M = 25000;
  const MAX_LIST_ITEMS = 60;

  const AMENITIES = [
    ["has_toilet", "wc", "f_toilet", "toilet"],
    ["has_water", "drop", "f_water", "water"],
    ["has_charging", "zap", "f_charging", "charging"],
    ["has_shade", "tree", "f_shade", "shade"],
    ["women_safe", "shield", "f_women_safe"],
  ];

  const params = new URLSearchParams(location.search);
  const focusId = Number(params.get("place")) || null;
  const focusLat = parseFloat(params.get("lat"));
  const focusLng = parseFloat(params.get("lng"));
  const hasFocus = !isNaN(focusLat) && !isNaN(focusLng);

  const map = L.map("map", { zoomControl: false }).setView(
    hasFocus ? [focusLat, focusLng] : RS.DEFAULT_CENTER,
    hasFocus ? 17 : RS.DEFAULT_ZOOM
  );
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  L.control.zoom({ position: "topright" }).addTo(map);

  const markersLayer = L.layerGroup().addTo(map);
  const placesById = new Map();
  const filters = new Set();
  let order = []; // ids in list order
  let userLatLng = null;
  let userMarker = null;
  let openPlaceId = null;
  let pendingFocus = focusId;
  let loadSeq = 0;
  let loading = false;
  let lastNearest = null; // nearest matching place when the visible area is empty
  let revealIfEmpty = false; // open the sheet if the next load comes back empty
  let searchLatLng = null; // set while a searched location is shown
  let searchMarker = null;
  let searchBox = null;

  // ---------------- DOM helpers ----------------

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text; // never innerHTML: names are user-provided
    return e;
  }

  function icon(name, cls) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "i" + (cls ? " " + cls : ""));
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(ns, "use");
    use.setAttribute("href", "/icons.svg#" + name);
    svg.appendChild(use);
    return svg;
  }

  function button(cls, iconName, label, onClick) {
    const b = el("button", cls);
    b.type = "button";
    if (iconName) b.appendChild(icon(iconName));
    b.appendChild(el("span", null, label));
    b.addEventListener("click", onClick);
    return b;
  }

  // ---------------- Place helpers ----------------

  function primaryIcon(p) {
    // Prefer a facility the rider is filtering for, so a water search shows water drops.
    for (const [col, name, , filter] of AMENITIES) if (p[col] && filters.has(filter)) return name;
    for (const [col, name] of AMENITIES) if (p[col]) return name;
    return "pin";
  }

  function isDoubtful(p) {
    return (p.closed_count || 0) > (p.works_count || 0);
  }

  function distanceTo(p) {
    // From the rider, not the map centre (that would be misleading).
    return userLatLng ? map.distance(userLatLng, [p.lat, p.lng]) : null;
  }

  function statusPill(p) {
    const s = p.open_status || "unknown";
    return el("span", "status status-" + s, RS.t("status_" + s));
  }

  // ---------------- Markers ----------------

  function markerIcon(p) {
    const classes = ["pin"];
    if (p.rider_friendly) classes.push("pin-friendly");
    if (p.open_status === "closed" || isDoubtful(p)) classes.push("pin-muted");
    if (p.id === openPlaceId) classes.push("pin-selected");
    return L.divIcon({
      className: "pin-wrap",
      html:
        '<div class="' + classes.join(" ") + '"><svg class="i"><use href="/icons.svg#' +
        primaryIcon(p) + '"/></svg></div>',
      iconSize: [36, 44],
      iconAnchor: [18, 44],
    });
  }

  function renderMarkers() {
    markersLayer.clearLayers();
    placesById.forEach((p) => {
      L.marker([p.lat, p.lng], {
        icon: markerIcon(p),
        title: p.name,
        zIndexOffset: p.id === openPlaceId ? 1000 : 0,
      })
        .on("click", () => openDetail(p.id, false))
        .addTo(markersLayer);
    });
  }

  // ---------------- Sheet (mobile) ----------------

  const sheet = document.getElementById("sheet");
  const handle = document.getElementById("sheet-handle");
  const listView = document.getElementById("list-view");
  const detailView = document.getElementById("detail-view");
  const detailBody = document.getElementById("detail-body");

  function setExpanded(expanded) {
    sheet.classList.toggle("expanded", expanded);
    handle.setAttribute("aria-expanded", String(expanded));
  }
  handle.addEventListener("click", () => setExpanded(!sheet.classList.contains("expanded")));

  // ---------------- List ----------------

  function updateSummary() {
    const summary = document.getElementById("results-summary");
    if (map.getZoom() < MIN_ZOOM_FOR_PLACES) summary.textContent = RS.t("zoom_in");
    else if (loading && !placesById.size) summary.textContent = RS.t("loading");
    else if (!placesById.size) summary.textContent = RS.t("none_here");
    else summary.textContent = RS.t("places_found", { n: placesById.size });
  }

  function renderList() {
    const list = document.getElementById("place-list");
    list.replaceChildren();

    const items = Array.from(placesById.values());
    // Nearest to the searched spot when there is one, otherwise to the rider.
    const origin = searchLatLng || userLatLng;
    if (origin) items.sort((a, b) => map.distance(origin, [a.lat, a.lng]) - map.distance(origin, [b.lat, b.lng]));
    order = items.map((p) => p.id);

    items.slice(0, MAX_LIST_ITEMS).forEach((p) => {
      const li = el("li");
      const row = el("button", "place-row" + (isDoubtful(p) ? " is-muted" : ""));
      row.type = "button";

      const badge = el("span", "place-icon" + (p.rider_friendly ? " is-friendly" : ""));
      badge.appendChild(icon(primaryIcon(p)));
      row.appendChild(badge);

      const main = el("span", "place-main");
      const title = el("span", "place-name", p.name);
      if (p.rider_friendly) title.appendChild(icon("star", "star-inline"));
      main.appendChild(title);

      const meta = el("span", "place-meta");
      const amen = el("span", "mini-amenities");
      AMENITIES.forEach(([col, name, key]) => {
        if (!p[col]) return;
        const a = icon(name);
        a.setAttribute("aria-label", RS.t(key));
        amen.appendChild(a);
      });
      meta.appendChild(amen);
      meta.appendChild(statusPill(p));
      if (p.works_count) {
        const v = el("span", "verified");
        v.appendChild(icon("check"));
        v.appendChild(document.createTextNode(String(p.works_count)));
        meta.appendChild(v);
      }
      main.appendChild(meta);
      row.appendChild(main);

      const d = distanceTo(p);
      row.appendChild(el("span", "place-dist", d != null ? RS.formatDistance(d) : ""));

      row.addEventListener("click", () => openDetail(p.id, true));
      li.appendChild(row);
      list.appendChild(li);
    });

    renderEmpty(items.length === 0 && map.getZoom() >= MIN_ZOOM_FOR_PLACES && !loading);
    updateSummary();
  }

  function renderEmpty(show) {
    const box = document.getElementById("list-empty");
    box.hidden = !show;
    if (!show) return;
    box.replaceChildren();
    box.appendChild(icon("pin", "empty-icon"));
    box.appendChild(el("p", "empty-title", RS.t("none_here")));
    box.appendChild(el("p", "empty-text", RS.t("no_places_here")));

    const actions = el("div", "empty-actions");
    if (lastNearest) {
      const n = lastNearest;
      actions.appendChild(button("btn btn-primary btn-block", "nav",
        RS.t("nearest_btn", { d: RS.formatDistance(n.distance_m) }), () => {
          pendingFocus = n.id; // opened once places around it load
          map.setView([n.lat, n.lng], 16);
        }));
    }
    actions.appendChild(button("btn btn-ghost btn-block", "plus", RS.t("add_first"), () => {
      location.href = addPageUrl(searchLatLng || userLatLng || map.getCenter());
    }));
    box.appendChild(actions);
  }

  // ---------------- Loading ----------------

  function buildQuery() {
    const center = map.getCenter();
    const radius = Math.min(MAX_RADIUS_M, Math.max(500, map.distance(center, map.getBounds().getNorthEast())));
    const q = new URLSearchParams({
      lat: center.lat.toFixed(6),
      lng: center.lng.toFixed(6),
      radius: Math.round(radius),
      time: RS.nowHHMM(),
    });
    filters.forEach((f) => q.set(f, "1"));
    return q;
  }

  async function loadPlaces() {
    if (map.getZoom() < MIN_ZOOM_FOR_PLACES) {
      placesById.clear();
      renderMarkers();
      renderList();
      return;
    }
    const seq = ++loadSeq;
    loading = true;
    updateSummary();
    try {
      const data = await RS.api("/api/places?" + buildQuery());
      if (seq !== loadSeq) return; // a newer request finished first
      placesById.clear();
      data.places.forEach((p) => placesById.set(p.id, p));
      lastNearest = data.nearest || null;
      loading = false;
      renderMarkers();
      renderList();
      if (revealIfEmpty && !data.places.length && !openPlaceId) setExpanded(true);
      revealIfEmpty = false;
      if (pendingFocus) {
        const id = pendingFocus;
        pendingFocus = null;
        openDetail(id, false);
      } else if (openPlaceId && placesById.has(openPlaceId)) {
        renderDetail(placesById.get(openPlaceId));
      }
    } catch (err) {
      RS.toast(RS.t("error", { msg: err.message }), 5000);
    } finally {
      if (seq === loadSeq) {
        loading = false;
        updateSummary();
      }
    }
  }

  let moveTimer = null;
  map.on("moveend", () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(loadPlaces, 350);
  });

  // ---------------- Filters ----------------

  function setChip(f, on) {
    on ? filters.add(f) : filters.delete(f);
    const chip = document.querySelector('.chip[data-filter="' + f + '"]');
    if (chip) {
      chip.classList.toggle("active", on);
      chip.setAttribute("aria-pressed", String(on));
    }
  }

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      setChip(chip.dataset.filter, !filters.has(chip.dataset.filter));
      loadPlaces();
    });
  });

  // ---------------- Detail ----------------

  async function openDetail(id, pan) {
    openPlaceId = id;
    const cached = placesById.get(id);
    if (cached) {
      renderDetail(cached);
      renderMarkers();
      if (pan) map.panTo([cached.lat, cached.lng]);
    }
    try {
      // Fresh counts (and works for places outside the loaded area).
      const data = await RS.api("/api/places/" + id + "?time=" + RS.nowHHMM());
      if (openPlaceId !== id) return;
      const merged = Object.assign({}, cached || {}, data.place);
      if (cached) placesById.set(id, merged);
      renderDetail(merged);
    } catch (err) {
      if (!cached) RS.toast(RS.t("error", { msg: err.message }));
    }
  }

  function closeDetail() {
    openPlaceId = null;
    detailView.hidden = true;
    listView.hidden = false;
    sheet.classList.remove("has-detail");
    setExpanded(false);
    renderMarkers();
  }
  document.getElementById("detail-back").addEventListener("click", closeDetail);
  map.on("click", () => {
    if (openPlaceId) closeDetail();
    else setExpanded(false);
  });

  function renderDetail(p) {
    detailBody.replaceChildren();

    if (p.photo_url) {
      const img = el("img", "detail-photo");
      img.src = p.photo_url;
      img.alt = p.name;
      img.loading = "lazy";
      detailBody.appendChild(img);
    }

    const head = el("div", "detail-head");
    head.appendChild(el("h2", null, p.name));
    const meta = el("div", "detail-meta");
    meta.appendChild(statusPill(p));
    const d = distanceTo(p);
    if (d != null) meta.appendChild(el("span", null, RS.t("away", { d: RS.formatDistance(d) })));
    if (p.category) meta.appendChild(el("span", null, RS.t("c_" + p.category)));
    head.appendChild(meta);
    detailBody.appendChild(head);

    if (p.rider_friendly) {
      const b = el("div", "callout callout-brand");
      b.appendChild(icon("star"));
      b.appendChild(el("span", null, RS.t("rider_friendly_badge")));
      detailBody.appendChild(b);
    }

    const amen = el("div", "amenity-grid");
    AMENITIES.forEach(([col, name, key]) => {
      const item = el("div", "amenity" + (p[col] ? " is-on" : ""));
      item.appendChild(icon(name));
      item.appendChild(el("span", null, RS.t(key)));
      amen.appendChild(item);
    });
    detailBody.appendChild(amen);

    const works = p.works_count || 0;
    const closedN = p.closed_count || 0;
    const trust = el("div", "trust");
    const trustLine = (cls, iconName, text) => {
      const row = el("p", cls);
      row.appendChild(icon(iconName));
      row.appendChild(el("span", null, text));
      trust.appendChild(row);
    };
    if (works) trustLine("trust-good", "check", works === 1 ? RS.t("verified_by_one") : RS.t("verified_by", { n: works }));
    if (closedN) trustLine("trust-bad", "alert", RS.t("closed_reports", { n: closedN }));
    if (p.report_count) trustLine("trust-bad", "flag", RS.t("reports_count", { n: p.report_count }));
    if (!works && !closedN) trustLine("trust-muted", "users", RS.t("not_verified"));
    const foot = [];
    if (p.last_verified) foot.push(RS.t("last_checked", { t: RS.timeAgo(p.last_verified) }));
    if (p.source === "osm") foot.push(RS.t("from_osm"));
    if (foot.length) trust.appendChild(el("p", "trust-foot", foot.join(" · ")));
    detailBody.appendChild(trust);

    const nav = el("a", "btn btn-primary btn-block btn-lg");
    nav.href = "https://www.google.com/maps/dir/?api=1&destination=" + p.lat + "," + p.lng + "&travelmode=two-wheeler";
    nav.target = "_blank";
    nav.rel = "noopener";
    nav.appendChild(icon("nav"));
    nav.appendChild(el("span", null, RS.t("navigate")));
    detailBody.appendChild(nav);

    detailBody.appendChild(el("p", "section-label", RS.t("are_you_here")));
    const row = el("div", "btn-row");
    row.appendChild(button("btn btn-good", "check", RS.t("still_works"), () => verify(p.id, "works")));
    row.appendChild(button("btn btn-bad", "x", RS.t("closed"), () => verify(p.id, "closed")));
    row.appendChild(button("btn btn-ghost", "flag", RS.t("report"), () => showReport(p.id)));
    detailBody.appendChild(row);

    listView.hidden = true;
    detailView.hidden = false;
    sheet.classList.add("has-detail");
    setExpanded(true);
  }

  async function verify(id, status) {
    try {
      await RS.postJSON("/api/places/" + id + "/verify", { user_id: RS.userId(), status });
      RS.toast(RS.t("thanks"));
      await openDetail(id, false);
      loadPlaces(); // refresh marker + list styling
    } catch (err) {
      RS.toast(RS.t("error", { msg: err.message }));
    }
  }

  function showReport(id) {
    detailBody.replaceChildren();
    detailBody.appendChild(el("h2", "report-title", RS.t("report_why")));
    const list = el("div", "report-list");
    ["dirty", "unsafe", "wrong_location", "denied_access", "other"].forEach((reason) => {
      list.appendChild(button("btn btn-ghost btn-block btn-left", null, RS.t("r_" + reason), async () => {
        try {
          await RS.postJSON("/api/places/" + id + "/report", { user_id: RS.userId(), reason });
          RS.toast(RS.t("thanks"));
          openDetail(id, false);
        } catch (err) {
          RS.toast(RS.t("error", { msg: err.message }));
        }
      }));
    });
    list.appendChild(button("btn btn-link btn-block", null, RS.t("cancel"), () => openDetail(id, false)));
    detailBody.appendChild(list);
  }

  document.addEventListener("rs:lang", () => {
    renderList();
    if (openPlaceId && placesById.has(openPlaceId)) renderDetail(placesById.get(openPlaceId));
  });

  // ---------------- Location ----------------

  function locate(recenter) {
    return new Promise((resolve) => {
      if (!window.isSecureContext) {
        RS.toast(RS.t("loc_insecure"), 6000);
        return resolve(null);
      }
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          userLatLng = L.latLng(pos.coords.latitude, pos.coords.longitude);
          if (!userMarker) {
            userMarker = L.marker(userLatLng, {
              icon: L.divIcon({ className: "me-wrap", html: '<div class="me-dot"></div>', iconSize: [22, 22] }),
              interactive: false,
              zIndexOffset: 2000,
            }).addTo(map);
          } else {
            userMarker.setLatLng(userLatLng);
          }
          if (recenter) {
            revealIfEmpty = true; // explain an empty area instead of showing a blank map
            map.setView(userLatLng, Math.max(map.getZoom(), 15));
          }
          renderList();
          resolve(userLatLng);
        },
        () => {
          RS.toast(RS.t("loc_denied"), 4000);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    });
  }

  document.getElementById("locate-btn").addEventListener("click", () => {
    clearSearch();
    if (searchBox) searchBox.clear();
    RS.toast(RS.t("loc_finding"));
    locate(true);
  });

  document.getElementById("share-btn").addEventListener("click", async () => {
    const here = userLatLng || (await locate(false));
    if (!here) return;
    const url = "https://www.google.com/maps?q=" + here.lat.toFixed(6) + "," + here.lng.toFixed(6);
    window.open("https://wa.me/?text=" + encodeURIComponent(RS.t("share_msg", { url })), "_blank", "noopener");
  });

  function addPageUrl(ll) {
    return "/add.html?lat=" + ll.lat.toFixed(6) + "&lng=" + ll.lng.toFixed(6);
  }

  // Start the Add page's pin at the searched spot, else the rider, else the map centre.
  document.getElementById("add-link").addEventListener("click", (e) => {
    e.currentTarget.href = addPageUrl(searchLatLng || userLatLng || map.getCenter());
  });

  // ---------------- Location search ----------------

  function clearSearch() {
    searchLatLng = null;
    if (searchMarker) {
      map.removeLayer(searchMarker);
      searchMarker = null;
    }
    renderList();
  }

  function showSearchResult(r) {
    if (openPlaceId) closeDetail();
    clearSearch();
    searchLatLng = L.latLng(r.lat, r.lng);

    const popup = el("div", "search-popup");
    popup.appendChild(el("strong", null, r.name));
    if (r.address) popup.appendChild(el("span", null, r.address));
    const add = el("a", "btn btn-primary btn-block");
    add.href = addPageUrl(searchLatLng);
    add.appendChild(icon("plus"));
    add.appendChild(el("span", null, RS.t("add_here")));
    popup.appendChild(add);

    searchMarker = L.marker(searchLatLng, {
      icon: L.divIcon({
        className: "pin-wrap",
        html: '<div class="pin pin-search"><svg class="i"><use href="/icons.svg#search"/></svg></div>',
        iconSize: [36, 44],
        iconAnchor: [18, 44],
        popupAnchor: [0, -40],
      }),
      zIndexOffset: 1500,
    })
      .bindPopup(popup, {
        closeButton: false,
        minWidth: 220,
        maxWidth: 260,
        // Keep the popup clear of the floating header/search (top) and sheet (bottom).
        autoPanPaddingTopLeft: L.point(16, window.innerWidth < 900 ? 200 : 24),
        autoPanPaddingBottomRight: L.point(16, 100),
      })
      .addTo(map);

    // No animation: opening the popup mid-animation places it wrongly.
    map.setView(searchLatLng, 16, { animate: false }); // moveend reloads places around it
    setExpanded(false);
    searchMarker.openPopup();
  }

  searchBox = RS.attachSearch(document.getElementById("map-search"), {
    getBias: () => {
      const c = userLatLng || map.getCenter();
      return [c.lat, c.lng];
    },
    onSelect: showSearchResult,
    onClear: clearSearch,
  });

  // ---------------- Voice search ----------------

  const VOICE_KEYWORDS = [
    ["toilet", ["toilet", "bathroom", "washroom", "restroom", "loo", "टॉयलेट", "शौचालय", "बाथरूम", "पेशाब", "संडास", "शौच"]],
    ["water", ["water", "paani", "pani", "पानी", "जल"]],
    ["charging", ["charging", "charge", "charger", "चार्ज", "चार्जिंग", "चार्जर"]],
    ["shade", ["shade", "rest", "sit", "छाँव", "छांव", "छाया", "आराम"]],
    ["women_safe", ["women", "woman", "lady", "ladies", "महिला", "औरत", "लेडीज"]],
    ["open_now", ["open", "खुला"]],
  ];

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceBtn = document.getElementById("voice-btn");
  if (Recognition) {
    voiceBtn.hidden = false;
    voiceBtn.addEventListener("click", () => {
      const rec = new Recognition();
      rec.lang = RS.getLang() === "hi" ? "hi-IN" : "en-IN";
      rec.interimResults = false;
      rec.maxAlternatives = 3;
      voiceBtn.classList.add("listening");
      RS.toast(RS.t("listening"), 6000);
      rec.onresult = (e) => {
        const heard = Array.from(e.results[0]).map((a) => a.transcript.toLowerCase()).join(" ");
        const matched = VOICE_KEYWORDS.filter(([, words]) => words.some((w) => heard.includes(w))).map(([f]) => f);
        if (!matched.length) return RS.toast(RS.t("voice_no_match"), 4000);
        matched.forEach((f) => setChip(f, true));
        RS.toast(RS.t("heard", { q: e.results[0][0].transcript }));
        loadPlaces();
        setExpanded(true);
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed") RS.toast(RS.t("voice_unsupported"));
      };
      rec.onend = () => voiceBtn.classList.remove("listening");
      rec.start();
    });
  }

  // ---------------- Realtime (optional) ----------------

  async function startRealtime() {
    let cfg;
    try {
      cfg = await RS.api("/api/config");
    } catch (_) {
      return;
    }
    if (!cfg.supabase_url || !cfg.supabase_anon_key) return;
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
    script.onload = () => {
      const client = window.supabase.createClient(cfg.supabase_url, cfg.supabase_anon_key);
      client
        .channel("places-inserts")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "places" }, (payload) => {
          const p = payload.new;
          if (!p || p.source !== "user") return; // ignore bulk OSM seeding
          RS.toast(RS.t("new_place", { name: p.name }), 4000);
          if (map.getBounds().contains([p.lat, p.lng])) loadPlaces();
        })
        .subscribe();
    };
    document.head.appendChild(script);
  }

  // ---------------- Start ----------------

  updateSummary();
  loadPlaces();
  locate(!hasFocus);
  startRealtime();
})();
