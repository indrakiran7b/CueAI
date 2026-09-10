export type TabId = "home" | "live" | "meetings" | "knowledge" | "resume" | "settings";

export type CopilotMode = "assist" | "suggest" | "followup" | "recap";

export interface Meeting {
  id: string;
  title: string;
  time: string;
  participants: string[];
  status: "live" | "upcoming" | "done";
  platform: string;
}

export interface ActionItem {
  text: string;
  owner: string;
  due: string;
  done?: boolean;
}

export type MeetingRecordStatus = "live" | "summary-ready";

export interface MeetingRecord {
  id: string;
  title: string;
  day: string;
  time: string;
  duration: string;
  attendees: number;
  tags: string[];
  status: MeetingRecordStatus;
  platform: string;
  generatedIn?: string;
  executiveSummary: string;
  decisions: string[];
  risks: string[];
  openQuestions: string[];
  actions: ActionItem[];
  transcript: string;
  followUpEmail: string;
}

export type DocCategory = "Product" | "Sales" | "Support FAQ" | "Q&A" | "Web";
export type DocFormat = "PDF" | "DOCX" | "TXT" | "MD" | "URL" | "Q&A";
export type IndexStatus = "indexed" | "indexing" | "needs-reindex";

export interface KnowledgeDoc {
  id: string;
  title: string;
  category: DocCategory;
  format: DocFormat;
  updated: string;
  snippets: number;
  status: IndexStatus;
}

export const meetings: Meeting[] = [
  {
    id: "m1",
    title: "Enterprise Security Review",
    time: "Now · 38 min",
    participants: ["You", "Priya N.", "Marcus L."],
    status: "live",
    platform: "Google Meet",
  },
  {
    id: "m2",
    title: "Product sync — CueAI MVP",
    time: "Today · 3:30 PM",
    participants: ["You", "Aisha", "Dev"],
    status: "upcoming",
    platform: "Zoom",
  },
  {
    id: "m3",
    title: "Support triage",
    time: "Yesterday",
    participants: ["You", "Support pod"],
    status: "done",
    platform: "Teams",
  },
];

