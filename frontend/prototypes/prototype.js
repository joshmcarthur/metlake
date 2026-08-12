(() => {
  const periods = {
    day: {
      label: "12 Aug 2026 → 12 Aug 2026 · NZST",
      from: "2026-08-12",
      to: "2026-08-12",
      values: {
        reliability: "97.2%",
        punctuality: "91.4%",
        cancellations: "1.8%",
        trips: "12,480",
      },
      deltas: {
        reliability: { text: "+0.3 pp vs prior day", cls: "up" },
        punctuality: { text: "−1.1 pp vs prior day", cls: "down" },
        cancellations: { text: "+0.2 pp vs prior day", cls: "down" },
        trips: { text: "−210 vs prior day", cls: "flat" },
      },
    },
    yesterday: {
      label: "11 Aug 2026 → 11 Aug 2026 · NZST",
      from: "2026-08-11",
      to: "2026-08-11",
      values: {
        reliability: "96.9%",
        punctuality: "92.5%",
        cancellations: "1.6%",
        trips: "12,690",
      },
      deltas: {
        reliability: { text: "−0.1 pp", cls: "down" },
        punctuality: { text: "+0.8 pp", cls: "up" },
        cancellations: { text: "−0.1 pp", cls: "up" },
        trips: { text: "+40", cls: "flat" },
      },
    },
    week: {
      label: "6 Aug 2026 → 12 Aug 2026 · NZST",
      from: "2026-08-06",
      to: "2026-08-12",
      values: {
        reliability: "96.8%",
        punctuality: "90.1%",
        cancellations: "2.1%",
        trips: "86,200",
      },
      deltas: {
        reliability: { text: "+0.2 pp vs prior week", cls: "up" },
        punctuality: { text: "−0.7 pp vs prior week", cls: "down" },
        cancellations: { text: "+0.3 pp vs prior week", cls: "down" },
        trips: { text: "−1,100 vs prior week", cls: "flat" },
      },
    },
    month: {
      label: "1 Aug 2026 → 12 Aug 2026 · NZST",
      from: "2026-08-01",
      to: "2026-08-12",
      values: {
        reliability: "96.5%",
        punctuality: "89.7%",
        cancellations: "2.3%",
        trips: "148,900",
      },
      deltas: {
        reliability: { text: "−0.4 pp vs Jul window", cls: "down" },
        punctuality: { text: "−1.9 pp vs Jul window", cls: "down" },
        cancellations: { text: "+0.5 pp vs Jul window", cls: "down" },
        trips: { text: "partial month", cls: "flat" },
      },
    },
    all: {
      label: "Aug 2023 → Aug 2026 · NZST (illustrative)",
      from: "2023-08-01",
      to: "2026-08-12",
      values: {
        reliability: "95.9%",
        punctuality: "88.4%",
        cancellations: "2.7%",
        trips: "14.2M",
      },
      deltas: {
        reliability: { text: "no prior window", cls: "flat" },
        punctuality: { text: "no prior window", cls: "flat" },
        cancellations: { text: "no prior window", cls: "flat" },
        trips: { text: "all archived days", cls: "flat" },
      },
    },
  };

  const periodButtons = document.querySelectorAll("[data-period]");
  const compareBtn = document.querySelector("[data-compare]");
  const rangeEl = document.querySelector("#period-range");
  const fromInput = document.querySelector("#from");
  const toInput = document.querySelector("#to");
  const compareNote = document.querySelector("#compare-note");
  const compareSeries = document.querySelectorAll(".compare-series");
  const compareLegend = document.querySelectorAll(".compare-legend");

  function setCompare(on) {
    if (compareBtn) compareBtn.setAttribute("aria-pressed", String(on));
    if (compareNote) compareNote.hidden = !on;
    compareSeries.forEach((el) => {
      el.style.opacity = on ? "0.85" : "0.35";
    });
    compareLegend.forEach((el) => {
      el.hidden = !on;
    });
    document.querySelectorAll("[data-delta]").forEach((el) => {
      el.style.visibility = on ? "visible" : "hidden";
    });
  }

  function applyPeriod(key) {
    const p = periods[key];
    if (!p) return;
    periodButtons.forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.period === key));
    });
    if (rangeEl) rangeEl.textContent = p.label;
    if (fromInput) fromInput.value = p.from;
    if (toInput) toInput.value = p.to;
    Object.entries(p.values).forEach(([k, v]) => {
      const el = document.querySelector(`[data-metric="${k}"]`);
      if (el) el.textContent = v;
    });
    Object.entries(p.deltas).forEach(([k, d]) => {
      const el = document.querySelector(`[data-delta="${k}"]`);
      if (!el) return;
      el.textContent = d.text;
      el.classList.remove("up", "down", "flat");
      el.classList.add(d.cls);
    });
  }

  periodButtons.forEach((btn) => {
    btn.addEventListener("click", () => applyPeriod(btn.dataset.period));
  });

  if (compareBtn) {
    compareBtn.addEventListener("click", () => {
      const next = compareBtn.getAttribute("aria-pressed") !== "true";
      setCompare(next);
    });
    // Default: hide deltas until compare is on (overview feels cleaner)
    if (document.querySelector("[data-metric]")) setCompare(false);
  }

  document.querySelectorAll("[data-metric-chip]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-metric-chip]").forEach((b) => {
        b.setAttribute("aria-pressed", String(b === btn));
      });
    });
  });

  const sampleSql = document.querySelector("#sql")?.value;
  const runSql = document.querySelector("#run-sql");
  const resetSql = document.querySelector("#reset-sql");
  const downloadCsv = document.querySelector("#download-csv");
  const tbody = document.querySelector("#result-table tbody");

  if (runSql && tbody) {
    runSql.addEventListener("click", () => {
      tbody.innerHTML = `
        <tr>
          <td>2026-08-01</td><td>83</td>
          <td class="num">0.861</td><td class="num">0.970</td><td class="num">0.018</td>
        </tr>
        <tr>
          <td>2026-08-05</td><td>83</td>
          <td class="num">0.794</td><td class="num">0.948</td><td class="num">0.041</td>
        </tr>
        <tr>
          <td>2026-08-12</td><td>83</td>
          <td class="num">0.824</td><td class="num">0.961</td><td class="num">0.029</td>
        </tr>`;
    });
  }

  if (resetSql && sampleSql) {
    resetSql.addEventListener("click", () => {
      document.querySelector("#sql").value = sampleSql;
    });
  }

  if (downloadCsv) {
    downloadCsv.addEventListener("click", () => {
      alert("Prototype: CSV download would export the current result set.");
    });
  }
})();
