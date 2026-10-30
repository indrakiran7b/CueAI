import { Mic, MicOff, Shield, ShieldOff, Square, Volume2, VolumeX } from "lucide-react";

export type OverlayMenuProps = {
  listen: { mic: boolean; systemAudio: boolean };
  pinned: boolean;
  autoAnswer: boolean;
  privacyOn: boolean;
  ending: boolean;
  onToggleMic: () => void;
  onToggleSystemAudio: () => void;
  onTogglePin: () => void;
  onAutoAnswerChange: (enabled: boolean) => void;
  onTogglePrivacy: () => void;
  onEndSession: () => void;
};

/** Three-dot menu: Mic, System, Pin, Auto-answer, Privacy, End (in that order). */
export function OverlayMenu(props: OverlayMenuProps) {
  const { listen, pinned, autoAnswer, privacyOn, ending } = props;
  return (
    <div className="ov-menu" role="menu">
      <button type="button" role="menuitem" onClick={props.onToggleMic}>
        {listen.mic ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
        Mic {listen.mic ? "on" : "off"}
      </button>
      <button type="button" role="menuitem" onClick={props.onToggleSystemAudio}>
        {listen.systemAudio ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        System {listen.systemAudio ? "on" : "off"}
      </button>
      <button type="button" role="menuitem" onClick={props.onTogglePin}>
        Pin {pinned ? "on" : "off"}
      </button>
      <label>
        <input type="checkbox" checked={autoAnswer} onChange={(e) => props.onAutoAnswerChange(e.target.checked)} />
        Auto-answer
      </label>
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={privacyOn}
        title={privacyOn ? "Privacy on — hidden from screen share" : "Privacy off — visible on screen share"}
        onClick={props.onTogglePrivacy}
      >
        {privacyOn ? <Shield className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
        Privacy {privacyOn ? "on" : "off"}
      </button>
      <button type="button" role="menuitem" className="is-danger" onClick={props.onEndSession}>
        <Square className="h-3 w-3 fill-current" />
        {ending ? "Ending…" : "End"}
      </button>
    </div>
  );
}
