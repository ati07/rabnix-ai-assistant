"use client";

import { useState, useRef } from "react";
import {
  Bot,
  Calendar,
  FileText,
  MessageSquare,
  Sparkles,
  TrendingUp,
  UserCheck,
  Shield,
  Clock,
  Send,
  Zap,
  RotateCcw,
  Smartphone,
  Globe,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type TabKey = "chat" | "knowledge" | "crm" | "calendar" | "analytics";

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  time: string;
  badge?: string;
  groundedIn?: string;
  latency?: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "m1",
    sender: "user",
    text: "Hi! Do you have an orthopedic consultation slot available with Dr. Sharma this Friday around 4 PM? Also what is the consultation fee?",
    time: "04:12 PM",
  },
  {
    id: "m2",
    sender: "ai",
    text: "Hello Rajesh! Yes, Dr. Sharma has an open slot this Friday at 4:00 PM for an Orthopedic Consultation.\n\nThe initial consultation fee is ₹800 (includes preliminary examination & report review). Would you like me to book this for you?",
    time: "04:12 PM",
    badge: "Checked schedule & fee doc",
    groundedIn: "Clinic_Services_Pricing_2026.pdf",
    latency: "1.2s",
  },
  {
    id: "m3",
    sender: "user",
    text: "Yes please, book that slot for me. My email is rajesh.verma@example.com.",
    time: "04:13 PM",
  },
  {
    id: "m4",
    sender: "ai",
    text: "🎉 All set! Your appointment with Dr. Sharma is confirmed for Friday, 4:00 PM (Ref #APPT-8492).\n\nWe've sent a calendar invite to rajesh.verma@example.com and locked the slot in our database so no one else can take it.",
    time: "04:13 PM",
    badge: "Appointment Confirmed #APPT-8492",
    latency: "1.4s",
  },
];

const PRESET_PROMPTS = [
  {
    label: "Ask refund policy",
    prompt: "What is your appointment cancellation and refund policy?",
    response: "According to our policy, you can reschedule or cancel with a full refund up to 24 hours before your scheduled appointment. Cancellations within 24 hours can be rescheduled once for free.",
    groundedIn: "Cancellation_Refund_Policy.pdf",
  },
  {
    label: "Book Physiotherapy",
    prompt: "Can I book a 45-min Physiotherapy session for tomorrow at 5 PM?",
    response: "Dr. Priya is available tomorrow at 5:00 PM for a 45-minute Physiotherapy session (₹1,200). Shall I lock this slot for you?",
    groundedIn: "Doctor_Specializations_FAQs.docx",
  },
  {
    label: "Ask Sunday hours",
    prompt: "Are you open on Sundays for emergency consults?",
    response: "Our clinic is open Monday to Saturday, 9:00 AM to 8:00 PM. For urgent Sunday needs, we have on-call emergency triage available via WhatsApp.",
    groundedIn: "Clinic_Services_Pricing_2026.pdf",
  },
];

