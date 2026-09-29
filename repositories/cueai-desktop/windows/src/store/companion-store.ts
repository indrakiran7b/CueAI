import { create } from "zustand";
import type {
  CaptureStatus,
  CompanionMode,
  ListenSources,
  MeetingSession,
} from "../types/companion";

export type TranscriptLine = {
  id: string;
  who: string;
  text: string;
  at: number;
};

type CompanionUiState = {
  mode: CompanionMode;
  pinned: boolean;
  opacity: number;
  panel: "answer" | "transcript" | "actions" | "translate";
  session: MeetingSession;
  capture: CaptureStatus | null;
  listen: ListenSources;
  transcript: TranscriptLine[];
  setMode: (mode: CompanionMode) => void;
  setPinned: (pinned: boolean) => void;
  setOpacity: (opacity: number) => void;
  setPanel: (panel: CompanionUiState["panel"]) => void;
  setSession: (session: MeetingSession) => void;
  setCapture: (capture: CaptureStatus) => void;
  setListen: (listen: ListenSources) => void;
  appendTranscript: (line: Omit<TranscriptLine, "id" | "at"> & { id?: string; at?: number }) => void;
  clearTranscript: () => void;
};

export const useCompanionStore = create<CompanionUiState>((set) => ({
  mode: "full",
  pinned: true,
  opacity: 1,
  panel: "answer",
  session: { active: false, screenSharing: false, cueAiMode: "inactive" },
  capture: null,
  listen: { mic: false, systemAudio: false },
  transcript: [],
  setMode: (mode) => set({ mode }),
  setPinned: (pinned) => set({ pinned }),
  setOpacity: (opacity) => set({ opacity }),
  setPanel: (panel) => set({ panel }),
  setSession: (session) => set({ session }),
  setCapture: (capture) => set({ capture }),
  setListen: (listen) => set({ listen }),
  appendTranscript: (line) =>
    set((state) => ({
      transcript: [
        ...state.transcript,
        {
          id: line.id || crypto.randomUUID(),
          who: line.who,
          text: line.text,
          at: line.at || Date.now(),
        },
      ].slice(-80),
    })),
  clearTranscript: () => set({ transcript: [] }),
}));
