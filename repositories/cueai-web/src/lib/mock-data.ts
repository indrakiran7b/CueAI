/**
 * Marketing content for the public landing page only.
 * No workspace/demo meetings, metrics, or fake users.
 */

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
