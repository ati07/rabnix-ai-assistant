import type { businessConfig } from "@/lib/db/schema";
import { env } from "@/lib/env";
import type { LlmProvider } from "../provider";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";

type BusinessConfig = typeof businessConfig.$inferSelect;

/**
 * Resolve the LLM provider for a tenant from its `business_config`.
 *
 * Falls back to the deployment default (`DEFAULT_LLM_PROVIDER`) when the tenant
 * has not chosen one. Each provider lives in its own file and uses its own SDK —
 * OpenAI, when added, goes in `./openai.ts` using the `openai` SDK and must
 * never import the Anthropic SDK.
 */
export function getProvider(
  config: Pick<BusinessConfig, "llmProvider" | "llmModel">,
): LlmProvider {
  const provider = config.llmProvider ?? env.DEFAULT_LLM_PROVIDER;
  const model = config.llmModel ?? undefined;

  switch (provider) {
    case "gemini":
      return new GeminiProvider({ model });
    case "anthropic":
      return new AnthropicProvider({ model });
    case "openai":
      throw new Error(
        "OpenAI provider not implemented yet. Add src/lib/ai/providers/openai.ts (using the `openai` SDK) and wire it here.",
      );
    default:
      throw new Error(`Unknown LLM provider: ${provider as string}`);
  }
}
