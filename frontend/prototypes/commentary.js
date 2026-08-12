/**
 * Chrome Prompt API (LanguageModel / Gemini Nano) commentary prototype.
 * Docs: https://developer.chrome.com/docs/ai/prompt-api
 *
 * Injects a compact stats brief (not raw Parquet) as system/user context so
 * the on-device model can narrate network or route performance.
 */
(() => {
  const SYSTEM = `You write short, plain-language commentary for Metlake, a
Wellington public transport history site. Audience: everyday riders and
curious locals — not data engineers.

Rules:
- Use ONLY the numbers and facts in the provided STATS brief.
- Do not invent routes, causes, or percentages.
- Prefer concrete comparisons (vs prior period, best/worst routes).
- Tone: clear, neutral, useful. NZ English spelling.
- Length: 2 short paragraphs, then one bullet "Worth watching" if useful.
- Never mention that you are an AI or that you received a STATS brief.`;

  /** Compact briefs — stand-ins for DuckDB aggregates in the real app. */
  const BRIEFS = {
    network: {
      title: "Network commentary",
      stats: {
        period: "2026-08-12",
        prior_period: "2026-08-11",
        reliability_pct: 97.2,
        punctuality_pct: 91.4,
        cancellations_pct: 1.8,
        scheduled_trips: 12480,
        vs_prior: {
          reliability_pp: 0.3,
          punctuality_pp: -1.1,
          cancellations_pp: 0.2,
        },
        best_punctuality: [
          { route: "2", name: "Karori South — Wellington", pct: 98.6 },
          { route: "60", name: "Porirua — Tawa — Johnsonville", pct: 97.9 },
        ],
        needs_attention: [
          { route: "83", name: "Eastbourne — Lower Hutt — Wellington", pct: 82.4 },
          { route: "1", name: "Island Bay — Wellington — Grenada North", pct: 84.1 },
        ],
        note: "Figures are Metlink published bus performance metrics, not live vehicle delays.",
      },
    },
    route83: {
      title: "Route 83 commentary",
      stats: {
        route: "83",
        name: "Eastbourne — Lower Hutt — Petone — Wellington",
        direction: "inbound",
        period: "2026-08-01 to 2026-08-12",
        punctuality_pct: 82.4,
        reliability_pct: 96.1,
        cancellations_pct: 2.9,
        vs_prior_month_pp: { punctuality: -3.1, reliability: 0.4, cancellations: 0.6 },
        delay_profile: {
          unit: "seconds_late_median",
          largest_injection: {
            from: "Petone Station",
            to: "Ngauranga",
            add_seconds: 92,
          },
          end_of_trip_median_seconds: 268,
          worst_hours: "07:00–09:00 weekdays",
        },
        recovery: {
          recovered_pct: 31,
          stayed_late_pct: 54,
          got_worse_pct: 15,
          rt_coverage_pct: 89,
        },
        note: "Delay profile is illustrative of GTFS-RT trip-update aggregates.",
      },
    },
  };

  const FALLBACK = {
    network: `Reliability held up on 12 August (97.2%), but punctuality eased to 91.4% — about a percentage point softer than the day before. Cancellations stayed low at 1.8%.

Routes 2 and 60 again sat near the top for punctuality. Route 83 remained the clearest soft spot at 82.4%, with Route 1 not far behind.

Worth watching: whether 83’s dip is a one-day blip or part of the month’s weaker stretch.`,
    route83: `Across early August, Route 83’s published punctuality sat at 82.4% — about three points below the prior month — while reliability stayed high (96.1%). Cancellations ticked up slightly.

On inbound trips, delay tended to build toward town, with the biggest average jump between Petone Station and Ngauranga (+92 seconds). Weekday mornings 7–9 looked busiest for lateness; only about a third of mid-route late trips recovered before the end.

Worth watching: that Petone–Ngauranga segment on weekday mornings.`,
  };

  function formatBrief(stats) {
    return `STATS (JSON)\n${JSON.stringify(stats, null, 2)}`;
  }

  function setStatus(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.dataset.kind = kind || "";
  }

  async function getAvailability() {
    if (!("LanguageModel" in self)) return "unsupported";
    try {
      return await LanguageModel.availability({
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
      });
    } catch {
      return "unavailable";
    }
  }

  async function generateCommentary(briefKey, { onChunk, signal } = {}) {
    const brief = BRIEFS[briefKey];
    if (!brief) throw new Error("Unknown brief");

    const availability = await getAvailability();
    if (availability === "unsupported" || availability === "unavailable") {
      return { text: FALLBACK[briefKey], source: "fallback", availability };
    }

    const session = await LanguageModel.create({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
      initialPrompts: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `${formatBrief(brief.stats)}\n\nWrite commentary for this ${briefKey === "network" ? "network day" : "route period"}.`,
        },
      ],
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => {
          onChunk?.({ type: "download", loaded: e.loaded });
        });
      },
      signal,
    });

    try {
      const stream = session.promptStreaming(
        "Go ahead with the commentary now.",
        { signal }
      );
      let text = "";
      for await (const chunk of stream) {
        // Some implementations yield cumulative strings; others yield deltas.
        if (typeof chunk === "string") {
          if (chunk.startsWith(text)) text = chunk;
          else text += chunk;
          onChunk?.({ type: "text", text });
        }
      }
      return { text: text || FALLBACK[briefKey], source: "language-model", availability };
    } finally {
      session.destroy?.();
    }
  }

  function mountPanel(root) {
    const briefKey = root.dataset.brief || "network";
    const brief = BRIEFS[briefKey];
    if (!brief) return;

    root.innerHTML = `
      <div class="viz-head">
        <h2>${brief.title}</h2>
        <p>On-device Chrome Prompt API · stats brief injected as context</p>
      </div>
      <p class="ai-status" data-ai-status>Checking on-device model…</p>
      <div class="ai-actions">
        <button type="button" class="btn primary-signal" data-ai-run>Generate commentary</button>
        <button type="button" class="btn secondary" data-ai-sample>Show sample</button>
        <button type="button" class="btn secondary" data-ai-brief>View stats brief</button>
      </div>
      <pre class="ai-brief hidden" data-ai-brief-view>${formatBrief(brief.stats).replace(/</g, "&lt;")}</pre>
      <div class="ai-output" data-ai-output aria-live="polite"></div>
    `;

    const status = root.querySelector("[data-ai-status]");
    const output = root.querySelector("[data-ai-output]");
    const briefView = root.querySelector("[data-ai-brief-view]");
    const runBtn = root.querySelector("[data-ai-run]");
    let controller = null;

    getAvailability().then((a) => {
      if (a === "unsupported") {
        setStatus(
          status,
          "Chrome Prompt API not detected — sample commentary still works. Needs a recent Chrome with on-device Gemini Nano.",
          "warn"
        );
      } else if (a === "unavailable") {
        setStatus(status, "LanguageModel present but unavailable on this device.", "warn");
      } else if (a === "downloadable" || a === "downloading") {
        setStatus(
          status,
          `Model status: ${a}. First run may download Gemini Nano (on-device, private).`,
          "ok"
        );
      } else {
        setStatus(status, `Model ready (${a}). Commentary stays on your device.`, "ok");
      }
    });

    root.querySelector("[data-ai-sample]").addEventListener("click", () => {
      output.textContent = FALLBACK[briefKey];
      setStatus(status, "Showing canned sample (no model call).", "ok");
    });

    root.querySelector("[data-ai-brief]").addEventListener("click", () => {
      briefView.classList.toggle("hidden");
    });

    runBtn.addEventListener("click", async () => {
      controller?.abort();
      controller = new AbortController();
      runBtn.disabled = true;
      output.textContent = "";
      setStatus(status, "Generating…", "ok");
      try {
        const result = await generateCommentary(briefKey, {
          signal: controller.signal,
          onChunk: (evt) => {
            if (evt.type === "download") {
              setStatus(status, `Downloading model… ${Math.round(evt.loaded * 100)}%`, "ok");
            } else if (evt.type === "text") {
              output.textContent = evt.text;
            }
          },
        });
        output.textContent = result.text;
        if (result.source === "fallback") {
          setStatus(
            status,
            "Used sample text — on-device model not available. Brief below is what we would inject.",
            "warn"
          );
          briefView.classList.remove("hidden");
        } else {
          setStatus(status, "Generated on-device from the injected stats brief.", "ok");
        }
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.error(err);
        output.textContent = FALLBACK[briefKey];
        setStatus(status, `Error: ${err.message || err}. Showing sample instead.`, "warn");
      } finally {
        runBtn.disabled = false;
      }
    });
  }

  document.querySelectorAll("[data-ai-commentary]").forEach(mountPanel);
})();
