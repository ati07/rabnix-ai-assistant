import Link from "next/link";
import { Sparkles } from "lucide-react";

/**
 * Slim banner nudging Free (or lapsed-Pro) tenants toward the billing page.
 * Rendered above dashboard content; hidden entirely for active Pro tenants.
 */
export function UpgradeBanner({ lapsed = false }: { lapsed?: boolean }) {
  return (
    <Link
      href="/dashboard/billing"
      className="mb-6 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm transition-colors hover:bg-primary/10"
    >
      <Sparkles className="size-4 shrink-0 text-primary" />
      <span className="flex-1">
        {lapsed ? (
          <>
            Your Pro subscription has lapsed — you&apos;re back on Free limits.{" "}
            <span className="font-medium text-primary">Renew Pro →</span>
          </>
        ) : (
          <>
            You&apos;re on the Free plan.{" "}
            <span className="font-medium text-primary">
              Upgrade to Pro for unlimited channels, team, and knowledge →
            </span>
          </>
        )}
      </span>
    </Link>
  );
}
