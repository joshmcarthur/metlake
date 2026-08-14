import { commentaryCache } from "./cache";
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

type AiState = "waiting" | "streaming" | "ready";

function renderPanelShell(root: HTMLElement): void {
  root.classList.add("ai-rail");
  root.innerHTML = `
    <div class="ai-rail__header">
      <p class="ai-rail__label" aria-hidden="true">Commentary</p>
      <span class="ai-rail__cue" aria-hidden="true"></span>
    </div>
    <div class="ai-commentary" data-ai-output aria-live="polite"></div>
  `;
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

  function setState(state: AiState): void {
    root.dataset.aiState = state;
    const output = getOutput();
    if (output) {
      output.setAttribute("aria-busy", state === "ready" ? "false" : "true");
    }
  }

  function ensureShell(): void {
    if (mounted) return;
    renderPanelShell(root);
    mounted = true;
  }

  function settle(output: HTMLElement | null, text: string): void {
    if (output) output.textContent = text;
    setState("ready");
  }

  async function runGenerate(): Promise<void> {
    if (!brief) return;
    const current = brief;
    ensureShell();

    const output = getOutput();
    const token = ++runToken;

    controller?.abort();
    controller = new AbortController();

    const cached = commentaryCache.get(current);
    if (cached) {
      settle(output, cached);
      return;
    }

    if (output) output.textContent = "";
    setState("waiting");

    try {
      const result = await generateCommentary(current, {
        signal: controller.signal,
        onChunk: (event) => {
          if (token !== runToken) return;
          if (event.type === "text" && event.text && output) {
            output.textContent = event.text;
            if (root.dataset.aiState !== "streaming") {
              setState("streaming");
            }
          }
        },
      });

      if (token !== runToken) return;
      if (result.source === "language-model") {
        commentaryCache.set(current, result.text);
      }
      settle(output, result.text);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (token !== runToken) return;
      console.error(error);
      settle(output, getFallbackText(current));
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
