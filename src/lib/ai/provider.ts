/**
 * Neutral, provider-agnostic LLM contract.
 *
 * This file MUST stay free of any concrete SDK import (`@anthropic-ai/sdk`,
 * `openai`, …). It is the boundary the rest of the app codes against so that a
 * tenant can run on Claude, OpenAI, or anything else without the brain, tools,
 * or prompt builder changing. Each concrete provider lives in
 * `./providers/<name>.ts` and translates these neutral types to/from its own
 * SDK.
 */

/** A single turn of prior conversation. History is text-only — tool exchanges
 * happen inside a single {@link LlmProvider.run} call and never need to be
 * reconstructed from stored history. */
export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * The system prompt, split for prompt caching.
 *
 * `stable` is the frozen prefix (business identity, persona, rules) — providers
 * that support caching mark it cacheable. `volatile` is everything that changes
 * per request (current time, customer context, retrieved RAG) and must come
 * AFTER the cache breakpoint so it never invalidates the cached prefix.
 */
export interface SystemPrompt {
  stable: string;
  volatile?: string;
}

/** A JSON-Schema-described tool the model may call. SDK-neutral. */
export interface LlmToolSpec {
  name: string;
  /** Prescriptive "call this when…" description — models under-reach for tools
   * without an explicit trigger stated here. */
  description: string;
  /** JSON Schema for the tool input. */
  inputSchema: Record<string, unknown>;
}

/** A tool invocation the model requested. */
export interface ToolInvocation {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** The result of executing a {@link ToolInvocation}, fed back to the model. */
export interface LlmToolResult {
  /** Human/model-readable result. Serialize structured data to JSON. */
  content: string;
  /** Mark true when the tool failed so the model can recover. */
  isError?: boolean;
}

/**
 * Executes one tool the model asked for. Supplied by the caller (the brain) so
 * that DB writes, approval gates, and logging stay outside the provider.
 */
export type ToolExecutor = (call: ToolInvocation) => Promise<LlmToolResult>;

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface LlmRunRequest {
  system: SystemPrompt;
  /** Prior conversation, oldest first. Does not include the system prompt. */
  messages: LlmMessage[];
  /** Tools the model may call this turn. Pass `[]` to disable tool use. */
  tools?: LlmToolSpec[];
  /** Response ceiling. Providers pick a sensible default when omitted. */
  maxTokens?: number;
  /** Hard cap on agentic loop iterations (safety net). Default 8. */
  maxTurns?: number;
}

export interface LlmRunResult {
  /** The model's final natural-language answer. */
  text: string;
  /** Every tool the model invoked across the loop, in order (for logging). */
  toolCalls: ToolInvocation[];
  /** Provider stop reason (normalized best-effort). */
  stopReason: string;
  usage?: LlmUsage;
}

/**
 * A concrete LLM backend. `run` drives the full agentic loop internally:
 * it calls the model, hands any requested tools to `executeTool`, feeds the
 * results back, and repeats until the model produces a final answer.
 */
export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  /** The model that actually served the last request. Differs from `model` when
   * the provider auto-rotated to a fallback (e.g. on quota exhaustion). */
  readonly activeModel?: string;
  run(request: LlmRunRequest, executeTool: ToolExecutor): Promise<LlmRunResult>;
}
