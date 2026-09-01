"use client";

import { useState, useTransition } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  saveBusinessConfig,
  type BusinessConfigInput,
} from "@/app/dashboard/business/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DAYS = [
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
] as const;

type DayKey = (typeof DAYS)[number][0];

type Service = { name: string; description: string; price: string; duration: string };
type Faq = { q: string; a: string };
type DayHours = { open: string; close: string; closed: boolean };
type FollowupStep = { afterHours: number; message: string };
type LeadFollowups = { enabled: boolean; steps: FollowupStep[] };

const DEFAULT_FOLLOWUP_STEPS: FollowupStep[] = [
  {
    afterHours: 24,
    message:
      "Hi! Just checking in — did you still want help with what we discussed? Happy to answer any questions.",
  },
  {
    afterHours: 72,
    message:
      "Following up one more time in case this got buried. Let me know if there's anything I can do for you!",
  },
];

export interface BusinessConfigInitial {
  businessType: BusinessConfigInput["businessType"];
  displayName: string;
  timezone: string;
  persona: string;
  hours: Record<string, [string, string][]>;
  services: Service[];
  faqs: Faq[];
  policies: string;
  languages: string[];
  systemPromptOverride: string;
  llmProvider: BusinessConfigInput["llmProvider"];
  llmModel: string;
  autoReplyEnabled: boolean;
  leadCaptureEnabled: boolean;
  leadFollowups: LeadFollowups;
}

function initialHours(hours: Record<string, [string, string][]>): Record<DayKey, DayHours> {
  const out = {} as Record<DayKey, DayHours>;
  for (const [key] of DAYS) {
    const interval = hours[key]?.[0];
    out[key] = interval
      ? { open: interval[0], close: interval[1], closed: false }
      : { open: "09:00", close: "17:00", closed: !hours[key] };
  }
  return out;
}

