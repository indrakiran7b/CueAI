/**
 * Meeting record types shared by API routes and pages.
 * Demo catalog content was removed — use /api/meetings (real store) only.
 */

export type MeetingStatus = "live" | "summary" | "completed" | "incomplete";

export type MeetingActionItem = {
  id: string;
  title: string;
  owner: string;
  due: string;
  status: "open" | "done";
};

export type TranscriptLine = {
  id: string;
  speaker: string;
  role: string;
  text: string;
  textHi: string;
  textTe: string;
  time: string;
  confidence: number;
};

export type MeetingAiAnswer = {
  id: string;
  question: string;
  questionHi: string;
  questionTe: string;
  answer: string;
  answerHi: string;
  answerTe: string;
  pinned: boolean;
};

export type MeetingRecord = {
  id: string;
  title: string;
  time: string;
  duration: string;
  attendees: number;
  status: MeetingStatus;
  tags: string[];
  generatedIn?: string;
  executiveSummary: string;
  executiveSummaryHi: string;
  executiveSummaryTe: string;
  keyDecisions: string[];
  risks: Array<{ type: "risk" | "question"; text: string }>;
  actionItems: MeetingActionItem[];
  transcript: TranscriptLine[];
  aiAnswers: MeetingAiAnswer[];
  emailSubject: string;
  emailBody: string;
};

export type MeetingListItem = Pick<
  MeetingRecord,
  "id" | "title" | "time" | "duration" | "attendees" | "status" | "tags"
>;

/** @deprecated Demo catalog removed — always empty. Use /api/meetings. */
export function listMeetings(): MeetingListItem[] {
  return [];
}

/** @deprecated Demo catalog removed — always null. Use /api/meetings/[id]. */
export function getMeetingById(_id: string): MeetingRecord | null {
  void _id;
  return null;
}

export function meetingExists(_id: string): boolean {
  void _id;
  return false;
}
