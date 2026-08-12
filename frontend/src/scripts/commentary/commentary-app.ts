import { formatBrief } from "./brief";
import { getFallbackText } from "./fallback";
import { generateCommentary, getLanguageModelAvailability } from "./prompt-api";
import type { CommentaryBrief } from "./types";

export interface CommentaryPanel {
  updateBrief(brief: CommentaryBrief): void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(el: HTMLElement | null, text: string, kind: "" | "warn" | "ok" = ""): void {
  if (!el) return;
  el.textContent = text;
  if (kind) el.dataset.kind = kind;
  else delete el.dataset.kind;
}

async function syncModelStatus(status: HTMLElement | null): Promise<void> {
  const availability = await getLanguageModelAvailability();
  if (availability === "unsupported") {
    setStatus(
      status,
      "Chrome Prompt API not detected — sample commentary still works. Needs a recent Chrome with on-device Gemini Nano.",
      "warn",
    );
  } else if (availability === "unavailable") {
    setStatus(status, "LanguageModel present but unavailable on this device.", "warn");
  } else if (availability === "downloadable" || availability === "downloading") {
    setStatus(
      status,
      `Model status: ${availability}. First run may download Gemini Nano (on-device, private).`,
      "ok",
    );
  } else {
    setStatus(status, `Model ready (${availability}). Commentary stays on your device.`, "ok");
  }
}

function renderPanelShell(root: HTMLElement, brief: CommentaryBrief): void {
  root.innerHTML = `
    <div class="viz-head">
      <h2 data-ai-title>${escapeHtml(brief.title)}</h2>
      <p>On-device Chrome Prompt API · stats brief injected as context</p>
    </div>
    <p class="ai-status" data-ai-status>Checking on-device model…</p>
    <div class="ai-actions">
      <button type="button" class="btn primary-signal" data-ai-run>Generate commentary</button>
      <button type="button" class="btn secondary" data-ai-sample>Show sample</button>
      <button type="button" class="btn secondary" data-ai-brief>View stats brief</button>
    </div>
    <pre class="ai-brief hidden" data-ai-brief-view hidden></pre>
    <div class="ai-output" data-ai-output aria-live="polite"></div>
  `;
}

export function mountCommentaryPanel(root: HTMLElement, initialBrief?: CommentaryBrief): CommentaryPanel {
  let brief = initialBrief;
  let controller: AbortController | null = null;

  if (brief) renderPanelShell(root, brief);

  const getStatus = () => root.querySelector<HTMLElement>("[data-ai-status]");
  const getOutput = () => root.querySelector<HTMLElement>("[data-ai-output]");
  const getBriefView = () => root.querySelector<HTMLElement>("[data-ai-brief-view]");
  const getRunBtn = () => root.querySelector<HTMLButtonElement>("[data-ai-run]");

  function syncBriefView(): void {
    if (!brief) return;
    const title = root.querySelector<HTMLElement>("[data-ai-title]");
    const briefView = getBriefView();
    if (title) title.textContent = brief.title;
    if (briefView) briefView.textContent = formatBrief(brief.stats);
  }

  function bindActions(): void {
    const status = getStatus();
    const output = getOutput();
    const briefView = getBriefView();
    const runBtn = getRunBtn();

    void syncModelStatus(status);

    root.querySelector("[data-ai-sample]")?.addEventListener("click", () => {
      if (!brief) return;
      if (output) output.textContent = getFallbackText(brief);
      setStatus(status, "Showing canned sample (no model call).", "ok");
    });

    root.querySelector("[data-ai-brief]")?.addEventListener("click", () => {
      if (!briefView) return;
      const hidden = briefView.hasAttribute("hidden");
      if (hidden) briefView.removeAttribute("hidden");
      else briefView.setAttribute("hidden", "");
      briefView.classList.toggle("hidden", !hidden);
    });

    runBtn?.addEventListener("click", async () => {
      if (!brief || !runBtn) return;

      controller?.abort();
      controller = new AbortController();
      runBtn.disabled = true;
      if (output) output.textContent = "";
      setStatus(status, "Generating…", "ok");

      try {
        const result = await generateCommentary(brief, {
          signal: controller.signal,
          onChunk: (event) => {
            if (event.type === "download" && typeof event.loaded === "number") {
              setStatus(status, `Downloading model… ${Math.round(event.loaded * 100)}%`, "ok");
            } else if (event.type === "text" && event.text && output) {
              output.textContent = event.text;
            }
          },
        });

        if (output) output.textContent = result.text;
        if (result.source === "fallback") {
          setStatus(
            status,
            "Used sample text — on-device model not available. Brief below is what we would inject.",
            "warn",
          );
          briefView?.removeAttribute("hidden");
          briefView?.classList.remove("hidden");
        } else {
          setStatus(status, "Generated on-device from the injected stats brief.", "ok");
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          void syncModelStatus(status);
          return;
        }
        console.error(error);
        if (output) output.textContent = getFallbackText(brief);
        const message = error instanceof Error ? error.message : String(error);
        setStatus(status, `Error: ${message}. Showing sample instead.`, "warn");
      } finally {
        runBtn.disabled = false;
      }
    });
  }

  if (brief) {
    syncBriefView();
    bindActions();
  }

  return {
    updateBrief(nextBrief: CommentaryBrief) {
      const firstMount = !brief;
      brief = nextBrief;
      if (firstMount) {
        renderPanelShell(root, brief);
        syncBriefView();
        bindActions();
        return;
      }
      syncBriefView();
    },
  };
}
