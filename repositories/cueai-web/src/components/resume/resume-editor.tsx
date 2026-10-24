"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { splitSkills } from "@/lib/resume/normalize";
import type { ResumeEntry, StructuredResume } from "@/lib/resume/types";

type Field = { key: string; label: string; rows?: number };

const COMMIT_DELAY_MS = 350;

function lines(text: string) {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
}

function entryLabel(kind: string, e: ResumeEntry) {
  return `${kind}: ${[e.title, e.organization].filter(Boolean).join(" · ") || "entry"}`;
}

function fieldsFor(r: StructuredResume): Field[] {
  const rows = (n: number) => Math.min(10, Math.max(2, n + 1));
  const out: Field[] = [
    { key: "name", label: "Name" },
    { key: "headline", label: "Headline" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "location", label: "Location" },
    { key: "links", label: "Links (comma separated)" },
    { key: "summary", label: "Summary", rows: 4 },
    { key: "skills", label: "Skills (one group per line, e.g. “Languages: Python, SQL”)", rows: rows(r.skills.length) },
  ];
  r.experience.forEach((e, i) => out.push({ key: `experience.${i}`, label: `${entryLabel("Experience", e)} (one bullet per line)`, rows: rows(e.bullets.length) }));
  r.internships.forEach((e, i) => out.push({ key: `internships.${i}`, label: `${entryLabel("Internship", e)} (one bullet per line)`, rows: rows(e.bullets.length) }));
  r.projects.forEach((p, i) => out.push({ key: `projects.${i}`, label: `Project: ${p.name} (one bullet per line)`, rows: rows(p.bullets.length) }));
  r.education.forEach((e, i) => out.push({ key: `education.${i}`, label: `${entryLabel("Education", e)} (details, one per line)`, rows: rows(e.bullets.length) }));
  out.push(
    { key: "certifications", label: "Certifications (one per line)", rows: rows(r.certifications.length) },
    { key: "achievements", label: "Achievements (one per line)", rows: rows(r.achievements.length) },
  );
  r.extra.forEach((x, i) => out.push({ key: `extra.${i}`, label: `${x.heading} (one per line)`, rows: rows(x.items.length) }));
  return out;
}

function readFields(r: StructuredResume): Record<string, string> {
  const t: Record<string, string> = {
    name: r.name,
    headline: r.headline,
    email: r.contact.email,
    phone: r.contact.phone,
    location: r.contact.location,
    links: r.contact.links.join(", "),
    summary: r.summary,
    skills: r.skills.map((g) => (g.label ? `${g.label}: ` : "") + g.items.join(", ")).join("\n"),
    certifications: r.certifications.join("\n"),
    achievements: r.achievements.join("\n"),
  };
  for (const key of ["experience", "internships", "projects", "education"] as const) {
    r[key].forEach((e, i) => (t[`${key}.${i}`] = e.bullets.join("\n")));
  }
  r.extra.forEach((x, i) => (t[`extra.${i}`] = x.items.join("\n")));
  return t;
}

/** Apply edited text to a copy of the resume. Employers, titles and dates stay as parsed. */
export function writeFields(base: StructuredResume, t: Record<string, string>): StructuredResume {
  const next = JSON.parse(JSON.stringify(base)) as StructuredResume;
  next.name = t.name?.trim() ?? next.name;
  next.headline = t.headline?.trim() ?? next.headline;
  next.contact.email = t.email?.trim() ?? next.contact.email;
  next.contact.phone = t.phone?.trim() ?? next.contact.phone;
  next.contact.location = t.location?.trim() ?? next.contact.location;
  if (t.links != null) next.contact.links = t.links.split(",").map((s) => s.trim()).filter(Boolean);
  next.summary = t.summary?.trim() ?? next.summary;
  if (t.skills != null) {
    next.skills = lines(t.skills)
      .map((line) => {
        const m = /^([^:]{1,60}):\s*(.*)$/.exec(line);
        return m ? { label: m[1]!.trim(), items: splitSkills(m[2]!) } : { label: "", items: splitSkills(line) };
      })
      .filter((g) => g.items.length);
  }
  for (const key of ["experience", "internships", "projects", "education"] as const) {
    next[key].forEach((e, i) => {
      const v = t[`${key}.${i}`];
      if (v != null) e.bullets = lines(v);
    });
  }
  if (t.certifications != null) next.certifications = lines(t.certifications);
  if (t.achievements != null) next.achievements = lines(t.achievements);
  next.extra.forEach((x, i) => {
    const v = t[`extra.${i}`];
    if (v != null) x.items = lines(v);
  });
  next.extra = next.extra.filter((x) => x.items.length);
  return next;
}

const fieldClass =
  "mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--background-elevated)] p-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-[var(--primary-muted)]";

/** Edits the shared resume data. Changes are committed after a short pause and when the editor closes. */
export function ResumeEditor({
  value,
  onChange,
  onPendingChange,
}: {
  value: StructuredResume;
  onChange: (next: StructuredResume) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const [base] = useState(value);
  const [fields] = useState(() => fieldsFor(value));
  const [texts, setTexts] = useState(() => readFields(value));
  const latest = useRef({ texts, pending: false, onChange, onPendingChange });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latest.current.onChange = onChange;
    latest.current.onPendingChange = onPendingChange;
  });

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      const l = latest.current;
      if (l.pending) {
        l.onChange(writeFields(base, l.texts));
        l.onPendingChange(false);
      }
    },
    [base],
  );

  function update(key: string, value: string) {
    const next = { ...latest.current.texts, [key]: value };
    latest.current.texts = next;
    latest.current.pending = true;
    setTexts(next);
    onPendingChange(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      latest.current.pending = false;
      latest.current.onChange(writeFields(base, latest.current.texts));
      latest.current.onPendingChange(false);
    }, COMMIT_DELAY_MS);
  }

  return (
    <div className="grid gap-3 rounded-xl border border-[var(--border)] p-4 sm:grid-cols-2">
      {fields.map((f) => (
        <label key={f.key} className={cn("block text-xs text-subtle", f.rows && "sm:col-span-2")}>
          {f.label}
          {f.rows ? (
            <textarea className={fieldClass} rows={f.rows} value={texts[f.key] ?? ""} onChange={(e) => update(f.key, e.target.value)} />
          ) : (
            <input className={fieldClass} value={texts[f.key] ?? ""} onChange={(e) => update(f.key, e.target.value)} />
          )}
        </label>
      ))}
    </div>
  );
}
