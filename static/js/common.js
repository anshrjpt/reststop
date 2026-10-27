// Shared helpers: rider id, language, API calls, toasts.

const RS = (() => {
  // Map starts here until the rider's location is known.
  // Change to your hackathon venue for the demo.
  const DEFAULT_CENTER = [28.6315, 77.2167]; // Connaught Place, New Delhi
  const DEFAULT_ZOOM = 14;

  const STRINGS = {
    en: {
      app_name: "RestStop",
      tagline: "Toilets, water & rest for riders",
      f_toilet: "Toilet",
      f_water: "Water",
      f_charging: "Charging",
      f_shade: "Shade",
      f_women_safe: "Women-safe",
      f_rider_friendly: "Rider-friendly",
      f_open_now: "Open now",
      navigate: "Navigate",
      still_works: "Still works",
      closed: "Closed",
      report: "Report",
      add_place: "Add place",
      impact: "Impact",
      my_location: "My location",
      share_location: "Share location",
      voice: "Voice search",
      verified_by: "Verified by {n} riders",
      verified_by_one: "Verified by 1 rider",
      closed_reports: "{n} said closed / denied",
      reports_count: "{n} problem reports",
      last_checked: "Last checked {t}",
      not_verified: "Not verified yet — be the first",
      status_open: "Open now",
      status_closed: "Closed now",
      status_unknown: "Hours unknown",
      away: "{d} away",
      rider_friendly_badge: "Rider-friendly shop — riders are welcome here",
      from_osm: "From OpenStreetMap",
      loading: "Loading places…",
      all_places: "All places",
      are_you_here: "Are you here now? Help other riders",
      listening: "Listening… say “toilet” or “paani”",
      heard: "Heard: “{q}”",
      voice_no_match: "Didn't catch a facility. Try “toilet”, “water”, “charging”.",
      voice_unsupported: "Voice search needs Chrome",
      loc_denied: "Location blocked — showing default area",
      loc_insecure: "Location needs HTTPS. Use the ngrok link on phones.",
      loc_finding: "Finding you…",
      zoom_in: "Zoom in to see places",
      no_places: "No places here yet. Add one!",
      places_found: "{n} places nearby",
      thanks: "Thanks! Other riders will see this.",
      report_why: "What's wrong?",
      r_dirty: "Dirty",
      r_unsafe: "Unsafe",
      r_wrong_location: "Wrong location",
      r_denied_access: "Not allowed in",
      r_other: "Other",
      cancel: "Cancel",
      new_place: "New place added: {name}",
      share_msg: "My current location (sent from RestStop): {url}",
      error: "Something went wrong: {msg}",
      offline: "You're offline",
      // Add page
      add_title: "Add a place",
      pin_hint: "Tap the map or drag the pin to the exact spot",
      use_my_location: "Use my location",
      place_name: "Place name",
      place_name_ph: "e.g. Sharma General Store",
      category: "Type",
      c_shop: "Shop",
      c_fuel: "Petrol pump",
      c_public: "Public",
      c_restaurant: "Restaurant / dhaba",
      c_other: "Other",
      add_intro: "Know a spot where riders can use a toilet, fill water or rest? Add it in under a minute.",
      step_location: "Location",
      step_details: "Details",
      step_more: "More info",
      optional: "(optional)",
      facilities: "Facilities",
      facilities_hint: "Select everything riders can use here",
      hours: "Opening hours",
      opens: "Opens",
      closes: "Closes",
      photo: "Photo",
      photo_cta: "Take or choose a photo",
      owner: "I own this shop and riders are welcome",
      submit: "Add place",
      saving: "Saving…",
      back: "Back to map",
      need_name: "Enter the place name",
      need_facility: "Select at least one: toilet, water, charging or shade",
      need_both_times: "Give both opening and closing time, or leave both empty",
      // Dashboard
      impact_eyebrow: "Live impact",
      impact_headline: "The people who deliver our dinner deserve a place to rest.",
      impact_lead: "Delivery riders spend long hours on the road with nowhere to use a toilet, drink water or charge their phone. RestStop maps those places — built by riders, for riders.",
      live: "Live",
      how_title: "How it works",
      how1_t: "Find",
      how1_d: "Riders see the nearest toilet, water, charging point or shade — filtered for what they need right now.",
      how2_t: "Verify",
      how2_d: "Every visit is a chance to confirm a place still works, so the map stays trustworthy.",
      how3_t: "Welcome",
      how3_d: "Shops sign up as rider-friendly and open their doors — a small act that changes a rider's day.",
      impact_title: "RestStop impact",
      s_total_places: "Places mapped",
      s_user_added: "Added by riders & shops",
      s_rider_friendly: "Rider-friendly shops",
      s_with_toilet: "Toilets",
      s_with_water: "Water points",
      s_with_charging: "Charging points",
      s_women_safe: "Women-safe places",
      s_verifications: "Verifications",
      s_riders: "Riders verifying",
      s_reports: "Problem reports",
      // Time ago
      t_now: "just now",
      t_min: "{n} min ago",
      t_hour: "{n} h ago",
      t_day: "{n} d ago",
    },
    hi: {
      app_name: "रेस्टस्टॉप",
      tagline: "राइडर्स के लिए शौचालय, पानी और आराम",
      f_toilet: "शौचालय",
      f_water: "पानी",
      f_charging: "चार्जिंग",
      f_shade: "छाँव",
      f_women_safe: "महिलाओं के लिए सुरक्षित",
      f_rider_friendly: "राइडर-फ्रेंडली",
      f_open_now: "अभी खुला",
      navigate: "रास्ता देखें",
      still_works: "अभी भी चालू है",
      closed: "बंद है",
      report: "शिकायत करें",
      add_place: "जगह जोड़ें",
      impact: "असर",
      my_location: "मेरी लोकेशन",
      share_location: "लोकेशन भेजें",
      voice: "बोलकर खोजें",
      verified_by: "{n} राइडर्स ने पुष्टि की",
      verified_by_one: "1 राइडर ने पुष्टि की",
      closed_reports: "{n} ने कहा बंद है / जाने नहीं दिया",
      reports_count: "{n} शिकायतें",
      last_checked: "आखिरी जाँच {t}",
      not_verified: "अभी तक पुष्टि नहीं हुई — पहले आप करें",
      status_open: "अभी खुला है",
      status_closed: "अभी बंद है",
      status_unknown: "समय पता नहीं",
      away: "{d} दूर",
      rider_friendly_badge: "राइडर-फ्रेंडली दुकान — यहाँ राइडर्स का स्वागत है",
      from_osm: "OpenStreetMap से",
      loading: "जगहें लोड हो रही हैं…",
      all_places: "सभी जगहें",
      are_you_here: "क्या आप अभी यहाँ हैं? बाकी राइडर्स की मदद करें",
      listening: "सुन रहा हूँ… “टॉयलेट” या “पानी” बोलें",
      heard: "सुना: “{q}”",
      voice_no_match: "सुविधा समझ नहीं आई। “टॉयलेट”, “पानी”, “चार्जिंग” बोलें।",
      voice_unsupported: "बोलकर खोजने के लिए Chrome चाहिए",
      loc_denied: "लोकेशन की अनुमति नहीं मिली — डिफ़ॉल्ट इलाका दिखा रहे हैं",
      loc_insecure: "लोकेशन के लिए HTTPS चाहिए। फ़ोन पर ngrok लिंक खोलें।",
      loc_finding: "आपकी लोकेशन ढूँढ रहे हैं…",
      zoom_in: "जगहें देखने के लिए ज़ूम करें",
      no_places: "यहाँ अभी कोई जगह नहीं है। एक जोड़ें!",
      places_found: "आस-पास {n} जगहें",
      thanks: "धन्यवाद! बाकी राइडर्स को यह दिखेगा।",
      report_why: "क्या समस्या है?",
      r_dirty: "गंदा है",
      r_unsafe: "असुरक्षित",
      r_wrong_location: "गलत जगह",
      r_denied_access: "अंदर जाने नहीं दिया",
      r_other: "अन्य",
      cancel: "रद्द करें",
      new_place: "नई जगह जुड़ी: {name}",
      share_msg: "मेरी अभी की लोकेशन (रेस्टस्टॉप से भेजी गई): {url}",
      error: "कुछ गड़बड़ हुई: {msg}",
      offline: "आप ऑफ़लाइन हैं",
      add_title: "नई जगह जोड़ें",
      pin_hint: "सही जगह चुनने के लिए मैप पर टैप करें या पिन खिसकाएँ",
      use_my_location: "मेरी लोकेशन लें",
      place_name: "जगह का नाम",
      place_name_ph: "जैसे: शर्मा जनरल स्टोर",
      category: "प्रकार",
      c_shop: "दुकान",
      c_fuel: "पेट्रोल पंप",
      c_public: "सार्वजनिक",
      c_restaurant: "रेस्टोरेंट / ढाबा",
      c_other: "अन्य",
      add_intro: "कोई ऐसी जगह जानते हैं जहाँ राइडर्स शौचालय, पानी या आराम पा सकें? एक मिनट में जोड़ें।",
      step_location: "जगह",
      step_details: "जानकारी",
      step_more: "और जानकारी",
      optional: "(वैकल्पिक)",
      facilities: "सुविधाएँ",
      facilities_hint: "राइडर्स यहाँ जो भी इस्तेमाल कर सकते हैं, सब चुनें",
      hours: "खुलने का समय",
      opens: "खुलता है",
      closes: "बंद होता है",
      photo: "फ़ोटो",
      photo_cta: "फ़ोटो लें या चुनें",
      owner: "यह मेरी दुकान है और राइडर्स का स्वागत है",
      submit: "जगह जोड़ें",
      saving: "सेव हो रहा है…",
      back: "मैप पर वापस",
      need_name: "जगह का नाम लिखें",
      need_facility: "कम से कम एक चुनें: शौचालय, पानी, चार्जिंग या छाँव",
      need_both_times: "खुलने और बंद होने का समय दोनों दें, या दोनों खाली छोड़ें",
      impact_eyebrow: "लाइव असर",
      impact_headline: "जो हमारा खाना पहुँचाते हैं, उन्हें भी आराम की जगह चाहिए।",
      impact_lead: "डिलीवरी राइडर्स घंटों सड़क पर रहते हैं, पर शौचालय, पीने का पानी या फ़ोन चार्ज करने की जगह नहीं मिलती। रेस्टस्टॉप ऐसी जगहों का मैप है — राइडर्स के द्वारा, राइडर्स के लिए।",
      live: "लाइव",
      how_title: "यह कैसे काम करता है",
      how1_t: "खोजें",
      how1_d: "राइडर्स को सबसे नज़दीकी शौचालय, पानी, चार्जिंग या छाँव दिखती है — जो अभी चाहिए, वही।",
      how2_t: "पुष्टि करें",
      how2_d: "हर बार जाने पर पुष्टि करें कि जगह अभी भी चालू है, ताकि मैप भरोसेमंद रहे।",
      how3_t: "स्वागत करें",
      how3_d: "दुकानें राइडर-फ्रेंडली बनकर अपने दरवाज़े खोलती हैं — एक छोटा कदम जो राइडर का दिन बदल देता है।",
      impact_title: "रेस्टस्टॉप का असर",
      s_total_places: "मैप पर जगहें",
      s_user_added: "राइडर्स और दुकानों ने जोड़ीं",
      s_rider_friendly: "राइडर-फ्रेंडली दुकानें",
      s_with_toilet: "शौचालय",
      s_with_water: "पानी की जगहें",
      s_with_charging: "चार्जिंग पॉइंट",
      s_women_safe: "महिलाओं के लिए सुरक्षित जगहें",
      s_verifications: "पुष्टियाँ",
      s_riders: "पुष्टि करने वाले राइडर्स",
      s_reports: "शिकायतें",
      t_now: "अभी",
      t_min: "{n} मिनट पहले",
      t_hour: "{n} घंटे पहले",
      t_day: "{n} दिन पहले",
    },
  };

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (_) {
      return null;
    }
  }

  let memoryUserId = null;
  function userId() {
    let id = store("rs_user_id") || memoryUserId;
    if (!id) {
      // crypto.randomUUID only exists on HTTPS/localhost.
      id = window.crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : "u-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
      memoryUserId = id;
      store("rs_user_id", id);
    }
    return id;
  }

  let lang = store("rs_lang") === "hi" ? "hi" : "en";

  function t(key, vars) {
    let s = (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
    if (vars) for (const k in vars) s = s.split("{" + k + "}").join(vars[k]);
    return s;
  }

  function applyI18n(root) {
    (root || document).querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    (root || document).querySelectorAll("[data-i18n-ph]").forEach((el) => {
      el.placeholder = t(el.dataset.i18nPh);
    });
    (root || document).querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
      el.setAttribute("aria-label", el.title);
    });
    document.documentElement.lang = lang;
    const toggle = document.getElementById("lang-toggle");
    if (toggle) toggle.textContent = lang === "en" ? "हिंदी" : "English";
  }

  function setLang(next) {
    lang = next;
    store("rs_lang", next);
    applyI18n();
    document.dispatchEvent(new CustomEvent("rs:lang"));
  }

  function getLang() {
    return lang;
  }

  async function api(path, options) {
    let resp;
    try {
      resp = await fetch(path, options);
    } catch (_) {
      throw new Error(navigator.onLine ? "network error" : t("offline"));
    }
    let body = null;
    try {
      body = await resp.json();
    } catch (_) {
      /* non-JSON error page */
    }
    if (!resp.ok) throw new Error((body && body.error) || "HTTP " + resp.status);
    return body;
  }

  function postJSON(path, data) {
    return api(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  let toastTimer = null;
  function toast(message, ms) {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), ms || 3000);
  }

  function nowHHMM() {
    const d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function formatDistance(m) {
    if (m == null) return "";
    return m < 1000 ? Math.round(m / 10) * 10 + " m" : (m / 1000).toFixed(1) + " km";
  }

  function timeAgo(iso) {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return t("t_now");
    if (mins < 60) return t("t_min", { n: mins });
    if (mins < 60 * 24) return t("t_hour", { n: Math.round(mins / 60) });
    return t("t_day", { n: Math.round(mins / 1440) });
  }

  function initCommon() {
    applyI18n();
    const toggle = document.getElementById("lang-toggle");
    if (toggle) toggle.addEventListener("click", () => setLang(lang === "en" ? "hi" : "en"));
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }

  return {
    DEFAULT_CENTER, DEFAULT_ZOOM, t, applyI18n, setLang, getLang, userId,
    api, postJSON, toast, nowHHMM, formatDistance, timeAgo, initCommon,
  };
})();

document.addEventListener("DOMContentLoaded", RS.initCommon);