export function LandingInteractivePreview() {
  const [activeTab, setActiveTab] = useState<TabKey>("chat");
  const [channel, setChannel] = useState<"whatsapp" | "web">("whatsapp");
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const counterRef = useRef(100);

  const handleSendMessage = (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || isTyping) return;

    counterRef.current += 1;
    const currentCount = counterRef.current;
    const userMsg: ChatMessage = {
      id: `u-${currentCount}`,
      sender: "user",
      text: text.trim(),
      time: "Just now",
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsTyping(true);

    // Simulate AI grounded response
    setTimeout(() => {
      const matched = PRESET_PROMPTS.find(
        (p) => text.toLowerCase().includes(p.label.toLowerCase()) || p.prompt.toLowerCase().includes(text.toLowerCase())
      );

      let responseText = matched?.response;
      const groundedSource = matched?.groundedIn || "Verified_Clinic_Knowledge.pdf";

      if (!responseText) {
        if (text.toLowerCase().includes("book") || text.toLowerCase().includes("appointment") || text.toLowerCase().includes("slot")) {
          responseText = "I've checked our live calendar. We have slots available on Friday at 4:00 PM and Saturday at 11:30 AM. Which one works best for you?";
        } else if (text.toLowerCase().includes("cost") || text.toLowerCase().includes("price") || text.toLowerCase().includes("fee")) {
          responseText = "Our standard consultation is ₹800, and specialized follow-ups start at ₹500 as documented in our 2026 service pricing list.";
        } else {
          responseText = `Based on our clinic knowledge base, here is what I found: We offer comprehensive medical, diagnostic, and therapy appointments with verified staff. Would you like to schedule a visit?`;
        }
      }

      const aiMsg: ChatMessage = {
        id: `ai-${currentCount + 1}`,
        sender: "ai",
        text: responseText,
        time: "Just now",
        badge: "RAG Fact-Grounded",
        groundedIn: groundedSource,
        latency: "1.1s",
      };

      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 1100);
  };

  const handleResetChat = () => {
    setMessages(INITIAL_MESSAGES);
    setInputText("");
    setIsTyping(false);
  };

  return (
    <div className="relative mx-auto w-full max-w-5xl rounded-2xl border border-border/80 bg-card/95 p-2 shadow-2xl backdrop-blur-xl transition-all md:p-5 dark:border-border/50 dark:bg-card/90">
      {/* Decorative ambient gradient backdrop */}
      <div className="pointer-events-none absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-primary/10 to-teal-500/10 blur-xl opacity-70" />

      {/* Top Window Bar */}
      <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3.5 px-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="size-3 rounded-full bg-red-500/80" />
            <div className="size-3 rounded-full bg-amber-500/80" />
            <div className="size-3 rounded-full bg-emerald-500/80" />
          </div>
          <span className="ml-2 rounded-md bg-muted/60 px-2.5 py-0.5 text-xs font-mono text-muted-foreground border border-border/40">
            app.rabnix.ai/workspace/demo
          </span>
        </div>

        {/* Tab Navigation Controls */}
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted/70 p-1 text-xs border border-border/40">
          <button
            onClick={() => setActiveTab("chat")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all",
              activeTab === "chat"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MessageSquare className="size-3.5 text-emerald-500" />
            Live Simulator
          </button>
          <button
            onClick={() => setActiveTab("knowledge")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all",
              activeTab === "knowledge"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="size-3.5 text-sky-500" />
            Knowledge Base RAG
          </button>
          <button
            onClick={() => setActiveTab("crm")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all",
              activeTab === "crm"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <UserCheck className="size-3.5 text-indigo-500" />
            Autonomous CRM
          </button>
          <button
            onClick={() => setActiveTab("calendar")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all",
              activeTab === "calendar"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Calendar className="size-3.5 text-amber-500" />
            Booking &amp; Calendar
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all",
              activeTab === "analytics"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <TrendingUp className="size-3.5 text-emerald-500" />
            Analytics
          </button>
        </div>
      </div>

      {/* Dynamic Tab Body */}
      <div className="relative mt-3 min-h-[420px] rounded-xl bg-background/90 p-4 md:p-6 border border-border/50 shadow-inner">
        {activeTab === "chat" && (
          <div className="grid gap-6 md:grid-cols-12">
            {/* Conversation list / Channel sidebar */}
            <div className="hidden flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 md:col-span-4 md:flex">
              <div className="flex items-center justify-between pb-2 border-b border-border/40">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Active Channels
                </span>
                <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync
                </Badge>
              </div>

              {/* Channel switcher buttons */}
              <div className="flex gap-1.5 rounded-lg bg-muted/50 p-1 border border-border/40 text-xs">
                <button
                  onClick={() => setChannel("whatsapp")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md font-medium transition-all",
                    channel === "whatsapp"
                      ? "bg-background text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Smartphone className="size-3.5 text-emerald-500" />
                  WhatsApp
                </button>
                <button
                  onClick={() => setChannel("web")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md font-medium transition-all",
                    channel === "web"
                      ? "bg-background text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Globe className="size-3.5 text-sky-500" />
                  Web Widget
                </button>
              </div>

              <div className="rounded-lg border border-primary/20 bg-accent/30 p-3 text-left text-xs transition-all hover:bg-accent/40">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">Dr. Priya Clinic</span>
                  <span className="text-[10px] text-muted-foreground">Just now</span>
                </div>
                <p className="mt-1 line-clamp-2 text-muted-foreground">
                  +91 98765 43210: &quot;Can I book Dr. Sharma for Friday 4pm?&quot;
                </p>
                <div className="mt-2.5 flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                    {channel === "whatsapp" ? "WhatsApp Cloud" : "Web Chat"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Sparkles className="size-3 text-primary" /> AI Active
                  </span>
                </div>
              </div>

              {/* Quick Preset Prompts */}
              <div className="mt-auto pt-3 border-t border-border/40">
                <span className="text-[11px] font-semibold text-muted-foreground block mb-2">
                  Try Clicking Sample Prompts:
                </span>
                <div className="flex flex-col gap-1.5">
                  {PRESET_PROMPTS.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(preset.prompt)}
                      disabled={isTyping}
                      className="text-left text-xs p-2 rounded-md bg-background/80 border border-border/50 hover:border-primary/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-all truncate"
                    >
                      💡 {preset.prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Interactive Chat Area */}
            <div className="flex flex-col justify-between rounded-lg border border-border/60 bg-card p-4 md:col-span-8 shadow-xs">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full font-bold text-xs shadow-xs",
                      channel === "whatsapp"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                        : "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30"
                    )}
                  >
                    {channel === "whatsapp" ? "WA" : "WEB"}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold leading-none text-foreground">
                      {channel === "whatsapp" ? "+91 98765 43210 (Rajesh Verma)" : "Online Visitor #4829"}
                    </h4>
                    <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      Channel: {channel === "whatsapp" ? "Meta WhatsApp Cloud API" : "Embeddable JS Widget"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleResetChat}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted border border-border/40 transition-colors"
                    title="Reset simulator conversation"
                  >
                    <RotateCcw className="size-3" />
                    Reset
                  </button>
                  <Badge variant="outline" className="text-xs font-normal">
                    Autonomous Mode
                  </Badge>
                </div>
              </div>

              {/* Chat messages container */}
              <div className="my-4 max-h-[290px] overflow-y-auto space-y-3.5 pr-1">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex",
                      msg.sender === "user" ? "justify-start" : "justify-end"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-2.5 text-xs md:text-sm shadow-xs",
                        msg.sender === "user"
                          ? "rounded-tl-xs bg-muted text-foreground border border-border/40"
                          : channel === "whatsapp"
                          ? "rounded-tr-xs bg-emerald-600 text-white dark:bg-emerald-700"
                          : "rounded-tr-xs bg-primary text-primary-foreground"
                      )}
                    >
                      {msg.badge && (
                        <div className="flex flex-wrap items-center gap-1.5 pb-1.5 text-[10px] font-medium opacity-90 border-b border-white/20 mb-1.5">
                          <Sparkles className="size-3 shrink-0" />
                          <span>{msg.badge}</span>
                          {msg.groundedIn && (
                            <span className="ml-auto opacity-75 font-mono text-[9px] bg-black/20 px-1.5 py-0.5 rounded">
                              {msg.groundedIn}
                            </span>
                          )}
                        </div>
                      )}

                      <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>

                      <div className="mt-1 flex items-center justify-end gap-2 text-[10px] opacity-75">
                        {msg.latency && <span>{msg.latency}</span>}
                        <span>{msg.time}</span>
                      </div>
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex justify-end">
                    <div className="flex items-center gap-2 rounded-2xl rounded-tr-xs bg-primary/20 px-4 py-3 text-xs text-foreground border border-primary/30">
                      <Loader2 className="size-3.5 animate-spin text-primary" />
                      <span>Rabnix AI is verifying calendar &amp; knowledge base...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Interactive Input form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2 rounded-lg border border-border/80 bg-muted/40 p-1.5 focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/20 transition-all"
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Type a test customer message (e.g. 'Can I book 4 PM?')..."
                  className="flex-1 bg-transparent px-3 py-1.5 text-xs md:text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden"
                  disabled={isTyping}
                />
                <button
                  type="submit"
                  disabled={isTyping || !inputText.trim()}
                  className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40 transition-all hover:scale-105 active:scale-95"
                >
                  <Send className="size-3.5" />
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === "knowledge" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Knowledge Base &amp; Full-Text RAG</h4>
                <p className="text-xs text-muted-foreground">Your AI only answers with facts extracted from verified business documents.</p>
              </div>
              <Badge variant="secondary" className="gap-1 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <Zap className="size-3 text-amber-500" />
                Postgres FTS + Vector Grounded
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border/60 bg-card p-3.5 transition-all hover:border-primary/40 hover:shadow-xs">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">Clinic_Services_Pricing_2026.pdf</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                    Indexed
                  </Badge>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  18 Chunks · Consultations, Diagnostics, Physiotherapy fee schedules.
                </p>
              </div>

              <div className="rounded-lg border border-border/60 bg-card p-3.5 transition-all hover:border-primary/40 hover:shadow-xs">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">Cancellation_Refund_Policy.pdf</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                    Indexed
                  </Badge>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  8 Chunks · Rescheduling guidelines, 24h refund protocol.
                </p>
              </div>

              <div className="rounded-lg border border-border/60 bg-card p-3.5 transition-all hover:border-primary/40 hover:shadow-xs">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">Doctor_Specializations_FAQs.docx</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                    Indexed
                  </Badge>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  24 Chunks · Timings, doctor bio, preparation guidelines.
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-muted/40 p-3.5 border border-border/40 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Shield className="size-3.5 text-primary" /> Strict Boundary Guarantee:
              </div>
              <p className="mt-1 text-muted-foreground leading-relaxed">
                If a customer asks a question not covered by your documents or business profile, Rabnix gracefully informs them and offers human escalation instead of inventing answers.
              </p>
            </div>
          </div>
        )}

        {activeTab === "crm" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Autonomous CRM &amp; Lead Capture</h4>
                <p className="text-xs text-muted-foreground">Contacts, tags, and conversation summaries automatically updated with each interaction.</p>
              </div>
              <Badge variant="outline" className="text-xs">
                Export to CSV / Excel
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border/40 text-muted-foreground">
                    <th className="pb-2 font-medium">Customer</th>
                    <th className="pb-2 font-medium">Channel</th>
                    <th className="pb-2 font-medium">Lead Stage</th>
                    <th className="pb-2 font-medium">Appointments</th>
                    <th className="pb-2 font-medium">Last Interaction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  <tr>
                    <td className="py-2.5">
                      <div className="font-semibold text-foreground">Rajesh Verma</div>
                      <div className="text-[11px] text-muted-foreground">+91 98765 43210</div>
                    </td>
                    <td className="py-2.5">
                      <Badge variant="secondary" className="text-[10px]">WhatsApp</Badge>
                    </td>
                    <td className="py-2.5">
                      <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                        Won / Booked
                      </Badge>
                    </td>
                    <td className="py-2.5 font-mono">1 Confirmed</td>
                    <td className="py-2.5 text-muted-foreground">Just now</td>
                  </tr>
                  <tr>
                    <td className="py-2.5">
                      <div className="font-semibold text-foreground">Ananya Roy</div>
                      <div className="text-[11px] text-muted-foreground">ananya.r@gmail.com</div>
                    </td>
                    <td className="py-2.5">
                      <Badge variant="secondary" className="text-[10px]">Web Chat</Badge>
                    </td>
                    <td className="py-2.5">
                      <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-[10px]">
                        Qualified
                      </Badge>
                    </td>
                    <td className="py-2.5 font-mono">—</td>
                    <td className="py-2.5 text-muted-foreground">12m ago</td>
                  </tr>
                  <tr>
                    <td className="py-2.5">
                      <div className="font-semibold text-foreground">Vikramaditya Mehta</div>
                      <div className="text-[11px] text-muted-foreground">+91 94432 10987</div>
                    </td>
                    <td className="py-2.5">
                      <Badge variant="secondary" className="text-[10px]">WhatsApp</Badge>
                    </td>
                    <td className="py-2.5">
                      <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px]">
                        Follow-Up Needed
                      </Badge>
                    </td>
                    <td className="py-2.5 font-mono">2 Completed</td>
                    <td className="py-2.5 text-muted-foreground">Yesterday</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "calendar" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Conflict-Free Appointment Scheduling</h4>
                <p className="text-xs text-muted-foreground">Strict transactional slot locking prevents double-booking across all staff members.</p>
              </div>
              <Badge variant="secondary" className="gap-1 text-xs">
                <Clock className="size-3" /> Real-time Availability
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary">Friday · 04:00 PM - 04:30 PM</span>
                  <Badge className="text-[10px] bg-emerald-500 text-white">Confirmed</Badge>
                </div>
                <div className="mt-2 text-xs">
                  <p className="font-medium text-foreground">Orthopedic Consultation</p>
                  <p className="text-muted-foreground">Staff: Dr. Sharma · Patient: Rajesh Verma</p>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
                  <Bot className="size-3 text-primary" /> Booked autonomously via WhatsApp AI
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-card p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Friday · 05:00 PM - 05:45 PM</span>
                  <Badge variant="outline" className="text-[10px]">Scheduled</Badge>
                </div>
                <div className="mt-2 text-xs">
                  <p className="font-medium text-foreground">Physiotherapy Followup</p>
                  <p className="text-muted-foreground">Staff: Dr. Priya · Patient: Simran Kaur</p>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
                  <Bot className="size-3 text-primary" /> Booked autonomously via Web Widget
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Executive Performance Metrics</h4>
                <p className="text-xs text-muted-foreground">Real-time resolution rates, message volume, and staff time saved.</p>
              </div>
              <Badge variant="outline" className="text-xs">Past 30 Days</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-border/50 bg-card p-3 text-center">
                <span className="text-xs text-muted-foreground">Conversations</span>
                <p className="mt-1 text-xl font-bold tracking-tight text-foreground">1,248</p>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">↑ 24% vs last mo</span>
              </div>
              <div className="rounded-lg border border-border/50 bg-card p-3 text-center">
                <span className="text-xs text-muted-foreground">AI Resolution Rate</span>
                <p className="mt-1 text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">94.8%</p>
                <span className="text-[10px] text-muted-foreground">No human needed</span>
              </div>
              <div className="rounded-lg border border-border/50 bg-card p-3 text-center">
                <span className="text-xs text-muted-foreground">Appointments Booked</span>
                <p className="mt-1 text-xl font-bold tracking-tight text-foreground">412</p>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">389 by AI brain</span>
              </div>
              <div className="rounded-lg border border-border/50 bg-card p-3 text-center">
                <span className="text-xs text-muted-foreground">Avg Reply Latency</span>
                <p className="mt-1 text-xl font-bold tracking-tight text-foreground">1.8s</p>
                <span className="text-[10px] text-muted-foreground">24/7 round-the-clock</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
