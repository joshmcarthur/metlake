(() => {
  function punctColor(pct) {
    if (pct >= 95) return "#e8f2e3";
    if (pct >= 92) return "#cfe4c8";
    if (pct >= 88) return "#f5e6a8";
    if (pct >= 84) return "#e8b86a";
    return "#c45c16";
  }

  function renderCalendar() {
    const root = document.querySelector("#net-calendar");
    if (!root) return;

    // August 2026 starts Saturday — pad with muted cells for Mon-start grid
    // Use Sun-start for simplicity matching heatmap: show Aug 1–12 + pad
    const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    // 2026-08-01 is Saturday → index 5 if Mon=0
    const startDow = 5;
    const days = [
      94.2, 93.8, 91.1, 92.4, 90.8, 95.1, 96.0, 91.5, 89.2, 90.1, 92.0, 91.4,
    ];

    let html = dow.map((d) => `<div class="dow">${d}</div>`).join("");
    for (let i = 0; i < startDow; i++) html += `<div class="cell muted"></div>`;
    days.forEach((pct, i) => {
      const day = i + 1;
      html += `<div class="cell" style="background:${punctColor(pct)}" title="1–12 Aug · day ${day}: ${pct}% punctuality" tabindex="0">${day}</div>`;
    });
    root.innerHTML = html;
  }

  function renderHistogram() {
    const root = document.querySelector("#net-hist");
    if (!root) return;

    // Buckets of route punctuality for the period
    const buckets = [
      { label: "<80", count: 2, soft: true },
      { label: "80–85", count: 5, soft: true },
      { label: "85–90", count: 14, soft: false },
      { label: "90–95", count: 28, soft: false },
      { label: "95+", count: 19, soft: false },
    ];
    const max = Math.max(...buckets.map((b) => b.count));
    const w = 520;
    const h = 200;
    const pad = { t: 16, r: 12, b: 36, l: 36 };
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;
    const bw = innerW / buckets.length - 10;

    const bars = buckets
      .map((b, i) => {
        const x = pad.l + i * (innerW / buckets.length) + 5;
        const bh = (b.count / max) * innerH;
        const y = pad.t + innerH - bh;
        return `
          <rect class="bar${b.soft ? " soft" : ""}" x="${x}" y="${y}" width="${bw}" height="${bh}" rx="2">
            <title>${b.label}%: ${b.count} routes</title>
          </rect>
          <text class="label" x="${x + bw / 2}" y="${h - 14}" text-anchor="middle">${b.label}</text>
          <text class="label" x="${x + bw / 2}" y="${y - 4}" text-anchor="middle">${b.count}</text>`;
      })
      .join("");

    root.innerHTML = `
      <svg class="hist" viewBox="0 0 ${w} ${h}" role="img" aria-label="Distribution of route punctuality">
        <line x1="${pad.l}" y1="${pad.t + innerH}" x2="${w - pad.r}" y2="${pad.t + innerH}" stroke="#d0d8dc" />
        ${bars}
      </svg>`;
  }

  function renderScatter() {
    const root = document.querySelector("#net-scatter");
    if (!root) return;

    // all-day punctuality (x) vs peak punctuality gap (y = all - peak, positive = peak worse)
    const routes = [
      { id: "2", x: 98.6, gap: 1.2 },
      { id: "60", x: 97.9, gap: 0.8 },
      { id: "N1", x: 97.1, gap: 2.1 },
      { id: "14", x: 94.5, gap: 3.4 },
      { id: "22", x: 93.2, gap: 4.1 },
      { id: "3", x: 91.8, gap: 5.6 },
      { id: "110", x: 85.0, gap: 6.2, flag: true },
      { id: "1", x: 84.1, gap: 7.8, flag: true },
      { id: "83", x: 82.4, gap: 9.1, flag: true },
      { id: "7", x: 88.4, gap: 2.0 },
      { id: "29", x: 90.2, gap: 8.4, flag: true },
      { id: "52", x: 92.0, gap: 1.5 },
    ];

    const w = 520;
    const h = 240;
    const pad = { t: 20, r: 20, b: 40, l: 44 };
    const xMin = 80;
    const xMax = 100;
    const yMin = 0;
    const yMax = 10;
    const X = (v) => pad.l + ((v - xMin) / (xMax - xMin)) * (w - pad.l - pad.r);
    const Y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);

    const pts = routes
      .map(
        (r) => `
      <circle class="pt${r.flag ? " flag" : ""}" cx="${X(r.x)}" cy="${Y(r.gap)}" r="5">
        <title>Route ${r.id}: ${r.x}% punctuality, peak ${r.gap}pp worse</title>
      </circle>
      <text class="axis-label" x="${X(r.x) + 6}" y="${Y(r.gap) + 3}">${r.id}</text>`
      )
      .join("");

    root.innerHTML = `
      <svg class="scatter" viewBox="0 0 ${w} ${h}" role="img" aria-label="Peak gap vs all-day punctuality">
        <line x1="${pad.l}" y1="${h - pad.b}" x2="${w - pad.r}" y2="${h - pad.b}" stroke="#d0d8dc" />
        <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${h - pad.b}" stroke="#d0d8dc" />
        <text class="axis-label" x="${(pad.l + w - pad.r) / 2}" y="${h - 10}" text-anchor="middle">All-day punctuality %</text>
        <text class="axis-label" x="12" y="${(pad.t + h - pad.b) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(pad.t + h - pad.b) / 2})">Peak gap (pp worse)</text>
        ${pts}
      </svg>`;
  }

  function renderHourHeat() {
    const root = document.querySelector("#net-hour-heat");
    if (!root) return;
    const hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const matrix = {
      Mon: [55, 140, 200, 170, 90, 70, 65, 60, 80, 120, 170, 190, 100, 50],
      Tue: [50, 145, 210, 175, 88, 68, 62, 58, 75, 115, 165, 185, 95, 48],
      Wed: [52, 150, 215, 180, 92, 72, 66, 60, 78, 118, 172, 195, 102, 52],
      Thu: [58, 155, 220, 185, 95, 75, 70, 64, 82, 125, 180, 200, 110, 55],
      Fri: [60, 165, 230, 195, 100, 80, 78, 70, 100, 145, 200, 220, 125, 65],
      Sat: [30, 45, 55, 50, 48, 45, 50, 55, 60, 65, 58, 50, 40, 28],
      Sun: [25, 35, 42, 40, 38, 35, 38, 42, 45, 48, 44, 38, 30, 22],
    };

    function delayColor(sec) {
      if (sec < 45) return "#e8f2e3";
      if (sec < 90) return "#cfe4c8";
      if (sec < 150) return "#f5e6a8";
      if (sec < 210) return "#e8b86a";
      return "#c45c16";
    }

    const head = `<tr><th class="row-label"></th>${hours
      .map((h) => `<th>${String(h).padStart(2, "0")}</th>`)
      .join("")}</tr>`;
    const rows = days
      .map((day) => {
        const cells = matrix[day]
          .map(
            (v, i) =>
              `<td style="background:${delayColor(v)}" title="${day} ${hours[i]}:00 · ${v}s median network delay" tabindex="0">${v}</td>`
          )
          .join("");
        return `<tr><th class="row-label" scope="row">${day}</th>${cells}</tr>`;
      })
      .join("");
    root.innerHTML = `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  }

  function renderCorridors() {
    const root = document.querySelector("#net-corridors");
    if (!root) return;
    const rows = [
      {
        seg: "Petone Station → Ngauranga",
        routes: "83, 110, 81",
        add: 92,
        trips: 1840,
      },
      {
        seg: "Kilbirnie → Courtenay Pl",
        routes: "2, 3, 14",
        add: 74,
        trips: 3200,
      },
      {
        seg: "Johnsonville → Ngauranga",
        routes: "1, 24, 25",
        add: 61,
        trips: 2100,
      },
      {
        seg: "Newtown → Basin Reserve",
        routes: "1, 18, 23",
        add: 55,
        trips: 2600,
      },
      {
        seg: "Karori Tunnel approach",
        routes: "2, 3",
        add: 48,
        trips: 1500,
      },
    ];
    root.innerHTML = `
      <table class="corridor-table">
        <thead>
          <tr>
            <th>Segment</th>
            <th>Routes sharing</th>
            <th class="num">Avg +delay</th>
            <th class="num">Trips</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              <td>${r.seg}</td>
              <td>${r.routes}</td>
              <td class="num">+${r.add}s</td>
              <td class="num">${r.trips.toLocaleString("en-NZ")}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
  }

  function renderCancelSpark() {
    const root = document.querySelector("#net-cancel-spark");
    if (!root) return;
    const vals = [1.2, 1.4, 2.8, 1.6, 1.5, 1.1, 0.9, 1.8, 3.4, 2.1, 1.7, 1.8];
    const w = 280;
    const h = 56;
    const max = Math.max(...vals);
    const pts = vals
      .map((v, i) => {
        const x = (i / (vals.length - 1)) * (w - 4) + 2;
        const y = h - 4 - (v / max) * (h - 10);
        return `${x},${y}`;
      })
      .join(" ");
    root.innerHTML = `
      <svg class="spark" viewBox="0 0 ${w} ${h}" width="100%" height="56" role="img" aria-label="Cancellation rate sparkline">
        <polyline fill="none" stroke="#b86a00" stroke-width="2" points="${pts}" />
      </svg>
      <p class="period-meta" style="margin:0.35rem 0 0">Daily network cancellation % · spikes on day 3 and day 9</p>`;
  }

  renderCalendar();
  renderHistogram();
  renderScatter();
  renderHourHeat();
  renderCorridors();
  renderCancelSpark();
})();
