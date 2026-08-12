(() => {
  const stopsInbound = [
    { name: "Eastbourne — Days Bay", delay: 18 },
    { name: "Muritai Rd", delay: 42 },
    { name: "York Bay", delay: 55 },
    { name: "Lowry Bay", delay: 70 },
    { name: "Point Howard", delay: 95 },
    { name: "Seaview", delay: 130 },
    { name: "Petone Station", delay: 155 },
    { name: "Ngauranga", delay: 247 },
    { name: "Wellington Station", delay: 268 },
  ];

  const stopsOutbound = [
    { name: "Wellington Station", delay: 25 },
    { name: "Ngauranga", delay: 40 },
    { name: "Petone Station", delay: 88 },
    { name: "Seaview", delay: 110 },
    { name: "Point Howard", delay: 125 },
    { name: "Lowry Bay", delay: 140 },
    { name: "York Bay", delay: 148 },
    { name: "Muritai Rd", delay: 160 },
    { name: "Eastbourne — Days Bay", delay: 175 },
  ];

  const hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Rough inbound morning-heavy pattern (seconds of median delay)
  const heatmapInbound = {
    Mon: [40, 120, 210, 180, 90, 70, 65, 60, 75, 110, 160, 190, 100, 55],
    Tue: [35, 130, 220, 175, 85, 68, 62, 58, 70, 105, 155, 185, 95, 50],
    Wed: [38, 125, 205, 170, 88, 72, 66, 61, 78, 115, 170, 200, 110, 58],
    Thu: [42, 140, 230, 190, 95, 75, 70, 64, 80, 120, 175, 210, 115, 60],
    Fri: [45, 150, 240, 200, 100, 80, 78, 70, 95, 140, 200, 230, 130, 70],
    Sat: [20, 40, 55, 50, 45, 40, 42, 48, 55, 60, 58, 50, 40, 30],
    Sun: [15, 30, 40, 38, 35, 32, 34, 36, 40, 45, 42, 38, 30, 22],
  };

  const heatmapOutbound = {
    Mon: [50, 90, 100, 85, 70, 65, 80, 95, 140, 200, 220, 180, 90, 45],
    Tue: [48, 88, 98, 82, 68, 62, 78, 92, 135, 195, 215, 175, 88, 42],
    Wed: [52, 95, 105, 90, 72, 68, 82, 98, 145, 205, 225, 185, 95, 48],
    Thu: [55, 100, 110, 95, 75, 70, 85, 100, 150, 210, 235, 190, 100, 50],
    Fri: [60, 110, 120, 105, 80, 75, 95, 120, 170, 230, 250, 210, 120, 60],
    Sat: [25, 35, 40, 42, 45, 48, 55, 60, 70, 75, 70, 55, 40, 28],
    Sun: [18, 28, 32, 34, 36, 38, 42, 45, 50, 52, 48, 40, 30, 20],
  };

  function delayColor(sec) {
    if (sec < 45) return "#e8f2e3";
    if (sec < 90) return "#cfe4c8";
    if (sec < 150) return "#f5e6a8";
    if (sec < 210) return "#e8b86a";
    return "#c45c16";
  }

  function renderProfile(stops) {
    const root = document.querySelector("#profile-root");
    if (!root) return;

    const w = 720;
    const h = 260;
    const pad = { t: 20, r: 20, b: 70, l: 48 };
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;
    const maxDelay = Math.max(...stops.map((s) => s.delay)) * 1.15;

    const x = (i) => pad.l + (i / (stops.length - 1)) * innerW;
    const y = (d) => pad.t + innerH - (d / maxDelay) * innerH;

    const medianPts = stops.map((s, i) => `${x(i)},${y(s.delay)}`).join(" ");
    const bandTop = stops.map((s, i) => `${x(i)},${y(s.delay * 0.7)}`).join(" ");
    const bandBot = [...stops]
      .reverse()
      .map((s, idx) => {
        const i = stops.length - 1 - idx;
        return `${x(i)},${y(s.delay * 1.35)}`;
      })
      .join(" ");

    const labels = stops
      .map((s, i) => {
        const anchor = i === 0 ? "start" : i === stops.length - 1 ? "end" : "middle";
        const short = s.name.split("—")[0].trim().split(" ").slice(0, 2).join(" ");
        return `<text class="stop-label" x="${x(i)}" y="${h - 28}" text-anchor="${anchor}" transform="rotate(-32 ${x(i)},${h - 28})">${short}</text>`;
      })
      .join("");

    const dots = stops
      .map(
        (s, i) =>
          `<circle cx="${x(i)}" cy="${y(s.delay)}" r="3.5" fill="#1a5f73"><title>${s.name}: ${s.delay}s median late</title></circle>`
      )
      .join("");

    root.innerHTML = `
      <svg class="profile-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Median delay by stop along route 83">
        <line class="zero" x1="${pad.l}" y1="${y(0)}" x2="${w - pad.r}" y2="${y(0)}" />
        <polygon class="band" points="${bandTop} ${bandBot}" />
        <polyline class="median" points="${medianPts}" />
        ${dots}
        <text class="stop-label" x="${pad.l - 8}" y="${y(0) + 3}" text-anchor="end">0s</text>
        <text class="stop-label" x="${pad.l - 8}" y="${y(maxDelay * 0.5) + 3}" text-anchor="end">${Math.round(maxDelay * 0.5)}s</text>
        <text class="stop-label" x="${pad.l - 8}" y="${y(maxDelay) + 3}" text-anchor="end">${Math.round(maxDelay)}s</text>
        ${labels}
      </svg>`;
  }

  function renderInjectors(stops) {
    const list = document.querySelector("#injector-list");
    if (!list) return;

    const deltas = [];
    for (let i = 1; i < stops.length; i++) {
      deltas.push({
        from: stops[i - 1].name,
        to: stops[i].name,
        add: Math.max(0, stops[i].delay - stops[i - 1].delay),
      });
    }
    deltas.sort((a, b) => b.add - a.add);
    const top = deltas.slice(0, 5);
    const max = top[0]?.add || 1;

    list.innerHTML = top
      .map(
        (d, i) => `
      <li>
        <div class="injector-seg">
          ${String(i + 1).padStart(2, "0")}. ${d.from.split("—")[0].trim()}
          <span>→ ${d.to}</span>
        </div>
        <div class="injector-val">+${d.add}s</div>
        <div class="injector-bar-wrap">
          <div class="injector-bar" style="width:${(d.add / max) * 100}%"></div>
        </div>
      </li>`
      )
      .join("");
  }

  function renderHeatmap(matrix) {
    const root = document.querySelector("#heatmap-root");
    if (!root) return;

    const head = `<tr><th class="row-label"></th>${hours
      .map((h) => `<th>${String(h).padStart(2, "0")}</th>`)
      .join("")}</tr>`;

    const rows = days
      .map((day) => {
        const vals = matrix[day];
        const cells = vals
          .map((v, i) => {
            const label = `${day} ${String(hours[i]).padStart(2, "0")}:00 · ${v}s median`;
            return `<td style="background:${delayColor(v)}" title="${label}" tabindex="0">${v}</td>`;
          })
          .join("");
        return `<tr><th class="row-label" scope="row">${day}</th>${cells}</tr>`;
      })
      .join("");

    root.innerHTML = `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  }

  function applyDirection(dir) {
    document.querySelectorAll("[data-direction]").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.direction === dir));
    });
    const title = document.querySelector(".route-hero h1");
    if (title) title.textContent = dir === "inbound" ? "83 · inbound" : "83 · outbound";
    const desc = document.querySelector(".route-hero .desc");
    if (desc) {
      desc.textContent =
        dir === "inbound"
          ? "Eastbourne → Lower Hutt → Petone → Wellington · where delay forms"
          : "Wellington → Petone → Eastbourne · where delay forms";
    }
    const stops = dir === "inbound" ? stopsInbound : stopsOutbound;
    const heat = dir === "inbound" ? heatmapInbound : heatmapOutbound;
    renderProfile(stops);
    renderInjectors(stops);
    renderHeatmap(heat);
  }

  document.querySelectorAll("[data-direction]").forEach((btn) => {
    btn.addEventListener("click", () => applyDirection(btn.dataset.direction));
  });

  if (document.querySelector("#profile-root")) {
    applyDirection("inbound");
  }
})();
