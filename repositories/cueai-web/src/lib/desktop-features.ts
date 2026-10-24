import { Camera, EyeOff, Layers, Mic, Shield, Volume2, type LucideIcon } from "lucide-react";

export type DesktopFeatureId = "mic" | "systemAudio" | "screenshot" | "alwaysOnTop" | "screenSharePrivacy" | "background";

export type DesktopFeature = {
  id: DesktopFeatureId;
  icon: LucideIcon;
  title: string;
  desc: string;
};

/** Capabilities provided by the CueAI Desktop app (Electron overlay + native capture). */
export const DESKTOP_FEATURES: DesktopFeature[] = [
  {
    id: "mic",
    icon: Mic,
    title: "Mic Audio Listening",
    desc: "Capture microphone audio so CueAI can listen to your side of the conversation.",
  },
  {
    id: "systemAudio",
    icon: Volume2,
    title: "System Audio Listening",
    desc: "Capture meeting playback through supported system-audio recording.",
  },
  {
    id: "screenshot",
    icon: Camera,
    title: "Screenshot Capture",
    desc: "Capture the current screen for contextual AI assistance.",
  },
  {
    id: "alwaysOnTop",
    icon: Layers,
    title: "System-Wide Always-on-Top",
    desc: "Keep the CueAI overlay above supported applications.",
  },
  {
    id: "screenSharePrivacy",
    icon: EyeOff,
    title: "Invisible in Screen Share",
    desc: "Keep the CueAI overlay hidden from supported screen-sharing captures.",
  },
  {
    id: "background",
    icon: Shield,
    title: "Survives Closing the Page",
    desc: "Keep supported desktop functionality running when the web page is closed.",
  },
];
