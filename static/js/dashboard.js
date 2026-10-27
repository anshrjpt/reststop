// Impact dashboard: totals from /api/stats, refreshed every 15 s for live demos.

(() => {
  // [stat key, icon, featured]
  const TILES = [
    ["total_places", "pin", true],
    ["verifications", "check", true],
    ["user_added", "users", false],
    ["rider_friendly", "star", false],
    ["with_toilet", "wc", false],
    ["with_water", "drop", false],
    ["with_charging", "zap", false],
    ["women_safe", "shield", false],
    ["riders", "users", false],
    ["reports", "flag", false],
  ];

  const grid = document.getElementById("stats");
  let stats = null;

  function icon(name) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "i");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(ns, "use");
    use.setAttribute("href", "/icons.svg#" + name);
    svg.appendChild(use);
    return svg;
  }

  function render() {
    grid.replaceChildren();
    TILES.forEach(([key, iconName, featured]) => {
      const tile = document.createElement("div");
      tile.className = "stat" + (featured ? " stat-featured" : "");
      const ic = document.createElement("span");
      ic.className = "stat-icon";
      ic.appendChild(icon(iconName));
      const num = document.createElement("div");
      num.className = "stat-num";
      num.textContent = stats ? Number(stats[key] || 0).toLocaleString("en-IN") : "—";
      const label = document.createElement("div");
      label.className = "stat-label";
      label.textContent = RS.t("s_" + key);
      tile.append(ic, num, label);
      grid.appendChild(tile);
    });
  }

  async function load() {
    try {
      stats = (await RS.api("/api/stats")).stats;
      render();
    } catch (err) {
      RS.toast(RS.t("error", { msg: err.message }), 5000);
    }
  }

  document.addEventListener("rs:lang", render);
  render();
  load();
  setInterval(load, 15000);
})();
