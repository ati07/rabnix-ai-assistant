import type { leadStatusEnum } from "@/lib/db/schema";

export type LeadStatus = (typeof leadStatusEnum.enumValues)[number];

/** Ordered funnel stages with their display labels. */
export const LEAD_STATUSES: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = Object.fromEntries(
  LEAD_STATUSES.map((s) => [s.value, s.label]),
) as Record<LeadStatus, string>;
