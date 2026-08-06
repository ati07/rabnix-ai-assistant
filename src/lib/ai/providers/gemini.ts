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

const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_MAX_TURNS = 8;

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";
  readonly model: string;
  private readonly client: GoogleGenAI;

  constructor(opts?: { model?: string; apiKey?: string }) {
    this.model = opts?.model?.trim() || env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
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
      const response: GenerateContentResponse =
        await this.client.models.generateContent({
          model: this.model,
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
