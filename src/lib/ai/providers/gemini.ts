import {
  GoogleGenAI,
  type Content,
  type FunctionDeclaration,
  type GenerateContentResponse,
  type Part,
  type Schema,
} from "@google/genai";
import { env } from "@/lib/env";
import type {
  LlmProvider,
  LlmRunRequest,
  LlmRunResult,
  LlmToolSpec,
  LlmUsage,
  ToolExecutor,
  ToolInvocation,
} from "../provider";

/**
 * Google Gemini implementation of {@link LlmProvider}.
 *
 * This is the ONLY file that may import `@google/genai`. It runs the manual
 * agentic tool-use loop so the brain keeps control over side effects, approval,
 * and logging via the `executeTool` callback — mirroring the Anthropic provider
 * so the two are interchangeable behind the neutral seam.
 */

// Default model — Flash is fast + cheap and covers the free tier. The `-latest`
// alias tracks the current stable Flash so it won't 404 as versions roll (pinned
// versions like gemini-2.5-flash get retired for new accounts). Override per
// tenant via `business_config.llm_model`, or deployment-wide via GEMINI_MODEL.
export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

// Automatic rotation chain. The free tier caps requests PER MODEL PER DAY, so
// when one model is exhausted we transparently fall back to the next. Ordered
// quality-first, ending with the high-quota Flash-Lite tier (≈500/day) so the
// assistant practically never runs fully dry. The tenant's configured model is
// always tried first (prepended in `modelChain`), even if not listed here.
export const MODEL_FALLBACK_CHAIN = [
  "gemini-3-flash-preview",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
] as const;

const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_MAX_TURNS = 8;

/**
 * Per-model cooldown after a quota (429) rejection, shared across all requests
 * in this process. A model in cooldown is skipped by {@link GeminiProvider} until
 * its window expires — a daily-cap model sits out until the quota resets
 * (Pacific midnight), a per-minute cap only briefly. This is per-process (fine
 * for the single Node worker); a multi-instance deploy would move it to Redis.
 */
const modelCooldownUntil = new Map<string, number>();

function isCooledDown(model: string): boolean {
  const until = modelCooldownUntil.get(model);
  return until != null && Date.now() < until;
}

function coolDown(model: string, ms: number): void {
  modelCooldownUntil.set(model, Date.now() + ms);
}

/** Classify a thrown error as a quota hit and, if so, whether it's the daily or
 * per-minute bucket, plus any server-suggested retry delay (ms). */
function classifyQuotaError(err: unknown): {
  isQuota: boolean;
  daily: boolean;
  retryMs: number;
} {
  const status = (err as { status?: number; code?: number })?.status ??
    (err as { code?: number })?.code;
  const blob = (() => {
    try {
      return typeof err === "string" ? err : JSON.stringify(err);
    } catch {
      return String((err as { message?: string })?.message ?? err);
    }
  })();
  const isQuota = status === 429 || /RESOURCE_EXHAUSTED|"code":\s*429/.test(blob);
  const daily = /PerDay/i.test(blob);
  const m = blob.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
  const retryMs = m ? Math.ceil(parseFloat(m[1]) * 1000) : 0;
  return { isQuota, daily, retryMs };
}

/** Milliseconds until the next Pacific midnight, when free-tier daily quotas
 * reset. Uses wall-clock deltas so it's DST-safe. Floored at 1 minute. */
