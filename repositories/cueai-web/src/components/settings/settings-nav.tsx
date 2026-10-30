"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Building2,
  CreditCard,
  Keyboard,
  KeyRound,
  Monitor,
  Palette,
  Shield,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  danger?: boolean;
};

type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  children: NavItem[];
};

const PRIMARY: NavItem[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "models", label: "AI Providers & Models", icon: Sparkles },
  { id: "privacy", label: "Privacy", icon: Shield },
];

const APPEARANCE_GROUP: NavGroup = {
  id: "appearance",
  label: "Appearance",
  icon: Palette,
  children: [
    { id: "shortcuts", label: "Keyboard Shortcuts", icon: Keyboard },
    { id: "desktop", label: "Desktop Preferences", icon: Monitor },
  ],
};

const APPEARANCE_SECTION_IDS = new Set([
  APPEARANCE_GROUP.id,
  ...APPEARANCE_GROUP.children.map((c) => c.id),
]);

const TAIL: NavItem[] = [
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "workspace", label: "Workspace", icon: Building2, adminOnly: true },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "api", label: "API Keys", icon: KeyRound },
  { id: "danger", label: "Delete Account", icon: Trash2, danger: true },
];

function NavButton({
  active,
  danger,
  sub,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  danger?: boolean;
  sub?: boolean;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cue-settings-nav-item",
        sub && "cue-settings-nav-item--sub",
        active && "is-active",
        danger && !active && "is-danger",
      )}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
      <span className="truncate text-left">{label}</span>
    </button>
  );
}

export function SettingsNav({
  section,
  admin,
  onSelect,
}: {
  section: string;
  admin: boolean;
  onSelect: (id: string) => void;
}) {
  const tail = TAIL.filter((item) => admin || !item.adminOnly);
  const [appearanceOpen, setAppearanceOpen] = useState(() => APPEARANCE_SECTION_IDS.has(section));

  useEffect(() => {
    if (APPEARANCE_SECTION_IDS.has(section)) setAppearanceOpen(true);
  }, [section]);

  function selectPrimary(id: string) {
    if (id !== APPEARANCE_GROUP.id) setAppearanceOpen(false);
    onSelect(id);
  }

  function selectAppearance() {
    setAppearanceOpen(true);
    onSelect(APPEARANCE_GROUP.id);
  }

  function selectAppearanceChild(id: string) {
    setAppearanceOpen(true);
    onSelect(id);
  }

  return (
    <nav className="cue-settings-nav-rail" aria-label="Settings sections">
      <div className="cue-settings-nav-primary">
        {PRIMARY.map((item) => (
          <NavButton
            key={item.id}
            label={item.label}
            icon={item.icon}
            active={section === item.id}
            onClick={() => selectPrimary(item.id)}
          />
        ))}

        <NavButton
          label={APPEARANCE_GROUP.label}
          icon={APPEARANCE_GROUP.icon}
          active={section === APPEARANCE_GROUP.id}
          onClick={() => selectAppearance()}
        />
        {appearanceOpen && (
          <div className="cue-settings-nav-subgroup" role="group" aria-label="Appearance related">
            {APPEARANCE_GROUP.children.map((child) => (
              <NavButton
                key={child.id}
                sub
                label={child.label}
                icon={child.icon}
                active={section === child.id}
                onClick={() => selectAppearanceChild(child.id)}
              />
            ))}
          </div>
        )}

        {tail.map((item) => (
          <NavButton
            key={item.id}
            label={item.label}
            icon={item.icon}
            active={section === item.id}
            danger={item.danger}
            onClick={() => selectPrimary(item.id)}
          />
        ))}
      </div>
    </nav>
  );
}
