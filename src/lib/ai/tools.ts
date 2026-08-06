import type { LlmToolSpec } from "./provider";

/**
 * The assistant's tool catalogue (SDK-neutral JSON Schema).
 *
 * Descriptions are deliberately prescriptive — they state WHEN the model should
 * call each tool, because models under-reach for tools when the trigger is only
 * implied. The concrete DB/side-effect implementations are wired by the brain's
 * tool executor (Phases 3–4); here we only declare the contract.
 */

export const TOOL_NAMES = [
  "search_knowledge",
  "get_customer",
  "update_customer",
  "check_availability",
  "book_appointment",
  "notify_staff",
  "schedule_reminder",
  "escalate_to_human",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const tools: LlmToolSpec[] = [
  {
    name: "search_knowledge",
    description:
      "Search the business's uploaded knowledge base (documents, policies, product info). Call this WHENEVER the customer asks something that might be answered by the business's own material and is not already covered in your system prompt — before ever saying you don't know.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "A focused natural-language search query capturing what the customer wants to know.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_customer",
    description:
      "Look up the current customer's saved CRM record (name, email, tags, notes, past visits). Call this at the start of a conversation, or whenever you need details you don't already have about who you're talking to.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "update_customer",
    description:
      "Save or correct details about the current customer in the CRM. Call this when the customer tells you their name, email, or another lasting fact worth remembering for next time.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        notes: {
          type: "string",
          description: "Freeform note to append about this customer.",
        },
      },
    },
  },
  {
    name: "check_availability",
    description:
      "Check open appointment slots for a service before offering or confirming any time. Call this ALWAYS before booking — never promise a slot you have not verified here.",
    inputSchema: {
      type: "object",
      properties: {
        serviceName: {
          type: "string",
          description: "The service the customer wants to book.",
        },
        date: {
          type: "string",
          description: "Preferred date in YYYY-MM-DD (tenant timezone).",
        },
        staffName: {
          type: "string",
          description:
            "Optional specific staff member the customer requested.",
        },
      },
      required: ["serviceName", "date"],
    },
  },
  {
    name: "book_appointment",
    description:
      "Book an appointment into an available slot. Call this only AFTER check_availability confirmed the exact start time is free and the customer has agreed to it.",
    inputSchema: {
      type: "object",
      properties: {
        serviceName: { type: "string" },
        startAt: {
          type: "string",
          description: "ISO 8601 start datetime with timezone offset.",
        },
        staffName: { type: "string" },
        notes: { type: "string" },
      },
      required: ["serviceName", "startAt"],
    },
  },
  {
    name: "notify_staff",
    description:
      "Send an alert to the business's staff (dashboard + their configured channels). Call this when something needs a human's attention now — a new booking, an urgent request, or a message the customer wants escalated.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: {
          type: "string",
          description: "What staff need to know, including any customer detail.",
        },
      },
      required: ["title", "body"],
    },
  },
  {
    name: "schedule_reminder",
    description:
      "Schedule a future WhatsApp reminder to the customer (e.g. an appointment reminder). Call this after booking, or whenever the customer asks to be reminded about something at a specific time.",
    inputSchema: {
      type: "object",
      properties: {
        sendAt: {
          type: "string",
          description: "ISO 8601 datetime when the reminder should be sent.",
        },
        message: {
          type: "string",
          description: "The reminder text to send the customer.",
        },
        appointmentId: {
          type: "string",
          description: "Optional appointment this reminder is tied to.",
        },
      },
      required: ["sendAt", "message"],
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Hand the conversation to a human team member. Call this for complaints, sensitive matters, anything outside your knowledge or tools, or whenever the customer explicitly asks to speak to a person. Then tell the customer a team member will follow up.",
    inputSchema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Why this needs a human, for the staff who pick it up.",
        },
      },
      required: ["reason"],
    },
  },
];
