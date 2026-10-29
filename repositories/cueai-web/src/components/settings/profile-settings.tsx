"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/providers/auth-provider";
import { updateSessionProfile } from "@/lib/auth";
import {
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  LONG_TEXT_MAX,
  SHORT_TEXT_MAX,
  WORK_STATUSES,
  isEarlyCareer,
  isValidEmail,
  validateProfileUpdate,
  type ProfessionalProfile,
  type ProfileFieldErrors,
  type ProfileOption,
} from "@/lib/professional-profile";
import { cn } from "@/lib/utils";

type Form = {
  name: string;
  role: string;
  company: string;
  jobTitle: string;
  employmentType: string;
  experience: string;
  workStatus: string;
  summary: string;
};

type ProfileResponse = { name: string; email: string; accessRole: string; profile: ProfessionalProfile };

const LEGACY_ROLE_KEY = "cueai-role";

const fieldClass =
  "w-full rounded-xl border border-[var(--border-strong)] bg-[var(--background-elevated)] px-3.5 text-sm text-foreground placeholder:text-subtle transition-all duration-200 hover:border-[var(--border-glow)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-muted)] disabled:opacity-60";

function toForm(data: ProfileResponse): Form {
  const p = data.profile || {};
  const legacyRole = typeof window !== "undefined" ? localStorage.getItem(LEGACY_ROLE_KEY) || "" : "";
  return {
    name: data.name || "",
    role: p.role || legacyRole,
    company: p.company || "",
    jobTitle: p.jobTitle || "",
    employmentType: p.employmentType || "",
    experience: p.experience || "",
    workStatus: p.workStatus || "",
    summary: p.summary || "",
  };
}

/**
 * PUT replaces the whole saved profile, so fields this form no longer shows
 * (work history, skills, domain) are sent back exactly as they were loaded.
 */
function toPayload(form: Form, saved: ProfessionalProfile) {
  const { name, ...visible } = form;
  return { name, profile: { ...saved, ...visible } };
}

function Label({ htmlFor, children, optional, required }: { htmlFor: string; children: ReactNode; optional?: boolean; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-2 text-sm font-medium text-foreground/90">
      {children}
      {required && <span className="text-[var(--cue-danger)]" aria-hidden>*</span>}
      {optional && <span className="text-xs font-normal text-subtle">Optional</span>}
    </label>
  );
}

function FieldMessage({ error, hint }: { error?: string; hint?: string }) {
  if (error) return <p className="text-xs text-[var(--cue-danger)]">{error}</p>;
  if (hint) return <p className="text-xs text-subtle">{hint}</p>;
  return null;
}

function optionLabel(options: ProfileOption[], id: string): string {
  if (!id) return "—";
  return options.find((o) => o.id === id)?.label ?? id;
}

function displayValue(value: string): string {
  const trimmed = value.trim();
  return trimmed || "—";
}

function ReadOnlyField({
  label,
  value,
  optional,
  required,
  hint,
}: {
  label: string;
  value: string;
  optional?: boolean;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-2 text-sm font-medium text-foreground/90">
        {label}
        {required && <span className="text-[var(--cue-danger)]" aria-hidden>*</span>}
        {optional && <span className="text-xs font-normal text-subtle">Optional</span>}
      </span>
      <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] px-3.5 py-2.5 text-sm text-foreground">
        {displayValue(value)}
      </p>
      {hint ? <p className="text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

function TextField(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  required?: boolean;
  error?: string;
  hint?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.id} optional={props.optional} required={props.required}>
        {props.label}
      </Label>
      <input
        id={props.id}
        className={cn(fieldClass, "h-11", props.error && "border-[var(--cue-danger)]")}
        value={props.value}
        maxLength={props.maxLength ?? SHORT_TEXT_MAX}
        placeholder={props.placeholder}
        aria-invalid={Boolean(props.error)}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <FieldMessage error={props.error} hint={props.hint} />
    </div>
  );
}

function AreaField(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  hint?: string;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.id} optional={props.optional}>
        {props.label}
      </Label>
      <textarea
        id={props.id}
        rows={props.rows ?? 3}
        className={cn(fieldClass, "resize-y py-2.5 leading-relaxed")}
        value={props.value}
        maxLength={LONG_TEXT_MAX}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <FieldMessage hint={props.hint} />
    </div>
  );
}

function SelectField(props: {
  id: string;
  label: string;
  value: string;
  options: ProfileOption[];
  onChange: (value: string) => void;
  optional?: boolean;
  required?: boolean;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.id} optional={props.optional} required={props.required}>
        {props.label}
      </Label>
      <select
        id={props.id}
        className={cn(fieldClass, "h-11", props.error && "border-[var(--cue-danger)]")}
        value={props.value}
        aria-invalid={Boolean(props.error)}
        onChange={(e) => props.onChange(e.target.value)}
      >
        <option value="">Select…</option>
        {props.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldMessage error={props.error} />
    </div>
  );
}

