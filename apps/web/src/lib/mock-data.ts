import { getMeetingById, listMeetings } from "@/lib/meetings-catalog";

export const stats = [
  { label: "Meetings this week", value: "24", delta: "+18%", tone: "up" as const },
  { label: "AI answers pinned", value: "86", delta: "+12%", tone: "up" as const },
  { label: "Hours transcribed", value: "41.2", delta: "+9%", tone: "up" as const },
  { label: "Action items closed", value: "63%", delta: "+4%", tone: "up" as const },
];

/** Meeting list cards — sourced from the meetings catalog (single source of truth). */
export const recentMeetings = listMeetings();

export const activity = [
  { id: 1, text: "Pinned answer from Q3 Product Sync", time: "12m ago" },
  { id: 2, text: "Resume version v3 exported as PDF", time: "1h ago" },
  { id: 3, text: "Knowledge base: 4 docs re-indexed", time: "3h ago" },
  { id: 4, text: "Translation session · EN ↔ HI completed", time: "Yesterday" },
];

export const usageSeries = [
  { day: "Mon", meetings: 4, tokens: 120 },
  { day: "Tue", meetings: 6, tokens: 180 },
  { day: "Wed", meetings: 3, tokens: 95 },
  { day: "Thu", meetings: 7, tokens: 210 },
  { day: "Fri", meetings: 5, tokens: 160 },
  { day: "Sat", meetings: 1, tokens: 40 },
  { day: "Sun", meetings: 2, tokens: 55 },
];

/** Default live-session transcript seed (Q3 Product Sync / m1). Prefer getMeetingById for meeting-scoped views. */
export const transcript = (getMeetingById("m1")?.transcript ?? []).map((line, index) => ({
  id: index + 1,
  speaker: line.speaker,
  role: line.role,
  text: line.text,
  time: line.time,
  confidence: line.confidence,
}));

export const aiAnswers = (getMeetingById("m1")?.aiAnswers ?? []).map((a) => ({
  id: a.id,
  question: a.question,
  answer: a.answer,
  pinned: a.pinned,
}));

export const actionItems = getMeetingById("m1")?.actionItems ?? [];

export const knowledgeDocs = [
  {
    id: "d1",
    name: "CueAI Security Whitepaper.pdf",
    folder: "Security",
    tags: ["SOC2", "Enterprise"],
    updated: "2d ago",
    size: "2.4 MB",
  },
  {
    id: "d2",
    name: "Pricing & Packaging Q3.md",
    folder: "GTM",
    tags: ["Pricing"],
    updated: "5d ago",
    size: "48 KB",
  },
  {
    id: "d3",
    name: "Companion Architecture.docx",
    folder: "Engineering",
    tags: ["Architecture"],
    updated: "1w ago",
    size: "1.1 MB",
  },
  {
    id: "d4",
    name: "Customer Objection Library.xlsx",
    folder: "Sales",
    tags: ["Objections", "Playbook"],
    updated: "3d ago",
    size: "320 KB",
  },
];

export const testimonials = [
  {
    quote:
      "CueAI feels like having a chief of staff in every meeting. The live answers are uncannily relevant.",
    name: "Sarah Kim",
    role: "VP Product, Northstar",
  },
  {
    quote:
      "We cut follow-up time by half. Summaries and action items land before people leave the call.",
    name: "James Okonkwo",
    role: "Head of Ops, Lumen",
  },
  {
    quote:
      "Enterprise admins finally get the controls they need without slowing the team down.",
    name: "Elena Rossi",
    role: "CISO, Helix Cloud",
  },
];

export const pricing = [
  {
    name: "Starter",
    price: "$29",
    period: "/seat/mo",
    desc: "For individuals who want an AI meeting edge.",
    features: ["Live transcription", "Meeting summaries", "5 hrs / month", "Basic knowledge base"],
    cta: "Start Free",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$79",
    period: "/seat/mo",
    desc: "For teams shipping with real-time AI copilots.",
    features: [
      "Everything in Starter",
      "Unlimited meetings",
      "Resume Tailor",
      "Desktop Companion",
      "Screen Context AI",
    ],
    cta: "Start Free",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    desc: "Security, admin, and scale for global orgs.",
    features: [
      "SSO / SCIM",
      "Admin portal",
      "Audit logs",
      "Retention policies",
      "Dedicated models",
    ],
    cta: "Book Demo",
    highlighted: false,
  },
];

export const faqs = [
  {
    q: "Does CueAI work with Zoom, Meet, and Teams?",
    a: "Yes. CueAI captures system audio via the Desktop Companion and works alongside Zoom, Google Meet, Microsoft Teams, and browser-based calls.",
  },
  {
    q: "Is my meeting data private?",
    a: "Meetings are encrypted in transit and at rest. Enterprise plans support private model endpoints, retention policies, and region locks.",
  },
  {
    q: "Can I use CueAI without screen sharing?",
    a: "Absolutely. Screen Context is opt-in. Core transcription and AI answers work from audio alone.",
  },
  {
    q: "Do you support Hindi and Telugu?",
    a: "Yes. Live bilingual transcription and AI response translation are available for English, Hindi, and Telugu.",
  },
];

export const adminUsers = [
  { name: "Alex Chen", email: "alex@acme.com", role: "Admin", status: "Active" },
  { name: "Priya Nair", email: "priya@acme.com", role: "Member", status: "Active" },
  { name: "Marcus Lee", email: "marcus@acme.com", role: "Member", status: "Active" },
  { name: "Jordan Blake", email: "jordan@acme.com", role: "Viewer", status: "Invited" },
];
