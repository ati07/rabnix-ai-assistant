import Anthropic from "@anthropic-ai/sdk";
import type {
  LlmProvider,
  LlmRunRequest,
  LlmRunResult,
  ToolExecutor,
  ToolInvocation,
} from "../provider";

/**
 * Claude implementation of {@link LlmProvider}.
 *
 * This is the ONLY file that may import `@anthropic-ai/sdk`. It runs the manual
 * agentic tool-use loop so the brain keeps control over side effects, approval,
 * and logging via the `executeTool` callback. Prompt caching is applied to the
 * stable system prefix; the volatile suffix is sent as a separate, uncached
 * block after the cache breakpoint.
 */

// Default model — do NOT downgrade without an explicit tenant/user instruction.
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8";

const DEFAULT_MAX_TOKENS = 16000;
const DEFAULT_MAX_TURNS = 8;

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly client: Anthropic;

  constructor(opts?: { model?: string; apiKey?: string }) {
    this.model = opts?.model?.trim() || DEFAULT_ANTHROPIC_MODEL;
    // `new Anthropic()` resolves ANTHROPIC_API_KEY from the environment; only
    // pass an explicit key when a per-tenant override is supplied.
    this.client = new Anthropic(opts?.apiKey ? { apiKey: opts.apiKey } : {});
  }

  async run(
    request: LlmRunRequest,
    executeTool: ToolExecutor,
  ): Promise<LlmRunResult> {
    const system = this.buildSystem(request);
    const tools = (request.tools ?? []).map(toAnthropicTool);
    const messages: Anthropic.MessageParam[] = request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const toolCalls: ToolInvocation[] = [];
    const maxTurns = request.maxTurns ?? DEFAULT_MAX_TURNS;

    let finalText = "";
    let stopReason = "end_turn";
    let usage: LlmRunResult["usage"];

    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        system,
        messages,
        ...(tools.length > 0 ? { tools } : {}),
      });

      usage = accumulateUsage(usage, response.usage);
      stopReason = response.stop_reason ?? stopReason;

      // Preserve the assistant turn verbatim (incl. thinking + tool_use blocks)
      // so multi-turn continuity and thinking signatures are maintained.
      messages.push({ role: "assistant", content: response.content });

      // `pause_turn` (long server-side tool work) — just continue the loop.
      if (response.stop_reason === "pause_turn") continue;

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (text) finalText = text;

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        break;
      }

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const call: ToolInvocation = {
          id: tu.id,
          name: tu.name,
          input: (tu.input ?? {}) as Record<string, unknown>,
        };
        toolCalls.push(call);
        const result = await executeTool(call);
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: result.content,
          is_error: result.isError,
        });
      }
      messages.push({ role: "user", content: results });
    }

    return { text: finalText, toolCalls, stopReason, usage };
  }

  /** Render the system prompt as cache-optimized text blocks. */
  private buildSystem(request: LlmRunRequest): Anthropic.TextBlockParam[] {
    const blocks: Anthropic.TextBlockParam[] = [
      {
        type: "text",
        text: request.system.stable,
        // Cache the stable prefix. Everything after this breakpoint (the
        // volatile block below + the messages) is not part of the cached prefix.
        cache_control: { type: "ephemeral" },
      },
    ];
    if (request.system.volatile?.trim()) {
      blocks.push({ type: "text", text: request.system.volatile });
    }
    return blocks;
  }
}

function toAnthropicTool(spec: {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}): Anthropic.Tool {
  return {
    name: spec.name,
    description: spec.description,
    input_schema: spec.inputSchema as Anthropic.Tool.InputSchema,
  };
}

function accumulateUsage(
  prev: LlmRunResult["usage"],
  u: Anthropic.Usage | undefined,
): LlmRunResult["usage"] {
  if (!u) return prev;
  return {
    inputTokens: (prev?.inputTokens ?? 0) + (u.input_tokens ?? 0),
    outputTokens: (prev?.outputTokens ?? 0) + (u.output_tokens ?? 0),
    cacheReadTokens:
      (prev?.cacheReadTokens ?? 0) + (u.cache_read_input_tokens ?? 0),
    cacheWriteTokens:
      (prev?.cacheWriteTokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
  };
}