export const meetingHistory: MeetingRecord[] = [
  {
    id: "mh1",
    title: "Q3 Product Sync",
    day: "Today",
    time: "10:00 AM",
    duration: "42m",
    attendees: 8,
    tags: ["Product", "Roadmap"],
    status: "summary-ready",
    platform: "Google Meet",
    generatedIn: "18s",
    executiveSummary:
      "The team aligned on a three-phase enterprise rollout for CueAI Companion. Latency SLOs were set at p95 under 800ms for live suggestions. Screen Context will remain opt-in with explicit privacy controls. SSO / SCIM is deferred to Phase 3 pending Security review.",
    decisions: [
      "Ship Companion glass panel in two sprints",
      "Keep Screen Context opt-in for enterprise",
      "Defer deep RAG when confidence < 0.7",
    ],
    risks: ["Latency may spike on low-bandwidth enterprise VPNs."],
    openQuestions: ["Which region locks are required for EU workspaces?"],
    actions: [
      { text: "Finalize Companion latency SLOs", owner: "Marcus Lee", due: "Aug 12", done: false },
      { text: "Draft opt-in privacy copy for screen capture", owner: "Alex Chen", due: "Aug 10", done: false },
      { text: "Share enterprise SSO checklist with Security", owner: "Priya Nair", due: "Aug 14", done: true },
    ],
    transcript: `[00:02] Priya Nair: Let's lock the Companion rollout phases before we leave.
[00:08] Marcus Lee: Phase 1 should be glass panel + Assist only. Latency target — p95 under 800ms.
[00:21] You: Agreed. Screen Context stays opt-in with explicit consent for enterprise.
[00:34] Alex Chen: I'll draft the privacy copy this week.
[00:48] Priya Nair: SSO and SCIM move to Phase 3 after Security signs off.
[01:05] Marcus Lee: If RAG confidence drops below 0.7, we should defer the answer and surface a follow-up.
[01:22] You: Action items — Marcus owns SLOs, Alex owns privacy copy, Priya shares the SSO checklist.
[01:40] Priya Nair: Great. Summary ready after the call.`,
    followUpEmail:
      "Subject: Q3 Product Sync — decisions and next steps\n\nHi team,\n\nWe aligned on a three-phase Companion rollout, opt-in Screen Context, and deferred SSO/SCIM to Phase 3. Action owners: Marcus (SLOs), Alex (privacy copy), Priya (SSO checklist).\n\nThanks,\nCueAI Product",
  },
  {
    id: "mh2",
    title: "Enterprise Security Review",
    day: "Today",
    time: "11:30 AM",
    duration: "38m",
    attendees: 6,
    tags: ["Security", "Enterprise"],
    status: "live",
    platform: "Google Meet",
    generatedIn: "live",
    executiveSummary:
      "Security is reviewing CueAI Companion for enterprise deploy. Focus areas: Presenter Privacy Mode during screen share, data residency, and SSO readiness. Live session still in progress — partial summary below.",
    decisions: [
      "Treat Presenter Privacy as a hard requirement for enterprise pilots",
      "Document on-device vs cloud transcription paths",
    ],
    risks: ["Pilot blocked if residency region is unclear."],
    openQuestions: ["Can admin policy enforce Privacy Mode org-wide?"],
    actions: [
      { text: "Share architecture threat model", owner: "You", due: "Today", done: false },
      { text: "Confirm EU region options", owner: "Priya Nair", due: "Aug 13", done: false },
    ],
    transcript: `[LIVE] Ongoing — Enterprise Security Review
[00:04] Security lead: Walk us through Presenter Privacy during entire screen share.
[00:12] You: Privacy Mode hides the CueAI panel from capture; consent banner is required before Screen Context.
[00:28] Priya Nair: Transcription can stay on-device for regulated tenants.
[00:41] Security lead: We also need SSO / SCIM timelines and residency options.
[00:55] You: SSO checklist is in draft — Priya will circulate after this call.
[01:10] … session still recording …`,
    followUpEmail:
      "Subject: Enterprise Security Review — partial notes\n\nHi team,\n\nLive session in progress. Capturing Privacy Mode, residency, and SSO questions. Full summary will follow when the call ends.\n\nCueAI",
  },
  {
    id: "mh3",
    title: "Customer Success Weekly",
    day: "Yesterday",
    time: "2:00 PM",
    duration: "28m",
    attendees: 5,
    tags: ["CS", "Support"],
    status: "summary-ready",
    platform: "Teams",
    generatedIn: "22s",
    executiveSummary:
      "Prioritized three P0 SSO timeout tickets. Hotfix targeted for Friday with tenant notifications. Presenter Privacy Mode confirmed out of scope for this incident. Auth latency monitoring will follow early next week.",
    decisions: [
      "Ship SSO hotfix by Friday (P0)",
      "Notify affected tenants with status email",
      "Defer non-critical backlog until after hotfix",
    ],
    risks: [
      "Hotfix may slip if staging repro fails",
      "Customer churn risk if no proactive status update",
    ],
    openQuestions: [
      "Does the race only occur with Okta, or all IdPs?",
      "Should we offer temporary password login as workaround?",
    ],
    actions: [
      { text: "Ship SSO hotfix", owner: "Dev", due: "Fri", done: false },
      { text: "Draft customer status email", owner: "You", due: "Thu", done: false },
      { text: "Add auth latency monitoring alert", owner: "Aisha", due: "Mon", done: false },
    ],
    transcript: `[00:03] You: Let's prioritize the SSO timeouts.
[00:11] Dev: Staging repro is flaky under load — token refresh race is the lead theory.
[00:24] Aisha: I'll own the latency alert once we ship.
[00:36] You: Hotfix by Friday — agreed. Status email to tenants tomorrow.
[00:52] Support: Presenter Privacy is unrelated; keep it out of the incident notes.
[01:08] You: Okta-only vs all IdPs is still open — Dev will check overnight.`,
    followUpEmail:
      "Subject: SSO timeout — status and next steps\n\nHi team,\n\nFollowing today's triage, we're shipping a hotfix by Friday for the SSO timeout issue and will notify affected tenants. Monitoring for auth latency will follow early next week.\n\nThanks,\nCueAI Support",
  },
  {
    id: "mh4",
    title: "Design Critique — CueAI Companion",
    day: "Mon",
    time: "4:15 PM",
    duration: "35m",
    attendees: 7,
    tags: ["Design", "Companion"],
    status: "summary-ready",
    platform: "Zoom",
    generatedIn: "15s",
    executiveSummary:
      "Critique focused on Companion glass panel density and Assist vs Suggest clarity. Team agreed to reduce chrome during live calls and keep What others see as a thin strip. Resume Tailor compare view needs clearer before/after labels.",
    decisions: [
      "Reduce overlay chrome during live Assist",
      "Keep “What others see” as a thin strip only",
      "Add clearer before/after labels on Resume Compare",
    ],
    risks: ["Dense panel may distract presenters on small phones."],
    openQuestions: ["Should Suggest mode auto-collapse after copy?"],
    actions: [
      { text: "Ship thinner live dock prototype", owner: "Design", due: "Aug 15", done: false },
      { text: "Update Resume Compare labels", owner: "Alex Chen", due: "Aug 12", done: true },
    ],
    transcript: `[00:05] Design: The glass panel feels busy when Assist and Follow-ups are open.
[00:16] You: Let's collapse secondary modes and keep Ask AI primary.
[00:29] Marcus: “What others see” should stay a thin strip — not a full card.
[00:44] Design: Resume Compare needs stronger before/after hierarchy.
[00:58] Alex: I'll label those sections clearly in the next pass.
[01:12] You: Thinner live dock is the next prototype target.`,
    followUpEmail:
      "Subject: Companion critique — UI decisions\n\nHi design crew,\n\nWe agreed to thin the live dock, keep the privacy strip minimal, and clarify Resume Compare labels. Next prototype: thinner live dock.\n\nThanks,\nCueAI",
  },
];