function msUntilPacificReset(): number {
  const now = new Date();
  const la = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
  );
  const nextMidnight = new Date(la);
  nextMidnight.setHours(24, 0, 5, 0); // +5s buffer past the boundary
  return Math.max(60_000, nextMidnight.getTime() - la.getTime());
}

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";
  /** The tenant's configured (primary) model — always tried first. */
  readonly model: string;
  /** The model that actually produced the last response (may differ from
   * `model` after an automatic fallback). Read by the brain for message meta. */
  activeModel: string;
  private readonly client: GoogleGenAI;

  constructor(opts?: { model?: string; apiKey?: string }) {
    this.model = opts?.model?.trim() || env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    this.activeModel = this.model;
    const apiKey = opts?.apiKey || env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set. Add it to .env to use the Gemini provider (get one at https://aistudio.google.com/apikey).",
      );
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  async run(
    request: LlmRunRequest,
    executeTool: ToolExecutor,
  ): Promise<LlmRunResult> {
    // Gemini takes the system prompt as a single instruction; we join the
    // stable + volatile halves (no separate cache breakpoint like Anthropic —
    // Gemini 2.5 applies implicit context caching automatically).
    const systemInstruction = [request.system.stable, request.system.volatile]
      .filter(Boolean)
      .join("\n\n");

    const functionDeclarations = (request.tools ?? []).map(toFunctionDeclaration);
    const contents: Content[] = request.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const toolCalls: ToolInvocation[] = [];
    const maxTurns = request.maxTurns ?? DEFAULT_MAX_TURNS;

    let finalText = "";
    let stopReason = "stop";
    let usage: LlmUsage | undefined;

    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await this.generateWithFallback({
        contents,
        config: {
          systemInstruction,
          maxOutputTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          ...(functionDeclarations.length > 0
            ? { tools: [{ functionDeclarations }] }
            : {}),
        },
      });

      usage = accumulateUsage(usage, response);
      const candidate = response.candidates?.[0];
      stopReason = normalizeStop(candidate?.finishReason) ?? stopReason;

      const parts = candidate?.content?.parts ?? [];
      // Preserve the model turn verbatim so tool calls and any text stay in the
      // running history for the next iteration.
      contents.push({ role: "model", parts });

      const text = parts
        .filter((p): p is Part & { text: string } => typeof p.text === "string")
        .map((p) => p.text)
        .join("");
      if (text) finalText = text;

      const calls = parts.filter(
        (p): p is Part & { functionCall: NonNullable<Part["functionCall"]> } =>
          Boolean(p.functionCall),
      );

      if (calls.length === 0) break;

      const responseParts: Part[] = [];
      for (const [i, p] of calls.entries()) {
        const fc = p.functionCall;
        const call: ToolInvocation = {
          id: fc.id ?? `${fc.name}-${turn}-${i}`,
          name: fc.name ?? "",
          input: (fc.args ?? {}) as Record<string, unknown>,
        };
        toolCalls.push(call);
        const result = await executeTool(call);
        responseParts.push({
          functionResponse: {
            ...(fc.id ? { id: fc.id } : {}),
            name: call.name,
            response: result.isError
              ? { error: result.content }
              : { result: result.content },
          },
        });
      }
      contents.push({ role: "user", parts: responseParts });
    }

    return { text: finalText, toolCalls, stopReason, usage };
  }

  /** The ordered list of models to try: the configured one first, then the
   * shared fallback chain, de-duplicated. */
  private modelChain(): string[] {
    const seen = new Set<string>();
    const chain: string[] = [];
    for (const m of [this.model, ...MODEL_FALLBACK_CHAIN]) {
      const name = m?.trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        chain.push(name);
      }
    }
    return chain;
  }

  /**
   * Call `generateContent`, rotating through {@link modelChain} on quota (429)
   * rejections. A rate-limited model is put in cooldown (until Pacific reset for
   * a daily cap, briefly for a per-minute cap) and skipped on later calls, so a
   * single exhausted model doesn't cost a failed request every time. Non-quota
   * errors propagate immediately.
   */
  private async generateWithFallback(params: {
    contents: Content[];
    config: Record<string, unknown>;
  }): Promise<GenerateContentResponse> {
    const chain = this.modelChain();
    // Prefer models not in cooldown; if every model is cooling, try them all
    // anyway (a cooldown may be stale, and a live attempt beats a hard failure).
    const ready = chain.filter((m) => !isCooledDown(m));
    const candidates = ready.length > 0 ? ready : chain;

    let lastErr: unknown;
    for (const model of candidates) {
      try {
        const response = await this.client.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });
        if (model !== this.activeModel) {
          console.warn(
            `[gemini] using model "${model}"${
              model === this.model ? "" : ` (fell back from "${this.model}")`
            }`,
          );
        }
        this.activeModel = model;
        return response;
      } catch (err) {
        const { isQuota, daily, retryMs } = classifyQuotaError(err);
        if (!isQuota) throw err;
        const cooldown = daily
          ? msUntilPacificReset()
          : Math.min(Math.max(retryMs, 30_000), 120_000);
        coolDown(model, cooldown);
        console.warn(
          `[gemini] "${model}" hit ${
            daily ? "daily" : "per-minute"
          } quota; cooling down ${Math.round(cooldown / 1000)}s and rotating`,
        );
        lastErr = err;
      }
    }
    throw (
      lastErr ??
      new Error("All Gemini models are rate-limited; try again shortly.")
    );
  }
}

/** Convert our neutral JSON-Schema tool spec to a Gemini function declaration. */
function toFunctionDeclaration(spec: LlmToolSpec): FunctionDeclaration {
  const schema = toGeminiSchema(spec.inputSchema);
  const hasParams =
    schema.properties && Object.keys(schema.properties).length > 0;
  return {
    name: spec.name,
    description: spec.description,
    // Gemini rejects an empty parameter object — omit it for no-arg tools.
    ...(hasParams ? { parameters: schema } : {}),
  };
}

/**
 * Translate a JSON Schema node to Gemini's OpenAPI-subset `Schema`. The main
 * differences: `type` must be an UPPERCASE enum, and only a subset of keywords
 * is supported.
 */
function toGeminiSchema(node: Record<string, unknown>): Schema {
  const out: Record<string, unknown> = {};
  if (typeof node.type === "string") out.type = node.type.toUpperCase();
  if (typeof node.description === "string") out.description = node.description;
  if (Array.isArray(node.enum)) out.enum = node.enum;
  if (Array.isArray(node.required)) out.required = node.required;
  if (node.properties && typeof node.properties === "object") {
    out.properties = Object.fromEntries(
      Object.entries(node.properties as Record<string, Record<string, unknown>>).map(
        ([k, v]) => [k, toGeminiSchema(v)],
      ),
    );
  }
  if (node.items && typeof node.items === "object") {
    out.items = toGeminiSchema(node.items as Record<string, unknown>);
  }
  return out as Schema;
}

function normalizeStop(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  // "STOP" -> "stop", "MAX_TOKENS" -> "max_tokens", etc.
  return reason.toLowerCase();
}

function accumulateUsage(
  prev: LlmUsage | undefined,
  response: GenerateContentResponse,
): LlmUsage {
  const u = response.usageMetadata;
  return {
    inputTokens: (prev?.inputTokens ?? 0) + (u?.promptTokenCount ?? 0),
    outputTokens: (prev?.outputTokens ?? 0) + (u?.candidatesTokenCount ?? 0),
    cacheReadTokens:
      (prev?.cacheReadTokens ?? 0) + (u?.cachedContentTokenCount ?? 0),
    cacheWriteTokens: prev?.cacheWriteTokens ?? 0,
  };
}