export function BusinessConfigForm({ initial }: { initial: BusinessConfigInitial }) {
  const [pending, startTransition] = useTransition();

  const [businessType, setBusinessType] = useState(initial.businessType);
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [persona, setPersona] = useState(initial.persona);
  const [policies, setPolicies] = useState(initial.policies);
  const [languages, setLanguages] = useState(initial.languages.join(", "));
  const [systemPromptOverride, setSystemPromptOverride] = useState(
    initial.systemPromptOverride,
  );
  const [llmProvider, setLlmProvider] = useState(initial.llmProvider);
  const [llmModel, setLlmModel] = useState(initial.llmModel);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(initial.autoReplyEnabled);
  const [leadCaptureEnabled, setLeadCaptureEnabled] = useState(
    initial.leadCaptureEnabled,
  );
  const [followupsEnabled, setFollowupsEnabled] = useState(
    initial.leadFollowups.enabled,
  );
  const [followupSteps, setFollowupSteps] = useState<FollowupStep[]>(
    initial.leadFollowups.steps,
  );
  const [hours, setHours] = useState(() => initialHours(initial.hours));
  const [services, setServices] = useState<Service[]>(initial.services);
  const [faqs, setFaqs] = useState<Faq[]>(initial.faqs);

  function setDay(day: DayKey, patch: Partial<DayHours>) {
    setHours((h) => ({ ...h, [day]: { ...h[day], ...patch } }));
  }

  function onSave() {
    const hoursOut: Record<string, [string, string][]> = {};
    for (const [key] of DAYS) {
      const d = hours[key];
      hoursOut[key] = d.closed ? [] : [[d.open, d.close]];
    }

    const payload: BusinessConfigInput = {
      businessType,
      displayName: displayName.trim(),
      timezone: timezone.trim(),
      persona,
      hours: hoursOut,
      services: services
        .filter((s) => s.name.trim())
        .map((s) => ({
          name: s.name.trim(),
          description: s.description,
          price: s.price,
          duration: s.duration,
        })),
      faqs: faqs.filter((f) => f.q.trim() && f.a.trim()),
      policies,
      languages: languages
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean),
      systemPromptOverride,
      llmProvider,
      llmModel,
      autoReplyEnabled,
      leadCaptureEnabled,
      leadFollowups: {
        enabled: followupsEnabled,
        steps: followupSteps
          .filter((s) => s.message.trim())
          .map((s) => ({
            afterHours: Number.isFinite(s.afterHours) ? s.afterHours : 0,
            message: s.message.trim(),
          })),
      },
    };

    startTransition(async () => {
      const res = await saveBusinessConfig(payload);
      if (res.ok) toast.success("Business profile saved");
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-6">
      {/* Basics */}
      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="displayName">Business name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Acme Dental Clinic"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="businessType">Business type</Label>
            <Select
              value={businessType}
              onValueChange={(v) => setBusinessType(v as typeof businessType)}
            >
              <SelectTrigger id="businessType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clinic">Clinic / Healthcare</SelectItem>
                <SelectItem value="real_estate">Real estate</SelectItem>
                <SelectItem value="school">School</SelectItem>
                <SelectItem value="shop">Shop / Retail</SelectItem>
                <SelectItem value="restaurant">Restaurant</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Asia/Karachi"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="languages">Languages (comma-separated)</Label>
            <Input
              id="languages"
              value={languages}
              onChange={(e) => setLanguages(e.target.value)}
              placeholder="en, ur"
            />
          </div>
        </CardContent>
      </Card>

      {/* Persona */}
      <Card>
        <CardHeader>
          <CardTitle>Persona &amp; tone</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            rows={4}
            placeholder="Friendly and professional. Speak concisely, confirm details before booking, and never give medical advice beyond scheduling."
          />
        </CardContent>
      </Card>

      {/* Hours */}
      <Card>
        <CardHeader>
          <CardTitle>Opening hours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {DAYS.map(([key, label]) => {
            const d = hours[key];
            return (
              <div key={key} className="flex flex-wrap items-center gap-3">
                <span className="w-24 text-sm font-medium">{label}</span>
                <Switch
                  checked={!d.closed}
                  onCheckedChange={(v) => setDay(key, { closed: !v })}
                  aria-label={`${label} open`}
                />
                {d.closed ? (
                  <span className="text-sm text-muted-foreground">Closed</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={d.open}
                      onChange={(e) => setDay(key, { open: e.target.value })}
                      className="w-32"
                    />
                    <span className="text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={d.close}
                      onChange={(e) => setDay(key, { close: e.target.value })}
                      className="w-32"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Services */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Services &amp; products</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setServices((s) => [...s, { name: "", description: "", price: "", duration: "" }])
            }
          >
            <Plus className="size-4" /> Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {services.length === 0 && (
            <p className="text-sm text-muted-foreground">No services yet.</p>
          )}
          {services.map((s, i) => (
            <div key={i} className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={s.name}
                  onChange={(e) =>
                    setServices((arr) =>
                      arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                  placeholder="Service name (e.g. Teeth cleaning)"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setServices((arr) => arr.filter((_, j) => j !== i))}
                  aria-label="Remove service"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={s.price}
                  onChange={(e) =>
                    setServices((arr) =>
                      arr.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)),
                    )
                  }
                  placeholder="Price (e.g. Rs 3000)"
                />
                <Input
                  value={s.duration}
                  onChange={(e) =>
                    setServices((arr) =>
                      arr.map((x, j) => (j === i ? { ...x, duration: e.target.value } : x)),
                    )
                  }
                  placeholder="Duration (e.g. 30 min)"
                />
              </div>
              <Textarea
                value={s.description}
                onChange={(e) =>
                  setServices((arr) =>
                    arr.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)),
                  )
                }
                rows={2}
                placeholder="Short description (optional)"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* FAQs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>FAQs</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFaqs((f) => [...f, { q: "", a: "" }])}
          >
            <Plus className="size-4" /> Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {faqs.length === 0 && (
            <p className="text-sm text-muted-foreground">No FAQs yet.</p>
          )}
          {faqs.map((f, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={f.q}
                  onChange={(e) =>
                    setFaqs((arr) =>
                      arr.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)),
                    )
                  }
                  placeholder="Question"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setFaqs((arr) => arr.filter((_, j) => j !== i))}
                  aria-label="Remove FAQ"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <Textarea
                value={f.a}
                onChange={(e) =>
                  setFaqs((arr) =>
                    arr.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)),
                  )
                }
                rows={2}
                placeholder="Answer"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Policies */}
      <Card>
        <CardHeader>
          <CardTitle>Policies</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={policies}
            onChange={(e) => setPolicies(e.target.value)}
            rows={4}
            placeholder="Cancellation, refund, and other policies the assistant should honor."
          />
        </CardContent>
      </Card>

      {/* Leads */}
      <Card>
        <CardHeader>
          <CardTitle>Leads &amp; follow-ups</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="pr-4">
              <p className="font-medium">Capture contact details</p>
              <p className="text-sm text-muted-foreground">
                Let the assistant naturally ask new customers for their name and
                email early in a chat, so you can follow up later. It always
                respects a decline.
              </p>
            </div>
            <Switch
              checked={leadCaptureEnabled}
              onCheckedChange={setLeadCaptureEnabled}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="pr-4">
              <p className="font-medium">Automated follow-ups</p>
              <p className="text-sm text-muted-foreground">
                Nurture quiet leads on a schedule until they reply or you mark
                them won/lost. Day-later follow-ups deliver by{" "}
                <strong>email</strong> (WhatsApp can only be messaged inside the
                24-hour window), so capturing an email matters.
              </p>
            </div>
            <Switch
              checked={followupsEnabled}
              onCheckedChange={setFollowupsEnabled}
            />
          </div>

          {followupsEnabled && (
            <div className="space-y-4">
              {followupSteps.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No follow-up steps yet — add one below or start from a
                  suggested sequence.
                </p>
              )}
              {followupSteps.map((step, i) => (
                <div key={i} className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor={`followup-hours-${i}`}
                      className="text-sm font-medium"
                    >
                      Send after
                    </Label>
                    <Input
                      id={`followup-hours-${i}`}
                      type="number"
                      min={0}
                      max={8760}
                      value={String(step.afterHours)}
                      onChange={(e) =>
                        setFollowupSteps((arr) =>
                          arr.map((x, j) =>
                            j === i
                              ? { ...x, afterHours: Number(e.target.value) }
                              : x,
                          ),
                        )
                      }
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">
                      hours (from when the lead was captured)
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="ml-auto"
                      onClick={() =>
                        setFollowupSteps((arr) => arr.filter((_, j) => j !== i))
                      }
                      aria-label="Remove follow-up step"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <Textarea
                    value={step.message}
                    onChange={(e) =>
                      setFollowupSteps((arr) =>
                        arr.map((x, j) =>
                          j === i ? { ...x, message: e.target.value } : x,
                        ),
                      )
                    }
                    rows={2}
                    placeholder="Message to send…"
                  />
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFollowupSteps((arr) => [
                      ...arr,
                      { afterHours: 24, message: "" },
                    ])
                  }
                >
                  <Plus className="size-4" /> Add step
                </Button>
                {followupSteps.length === 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFollowupSteps(DEFAULT_FOLLOWUP_STEPS)}
                  >
                    Use suggested sequence (+24h, +72h)
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI settings */}
      <Card>
        <CardHeader>
          <CardTitle>AI settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-medium">Auto-reply</p>
              <p className="text-sm text-muted-foreground">
                Let the assistant reply to customers automatically.
              </p>
            </div>
            <Switch checked={autoReplyEnabled} onCheckedChange={setAutoReplyEnabled} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="llmProvider">LLM provider</Label>
              <Select
                value={llmProvider}
                onValueChange={(v) => setLlmProvider(v as typeof llmProvider)}
              >
                <SelectTrigger id="llmProvider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">Google (Gemini)</SelectItem>
                  <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="llmModel">Model (optional)</Label>
              <Input
                id="llmModel"
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                placeholder="gemini-flash-latest"
              />
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="systemPromptOverride">
              System prompt override (advanced)
            </Label>
            <Textarea
              id="systemPromptOverride"
              value={systemPromptOverride}
              onChange={(e) => setSystemPromptOverride(e.target.value)}
              rows={4}
              placeholder="Leave blank to use the generated prompt from the fields above."
            />
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 flex justify-end border-t bg-background/80 py-4 backdrop-blur">
        <Button onClick={onSave} disabled={pending}>
          <Save className="size-4" /> {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
