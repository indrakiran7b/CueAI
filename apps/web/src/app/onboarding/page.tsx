"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { useAuth } from "@/components/providers/auth-provider";
import { AUTH_BYPASS } from "@/lib/auth";
import {
  ONBOARDING_STEPS,
  isStepAnswered,
  type OnboardingAnswers,
  type OnboardingQuestion,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";

function ChoiceButton({
  label,
  selected,
  multi,
  onClick,
}: {
  label: string;
  selected: boolean;
  multi?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all duration-200",
        selected
          ? "border-[var(--primary)] bg-[var(--primary-muted)] text-foreground"
          : "border-[var(--border-strong)] bg-[var(--background-elevated)] text-muted hover:border-[var(--border-glow)] hover:text-foreground",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center border transition-all",
          multi ? "rounded-md" : "rounded-full",
          selected
            ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
            : "border-[var(--border-strong)]",
        )}
      >
        {selected && <Check className="h-3 w-3" />}
      </span>
    </button>
  );
}

function Question({
  question,
  answers,
  onChange,
}: {
  question: OnboardingQuestion;
  answers: OnboardingAnswers;
  onChange: (next: OnboardingAnswers) => void;
}) {
  const value = answers[question.id];

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground/90">
          {question.prompt}
          {question.optional && <span className="ml-2 text-xs text-subtle">Optional</span>}
        </p>
        {question.helper && <p className="mt-1 text-xs text-subtle">{question.helper}</p>}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {question.choices.map((choice) => {
          const selected =
            question.kind === "multi"
              ? Array.isArray(value) && value.includes(choice.id)
              : value === choice.id;

          return (
            <ChoiceButton
              key={choice.id}
              label={choice.label}
              selected={selected}
              multi={question.kind === "multi"}
              onClick={() => {
                if (question.kind === "multi") {
                  const current = Array.isArray(value) ? value : [];
                  const next = selected
                    ? current.filter((id) => id !== choice.id)
                    : [...current, choice.id].slice(0, question.maxSelections);
                  onChange({ ...answers, [question.id]: next });
                  return;
                }
                // Tapping the selected option again clears an optional answer.
                const next = selected && question.optional ? undefined : choice.id;
                onChange({ ...answers, [question.id]: next });
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, ready, refresh } = useAuth();

  const nextHref = searchParams.get("next") || "/dashboard";
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = ONBOARDING_STEPS[stepIndex]!;
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;
  const canContinue = useMemo(() => isStepAnswered(step, answers), [step, answers]);
  const firstName = (session?.name || "").trim().split(/\s+/)[0];

  useEffect(() => {
    if (!ready) return;
    if (!AUTH_BYPASS && !session) {
      router.replace("/login?next=/onboarding");
      return;
    }
    let active = true;
    void fetch("/api/onboarding", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login?next=/onboarding");
          return null;
        }
        return res.ok ? ((await res.json()) as { answers?: OnboardingAnswers }) : null;
      })
      .then((data) => {
        if (!active) return;
        if (data?.answers) setAnswers(data.answers);
        setLoaded(true);
      })
      .catch(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [ready, session, router]);

  async function save(skipped: boolean) {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, skipped }),
      });
      if (res.status === 401) {
        router.replace("/login?next=/onboarding");
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error || "Could not save your answers.");
        setSaving(false);
        return;
      }
      // Wait for the refreshed session so the app gate does not bounce us back here.
      await refresh();
      router.replace(nextHref);
    } catch {
      setError("Could not reach the server. Please try again.");
      setSaving(false);
    }
  }

  if (!ready || !loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted">
        Setting up your workspace…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        <Logo />

        <div className="mt-10">
          <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl btn-gradient">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <h1 className="font-display text-3xl tracking-tight">
            {firstName ? `Welcome, ${firstName}.` : "Welcome to CueAI."}
          </h1>
          <p className="mt-2 text-sm text-muted">
            A few quick questions so your copilot knows how to help you.
          </p>
        </div>

        <div className="mt-8 flex items-center gap-2" aria-hidden>
          {ONBOARDING_STEPS.map((s, i) => (
            <span
              key={s.id}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-300",
                i <= stepIndex ? "bg-[var(--primary)]" : "bg-[var(--border-strong)]",
              )}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-subtle">
          Step {stepIndex + 1} of {ONBOARDING_STEPS.length}
        </p>

        <div className="mt-8">
          <h2 className="text-xl font-semibold tracking-tight">{step.title}</h2>
          <p className="mt-1.5 text-sm text-muted">{step.description}</p>

          <div className="mt-8 space-y-8">
            {step.questions.map((question) => (
              <Question
                key={question.id}
                question={question}
                answers={answers}
                onChange={setAnswers}
              />
            ))}
          </div>
        </div>

        {error && (
          <p className="mt-6 text-sm text-[var(--cue-danger)]" role="alert">
            {error}
          </p>
        )}

        <div className="mt-10 flex items-center justify-between gap-3">
          {stepIndex > 0 ? (
            <Button variant="ghost" onClick={() => setStepIndex((i) => i - 1)} disabled={saving}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => void save(true)} disabled={saving}>
              Skip for now
            </Button>
          )}

          <Button
            variant="gradient"
            size="lg"
            loading={saving}
            disabled={!canContinue || saving}
            onClick={() => {
              if (isLastStep) {
                void save(false);
                return;
              }
              setStepIndex((i) => i + 1);
            }}
          >
            {isLastStep ? "Finish setup" : "Continue"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        {!canContinue && (
          <p className="mt-4 text-xs text-subtle">
            Answer the questions above to continue.
          </p>
        )}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <OnboardingWizard />
    </Suspense>
  );
}
