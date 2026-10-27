// Add place page: pin picker, photo compression, submit.

(() => {
  const MAX_PHOTO_SIDE = 1600;

  const params = new URLSearchParams(location.search);
  const startLat = parseFloat(params.get("lat"));
  const startLng = parseFloat(params.get("lng"));
  const start = !isNaN(startLat) && !isNaN(startLng) ? [startLat, startLng] : RS.DEFAULT_CENTER;

  const map = L.map("pick-map").setView(start, 17);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  const pin = L.marker(start, {
    draggable: true,
    icon: L.divIcon({
      className: "pin-wrap",
      html: '<div class="pin pin-selected"><svg class="i"><use href="/icons.svg#plus"/></svg></div>',
      iconSize: [36, 44],
      iconAnchor: [18, 44],
    }),
  }).addTo(map);
  map.on("click", (e) => pin.setLatLng(e.latlng));

  document.getElementById("use-location").addEventListener("click", () => {
    if (!window.isSecureContext) return RS.toast(RS.t("loc_insecure"), 6000);
    if (!navigator.geolocation) return;
    RS.toast(RS.t("loc_finding"));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ll = [pos.coords.latitude, pos.coords.longitude];
        pin.setLatLng(ll);
        map.setView(ll, 18);
      },
      () => RS.toast(RS.t("loc_denied")),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // ---------------- Photo ----------------

  const form = document.getElementById("add-form");
  const photoInput = form.elements.photo;
  const preview = document.getElementById("photo-preview");
  const uploadEmpty = document.getElementById("upload-empty");
  let photoBlob = null;

  // Phone photos are often 5–10 MB; shrink to a JPEG before upload.
  function compress(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("photo"))), "image/jpeg", 0.8);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read photo"));
      };
      img.src = url;
    });
  }

  photoInput.addEventListener("change", async () => {
    photoBlob = null;
    preview.hidden = true;
    uploadEmpty.hidden = false;
    const file = photoInput.files[0];
    if (!file) return;
    try {
      photoBlob = await compress(file);
      preview.src = URL.createObjectURL(photoBlob);
      preview.hidden = false;
      uploadEmpty.hidden = true;
    } catch (err) {
      RS.toast(RS.t("error", { msg: err.message }));
    }
  });

  // ---------------- Submit ----------------

  const errorBox = document.getElementById("form-error");
  const submitBtn = document.getElementById("submit-btn");

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
    errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.hidden = true;

    const f = form.elements;
    if (!f.name.value.trim()) {
      f.name.focus();
      return showError(RS.t("need_name"));
    }
    if (![f.has_toilet, f.has_water, f.has_charging, f.has_shade].some((c) => c.checked)) {
      return showError(RS.t("need_facility"));
    }
    if (!!f.open_time.value !== !!f.close_time.value) {
      return showError(RS.t("need_both_times"));
    }

    const data = new FormData(form);
    data.delete("photo");
    if (photoBlob) data.append("photo", photoBlob, "photo.jpg");
    const ll = pin.getLatLng();
    data.append("lat", ll.lat.toFixed(6));
    data.append("lng", ll.lng.toFixed(6));
    data.append("user_id", RS.userId());

    submitBtn.disabled = true;
    submitBtn.textContent = RS.t("saving");
    try {
      const res = await RS.api("/api/places", { method: "POST", body: data });
      const p = res.place;
      location.href = "/?place=" + p.id + "&lat=" + p.lat + "&lng=" + p.lng;
    } catch (err) {
      showError(RS.t("error", { msg: err.message }));
      submitBtn.disabled = false;
      submitBtn.textContent = RS.t("submit");
    }
  });
})();
