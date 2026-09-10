"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ONBOARDING_QUESTIONS,
  labelFor,
  type OnboardingAnswers,
} from "@/lib/onboarding";

/** Read-only view of the signup questionnaire, with a link back into the wizard. */
export function PersonalizationCard() {
  const [answers, setAnswers] = useState<OnboardingAnswers | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void fetch("/api/onboarding", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { answers?: OnboardingAnswers } | null) => {
        if (!active) return;
        setAnswers(data?.answers || {});
        setLoading(false);
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const rows: Array<{ id: string; prompt: string; display: string }> = [];
  for (const question of ONBOARDING_QUESTIONS) {
    const value = answers?.[question.id];
    const display = Array.isArray(value)
      ? value.map((v) => labelFor(question.id, v)).join(", ")
      : typeof value === "string"
        ? labelFor(question.id, value.trim())
        : "";
    if (display) rows.push({ id: question.id, prompt: question.prompt, display });
  }

  return (
    <Card className="space-y-4 p-6">
      <CardHeader>
        <div>
          <CardTitle>Personalization</CardTitle>
          <CardDescription>
            Your answers from setup — CueAI uses these to tailor live cues and rewrites.
          </CardDescription>
        </div>
      </CardHeader>

      {loading ? (
        <p className="text-sm text-muted">Loading your answers…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">
          You skipped the setup questions. Answer them so CueAI can tailor its suggestions.
        </p>
      ) : (
        <dl className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-col gap-0.5">
              <dt className="text-xs text-subtle">{row.prompt}</dt>
              <dd className="text-sm text-foreground">{row.display}</dd>
            </div>
          ))}
        </dl>
      )}

      <Button variant="secondary" href="/onboarding?next=/settings">
        <Sparkles className="h-4 w-4" />
        {rows.length === 0 ? "Answer setup questions" : "Update my answers"}
      </Button>
    </Card>
  );
}
