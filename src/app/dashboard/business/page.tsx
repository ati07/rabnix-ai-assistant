import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessConfig } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";
import {
  BusinessConfigForm,
  type BusinessConfigInitial,
} from "@/components/dashboard/business-config-form";

export default async function BusinessPage() {
  const tenant = await requireTenant();

  const config = await db.query.businessConfig.findFirst({
    where: eq(businessConfig.tenantId, tenant.id),
  });

  const initial: BusinessConfigInitial = {
    businessType: config?.businessType ?? "other",
    displayName: config?.displayName ?? tenant.name,
    timezone: config?.timezone ?? "UTC",
    persona: config?.persona ?? "",
    hours: config?.hours ?? {},
    services: (config?.services ?? []).map((s) => ({
      name: s.name,
      description: s.description ?? "",
      price: s.price ?? "",
      duration: s.duration ?? "",
    })),
    faqs: config?.faqs ?? [],
    policies: config?.policies ?? "",
    languages: config?.languages ?? ["en"],
    systemPromptOverride: config?.systemPromptOverride ?? "",
    llmProvider: config?.llmProvider ?? "gemini",
    llmModel: config?.llmModel ?? "",
    autoReplyEnabled: config?.autoReplyEnabled ?? true,
    leadCaptureEnabled: config?.leadCaptureEnabled ?? true,
    leadFollowups: config?.leadFollowups ?? { enabled: false, steps: [] },
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Business profile</h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        This is the logic your AI assistant uses to answer customers.
      </p>
      <BusinessConfigForm initial={initial} />
    </div>
  );
}
