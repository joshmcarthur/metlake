import { getFallbackText } from "./fallback";
import { generateCommentary } from "./prompt-api";
import type { CommentaryBrief } from "./types";

export interface CommentaryPanelOptions {
  /** When true (default), generate as soon as a stats brief is available / updated. */
  autoGenerate?: boolean;
}

export interface CommentaryPanel {
  updateBrief(brief: CommentaryBrief): void;
}

function renderPanelShell(root: HTMLElement): void {
  root.classList.add("ai-panel", "ai-panel--lead");
  root.innerHTML = `<div class="ai-commentary" data-ai-output aria-live="polite"></div>`;
}

export function mountCommentaryPanel(
  root: HTMLElement,
  initialBrief?: CommentaryBrief,
  options: CommentaryPanelOptions = {},
): CommentaryPanel {
  const autoGenerate = options.autoGenerate !== false;
  let brief = initialBrief;
  let controller: AbortController | null = null;
  let runToken = 0;
  let mounted = false;

  const getOutput = () => root.querySelector<HTMLElement>("[data-ai-output]");

  function ensureShell(): void {
    if (mounted) return;
    renderPanelShell(root);
    mounted = true;
  }

  async function runGenerate(): Promise<void> {
    if (!brief) return;
    ensureShell();

    const output = getOutput();
    const token = ++runToken;

    controller?.abort();
    controller = new AbortController();
    if (output) output.textContent = "";

    try {
      const result = await generateCommentary(brief, {
        signal: controller.signal,
        onChunk: (event) => {
          if (token !== runToken) return;
          if (event.type === "text" && event.text && output) {
            output.textContent = event.text;
          }
        },
      });

      if (token !== runToken) return;
      if (output) output.textContent = result.text;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (token !== runToken) return;
      console.error(error);
      if (output) output.textContent = getFallbackText(brief);
    }
  }

  if (brief) {
    ensureShell();
    if (autoGenerate) void runGenerate();
  }

  return {
    updateBrief(nextBrief: CommentaryBrief) {
      brief = nextBrief;
      ensureShell();
      if (autoGenerate) void runGenerate();
    },
  };
}