function Section({
  id,
  title,
  description,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--border)]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted">{description}</p>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id={id} className="space-y-4 border-t border-[var(--border)] px-5 py-5">
          {children}
        </div>
      )}
    </section>
  );
}

export function ProfileSettings() {
  const { refresh } = useAuth();
  const [form, setForm] = useState<Form | null>(null);
  const [email, setEmail] = useState("");
  const [accessRole, setAccessRole] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<ProfileFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [openProfessional, setOpenProfessional] = useState(true);
  const [saved, setSaved] = useState<ProfessionalProfile>({});
  const [editing, setEditing] = useState(false);
  const [baseline, setBaseline] = useState<Form | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/profile", { cache: "no-store", credentials: "include" });
      const data = (await res.json().catch(() => null)) as (ProfileResponse & { error?: string }) | null;
      if (!res.ok || !data) {
        setLoadError(data?.error || (res.status === 401 ? "Your session expired. Sign in again." : "Couldn't load your profile."));
        return;
      }
      const next = toForm(data);
      setForm(next);
      setBaseline(next);
      setSaved(data.profile || {});
      setEmail(data.email || "");
      setAccessRole(data.accessRole || "");
      setEditing(false);
    } catch {
      setLoadError("Couldn't reach CueAI. Check your connection and retry.");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key as keyof ProfileFieldErrors];
      return next;
    });
    setStatus(null);
  }

  function showErrors(fieldErrors: ProfileFieldErrors) {
    setErrors(fieldErrors);
    if (["company", "jobTitle", "experience", "workStatus"].some((k) => k in fieldErrors)) setOpenProfessional(true);
    const shown = ["name", "role", "company", "jobTitle", "employmentType", "experience", "workStatus", "summary"];
    setStatus({
      kind: "error",
      text: Object.keys(fieldErrors).some((k) => shown.includes(k))
        ? "Please fix the highlighted fields."
        : "Your saved profile has invalid details that can't be edited here. Please contact support.",
    });
  }

  function cancelEdit() {
    if (baseline) setForm(baseline);
    setErrors({});
    setStatus(null);
    setEditing(false);
  }

  async function save() {
    if (!form || saving) return;
    const local = validateProfileUpdate(toPayload(form, saved));
    if ("errors" in local) {
      showErrors(local.errors);
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form, saved)),
      });
      const data = (await res.json().catch(() => null)) as
        | (ProfileResponse & { error?: string; fieldErrors?: ProfileFieldErrors })
        | null;
      if (!res.ok || !data) {
        if (data?.fieldErrors) showErrors(data.fieldErrors);
        else setStatus({ kind: "error", text: data?.error || "Couldn't save your profile. Please retry." });
        return;
      }
      const next = toForm(data);
      setForm(next);
      setBaseline(next);
      setSaved(data.profile || {});
      setErrors({});
      localStorage.removeItem(LEGACY_ROLE_KEY);
      updateSessionProfile({ name: data.name });
      void refresh();
      setStatus({ kind: "success", text: "Profile saved." });
      setEditing(false);
    } catch {
      setStatus({ kind: "error", text: "Couldn't reach CueAI. Your changes were not saved." });
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <Card className="space-y-3 p-6">
        <CardTitle>Profile</CardTitle>
        <p className="flex items-center gap-2 text-sm text-[var(--cue-danger)]">
          <AlertCircle className="h-4 w-4" />
          {loadError}
        </p>
        <Button variant="secondary" onClick={() => void load()}>
          Retry
        </Button>
      </Card>
    );
  }

  if (!form) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted">Loading your profile…</p>
      </Card>
    );
  }

  const earlyCareer = isEarlyCareer(form);
  const employerRequired = form.workStatus === "working" && form.experience !== "fresher";
  const emailInvalid = Boolean(email) && !isValidEmail(email);

  const professionalReadOnly = (
    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
      <ReadOnlyField
        label="Current work status"
        required
        value={optionLabel(WORK_STATUSES, form.workStatus)}
      />
      <ReadOnlyField
        label="Work experience"
        required
        value={optionLabel(EXPERIENCE_LEVELS, form.experience)}
      />
      <ReadOnlyField
        label="Current company"
        optional={!employerRequired}
        required={employerRequired}
        value={form.company}
        hint={earlyCareer ? "Not needed for freshers, students or job seekers." : undefined}
      />
      <ReadOnlyField
        label="Job title / designation"
        optional={!employerRequired}
        required={employerRequired}
        value={form.jobTitle}
      />
      <ReadOnlyField
        label="Employment type"
        optional
        value={optionLabel(EMPLOYMENT_TYPES, form.employmentType)}
      />
      <div className="md:col-span-2">
        <ReadOnlyField label="Professional summary / About me" optional value={form.summary} />
      </div>
    </div>
  );

  const professionalEditable = (
    <>
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        <SelectField
          id="profile-work-status"
          label="Current work status"
          required
          options={WORK_STATUSES}
          value={form.workStatus}
          error={errors.workStatus}
          onChange={(v) => set("workStatus", v)}
        />
        <SelectField
          id="profile-experience"
          label="Work experience"
          required
          options={EXPERIENCE_LEVELS}
          value={form.experience}
          error={errors.experience}
          onChange={(v) => set("experience", v)}
        />
        <TextField
          id="profile-company"
          label="Current company"
          optional={!employerRequired}
          required={employerRequired}
          value={form.company}
          error={errors.company}
          hint={earlyCareer ? "Not needed for freshers, students or job seekers." : undefined}
          onChange={(v) => set("company", v)}
        />
        <TextField
          id="profile-job-title"
          label="Job title / designation"
          optional={!employerRequired}
          required={employerRequired}
          value={form.jobTitle}
          error={errors.jobTitle}
          onChange={(v) => set("jobTitle", v)}
        />
        <SelectField
          id="profile-employment-type"
          label="Employment type"
          optional
          options={EMPLOYMENT_TYPES}
          value={form.employmentType}
          onChange={(v) => set("employmentType", v)}
        />
      </div>
      <AreaField
        id="profile-summary"
        label="Professional summary / About me"
        optional
        rows={3}
        placeholder="A few sentences about your background and what you're looking for."
        value={form.summary}
        onChange={(v) => set("summary", v)}
      />
    </>
  );

  return (
    <Card className="min-w-0 space-y-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Your details stay private to your account. CueAI uses them only to personalize your own live answers and
            mock interviews.
          </CardDescription>
        </div>
        {!editing && (
          <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Edit
          </Button>
        )}
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Personal Information</h3>
          {accessRole && <Badge variant="info">{accessRole} access</Badge>}
        </div>
        {editing ? (
          <>
            <TextField
              id="profile-name"
              label="Full name"
              required
              maxLength={80}
              value={form.name}
              error={errors.name}
              onChange={(v) => set("name", v)}
            />
            <Input
              id="profile-email"
              label="Email"
              type="email"
              value={email}
              readOnly
              error={emailInvalid ? "This sign-in email looks invalid. Contact your workspace admin." : undefined}
              hint="Your sign-in email. It can't be changed here."
            />
            <TextField
              id="profile-role"
              label="Role"
              optional
              placeholder="e.g. Software Engineer"
              value={form.role}
              onChange={(v) => set("role", v)}
            />
          </>
        ) : (
          <>
            <ReadOnlyField label="Full name" required value={form.name} />
            <ReadOnlyField
              label="Email"
              value={email}
              hint="Your sign-in email. It can't be changed here."
            />
            <ReadOnlyField label="Role" optional value={form.role} />
          </>
        )}
      </section>

      {editing ? (
        <Section
          id="profile-professional"
          title="Professional Profile"
          description="Current position, experience and a short summary."
          open={openProfessional}
          onToggle={() => setOpenProfessional((v) => !v)}
        >
          {professionalEditable}
        </Section>
      ) : (
        <section className="rounded-2xl border border-[var(--border)]">
          <div className="px-5 py-4">
            <h3 className="text-sm font-semibold text-foreground">Professional Profile</h3>
            <p className="text-xs text-muted">Current position, experience and a short summary.</p>
          </div>
          <div className="space-y-4 border-t border-[var(--border)] px-5 py-5">{professionalReadOnly}</div>
        </section>
      )}

      {editing && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save Changes
          </Button>
          <Button type="button" variant="secondary" disabled={saving} onClick={cancelEdit}>
            Cancel
          </Button>
          {status && (
            <p
              role={status.kind === "error" ? "alert" : "status"}
              className={cn(
                "flex items-center gap-1.5 text-xs",
                status.kind === "success" ? "text-teal-300" : "text-[var(--cue-danger)]",
              )}
            >
              {status.kind === "success" ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" />
              )}
              {status.text}
            </p>
          )}
        </div>
      )}

      {!editing && status?.kind === "success" && (
        <p role="status" className="flex items-center gap-1.5 text-xs text-teal-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {status.text}
        </p>
      )}
    </Card>
  );
}
