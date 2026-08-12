const RT_NOTE =
  "Needs RT derives — trip-update aggregates are not published yet.";

export function renderDisabledRtCharts(): void {
  const hourRoot = document.getElementById("net-hour-heat");
  const corridorRoot = document.getElementById("net-corridors");

  if (hourRoot) {
    hourRoot.className = "heatmap chart-slot-disabled";
    hourRoot.innerHTML = `<p class="rt-stub-note">${RT_NOTE}</p>`;
  }

  if (corridorRoot) {
    corridorRoot.className = "chart-slot-disabled";
    corridorRoot.innerHTML = `<p class="rt-stub-note">${RT_NOTE}</p>`;
  }
}
