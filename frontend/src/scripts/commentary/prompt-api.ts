import { COMMENTARY_SYSTEM_PROMPT } from "./system";
import { formatBrief } from "./brief";
import { getFallbackText } from "./fallback";
import type {
  CommentaryBrief,
  CommentaryChunk,
  CommentaryResult,
  LanguageModelAvailability,
} from "./types";

interface LanguageModelPrompt {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LanguageModelCreateOptions {
  expectedInputs: Array<{ type: "text"; languages: string[] }>;
  expectedOutputs: Array<{ type: "text"; languages: string[] }>;
  initialPrompts?: LanguageModelPrompt[];
  monitor?: (monitor: EventTarget) => void;
  signal?: AbortSignal;
}

interface LanguageModelSession {
  promptStreaming(prompt: string, options?: { signal?: AbortSignal }): AsyncIterable<string>;
  destroy?(): void;
}

interface LanguageModelStatic {
  availability(options: LanguageModelCreateOptions): Promise<Exclude<LanguageModelAvailability, "unsupported">>;
  create(options: LanguageModelCreateOptions): Promise<LanguageModelSession>;
}

function getLanguageModel(): LanguageModelStatic | null {
  if (!("LanguageModel" in globalThis)) return null;
  return (globalThis as { LanguageModel?: LanguageModelStatic }).LanguageModel ?? null;
}

const MODEL_OPTIONS = {
  expectedInputs: [{ type: "text" as const, languages: ["en"] }],
  expectedOutputs: [{ type: "text" as const, languages: ["en"] }],
};

export async function getLanguageModelAvailability(): Promise<LanguageModelAvailability> {
  const LanguageModel = getLanguageModel();
  if (!LanguageModel) return "unsupported";
  try {
    return await LanguageModel.availability(MODEL_OPTIONS);
  } catch {
    return "unavailable";
  }
}

function scopeLabel(scope: CommentaryBrief["scope"]): string {
  return scope === "network" ? "network day" : "route period";
}

export async function generateCommentary(
  brief: CommentaryBrief,
  options: { onChunk?: (chunk: CommentaryChunk) => void; signal?: AbortSignal } = {},
): Promise<CommentaryResult> {
  const availability = await getLanguageModelAvailability();
  if (availability === "unsupported" || availability === "unavailable") {
    return {
      text: getFallbackText(brief),
      source: "fallback",
      availability,
    };
  }

  const LanguageModel = getLanguageModel();
  if (!LanguageModel) {
    return {
      text: getFallbackText(brief),
      source: "fallback",
      availability: "unsupported",
    };
  }

  const session = await LanguageModel.create({
    ...MODEL_OPTIONS,
    initialPrompts: [
      { role: "system", content: COMMENTARY_SYSTEM_PROMPT },
      {
        role: "user",
        content: `${formatBrief(brief.stats)}\n\nCaption what these ${scopeLabel(brief.scope)} stats communicate. Do not recommend riding the route.`,
      },
    ],
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => {
        const loaded = (event as ProgressEvent).loaded;
        if (typeof loaded === "number") {
          options.onChunk?.({ type: "download", loaded });
        }
      });
    },
    signal: options.signal,
  });

  try {
    const stream = session.promptStreaming("Write the caption now.", {
      signal: options.signal,
    });
    let text = "";
    for await (const chunk of stream) {
      if (typeof chunk !== "string") continue;
      if (chunk.startsWith(text)) text = chunk;
      else text += chunk;
      options.onChunk?.({ type: "text", text });
    }
    const usedFallback = !text;
    return {
      text: text || getFallbackText(brief),
      source: usedFallback ? "fallback" : "language-model",
      availability,
    };
  } finally {
    session.destroy?.();
  }
}
