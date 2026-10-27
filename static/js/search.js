// Location search box with suggestions as you type. Used on the map and Add pages.
//
// RS.attachSearch(rootEl, {
//   getBias: () => [lat, lng] | null,   // results near here rank higher
//   onSelect: (result) => {},           // {name, address, lat, lng, is_poi}
//   onClear: () => {},
// })

(() => {
  const DEBOUNCE_MS = 350;
  const MIN_CHARS = 3;

  function attachSearch(root, opts) {
    const input = root.querySelector("input");
    const clearBtn = root.querySelector(".search-clear");
    const list = root.querySelector(".search-results");
    let results = [];
    let active = -1;
    let seq = 0;
    let timer = null;

    function close() {
      list.hidden = true;
      active = -1;
      input.setAttribute("aria-expanded", "false");
    }

    function message(text) {
      list.replaceChildren();
      const li = document.createElement("li");
      li.className = "search-msg";
      li.textContent = text;
      list.appendChild(li);
      list.hidden = false;
    }

    function render() {
      list.replaceChildren();
      if (!results.length) return message(RS.t("search_none"));
      results.forEach((r, i) => {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "search-item" + (i === active ? " active" : "");
        const name = document.createElement("span");
        name.className = "search-name";
        name.textContent = r.name; // textContent: geocoder data is untrusted
        const addr = document.createElement("span");
        addr.className = "search-addr";
        addr.textContent = r.address;
        btn.append(name, addr);
        // pointerdown fires before the input loses focus
        btn.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          choose(i);
        });
        btn.addEventListener("click", () => choose(i));
        li.appendChild(btn);
        list.appendChild(li);
      });
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }

    function choose(i) {
      const r = results[i];
      if (!r) return;
      input.value = r.name;
      clearBtn.hidden = false;
      close();
      input.blur(); // hides the phone keyboard
      opts.onSelect(r);
    }

    async function search(q) {
      const mySeq = ++seq;
      const params = new URLSearchParams({ q });
      const bias = opts.getBias && opts.getBias();
      if (bias) {
        params.set("lat", bias[0].toFixed(4));
        params.set("lng", bias[1].toFixed(4));
      }
      message(RS.t("searching"));
      try {
        const data = await RS.api("/api/geocode?" + params);
        if (mySeq !== seq) return; // a newer search started
        results = data.results || [];
        active = -1;
        render();
      } catch (err) {
        if (mySeq === seq) message(err.message);
      }
    }

    input.addEventListener("input", () => {
      const q = input.value.trim();
      clearBtn.hidden = !input.value;
      clearTimeout(timer);
      if (q.length < MIN_CHARS) {
        seq++;
        close();
        return;
      }
      timer = setTimeout(() => search(q), DEBOUNCE_MS);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (list.hidden || !results.length) return;
        e.preventDefault();
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
        render();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (results.length && !list.hidden) choose(active >= 0 ? active : 0);
        else if (input.value.trim().length >= 2) search(input.value.trim());
      } else if (e.key === "Escape") {
        close();
      }
    });

    input.addEventListener("focus", () => {
      if (results.length && input.value.trim().length >= MIN_CHARS) render();
    });

    clearBtn.addEventListener("click", () => {
      input.value = "";
      clearBtn.hidden = true;
      results = [];
      seq++;
      close();
      input.focus();
      if (opts.onClear) opts.onClear();
    });

    document.addEventListener("pointerdown", (e) => {
      if (!root.contains(e.target)) close();
    });

    return {
      clear() {
        input.value = "";
        clearBtn.hidden = true;
        results = [];
        close();
      },
    };
  }

  RS.attachSearch = attachSearch;
})();