export const knowledgeDocs: KnowledgeDoc[] = [
  {
    id: "k1",
    title: "CueAI pricing & packaging.pdf",
    category: "Sales",
    format: "PDF",
    updated: "2d ago",
    snippets: 24,
    status: "indexed",
  },
  {
    id: "k2",
    title: "Security & privacy FAQ.docx",
    category: "Support FAQ",
    format: "DOCX",
    updated: "1w ago",
    snippets: 41,
    status: "indexed",
  },
  {
    id: "k3",
    title: "Product architecture overview.md",
    category: "Product",
    format: "MD",
    updated: "3d ago",
    snippets: 18,
    status: "indexed",
  },
  {
    id: "k4",
    title: "https://cueai.example/docs/privacy",
    category: "Web",
    format: "URL",
    updated: "5d ago",
    snippets: 12,
    status: "needs-reindex",
  },
  {
    id: "k5",
    title: "Q&A: What is Presenter Privacy Mode?",
    category: "Q&A",
    format: "Q&A",
    updated: "1d ago",
    snippets: 2,
    status: "indexed",
  },
];

export const transcriptLines = [
  { speaker: "Priya", text: "Can you walk us through how CueAI handles screen context during a live demo?" },
  { speaker: "You", text: "Absolutely — we use on-device OCR with Presenter Privacy Mode so shared content stays private." },
  { speaker: "Marcus", text: "And what’s the difference between Assist and Suggest during a call?" },
];

export const copilotReplies: Record<CopilotMode, string> = {
  assist:
    "Screen context is captured locally with OCR/vision cues. Presenter Privacy Mode hides the CueAI overlay from screen share and recordings while still feeding you answers privately.",
  suggest:
    "Try saying: “We keep visual context on-device, and Presenter Privacy Mode ensures the assistant never appears in your shared screen — so demos stay clean for everyone else.”",
  followup: "Good follow-ups:\n• Is transcription processed on-device or in the cloud?\n• Can privacy mode be enforced by admin policy?\n• How does RAG respect document ACLs?",
  recap:
    "So far: Priya asked about screen context; you explained on-device OCR + privacy mode. Marcus wants Assist vs Suggest clarified next.",
};

export const resumeOriginal = `Alex Rivera
Product-minded engineer · Meeting AI & productivity

SUMMARY
Builds real-time assistants that turn conversation and screen context into actionable outcomes. Strong in React, TypeScript, and privacy-aware AI UX.

EXPERIENCE
Senior Product Engineer — Nova Labs
• Shipped live transcription UX used in 12k weekly meetings
• Led RAG knowledge base with role-based document access
• Partnered with design on glassmorphic overlay patterns for mobile

PROJECTS
CueBoard — collaborative meeting notes prototype

SKILLS
TypeScript · React · RAG · Speech UX · Privacy controls`;

export const resumeTailored = `Alex Rivera
Product Engineer · Real-time AI meeting copilots

SUMMARY
Product engineer specializing in real-time meeting assistants, live transcription UX, RAG knowledge bases, and privacy-aware overlay experiences. Ships React/TypeScript products used in high-volume meeting workflows.

EXPERIENCE
Senior Product Engineer — Nova Labs
• Designed and shipped live transcription UX supporting 12k+ weekly meetings with low-latency feedback loops
• Built RAG knowledge base with role-based document access for sales and support teams
• Delivered mobile overlay patterns for on-call AI assistance with presenter privacy controls

PROJECTS
CueBoard — real-time collaborative notes with action-item extraction and ATS-ready export flows

SKILLS
TypeScript · React · Real-time UX · RAG · Speech-to-text UX · Privacy controls · ATS optimization · Document parsing`;

export const resumeAnalysis = {
  matchScore: 88,
  requiredSkills: ["React", "TypeScript", "RAG", "Real-time UX", "Privacy controls"],
  preferredSkills: ["Speech UX", "ATS optimization", "Document parsing"],
  keywords: ["transcription", "overlay", "knowledge base", "consent", "meeting assistant"],
  missingKeywords: ["WebRTC", "embedding pipeline", "SOC2"],
  skillsGap: ["WebRTC experience not evidenced", "Formal SOC2 language absent"],
};

/** @deprecated use resumeOriginal */
export const resumeDraft = resumeOriginal;
