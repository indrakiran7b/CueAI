"use client";

import Link from "next/link";
import { Inter } from "next/font/google";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { ArrowRight, ChevronDown, Check } from "lucide-react";
import { faqs, pricing } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { useLandingParallax } from "@/components/landing/use-landing-parallax";
import "./landing.css";

/* Inter with tight display tracking ≈ Framer GT Walsheim substitute */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-landing-sans",
  display: "swap",
});

const display = Inter({
  subsets: ["latin"],
  variable: "--font-landing-display",
  display: "swap",
  weight: ["500", "600", "700"],
});

const agentFeatures = [
  {
    title: "Listen with an agent",
    body: "A professional meeting agent, native to your desktop. It works directly in the room to capture and refine live, with every answer visible, editable, and under your control.",
    cta: "Start with CueAI",
    href: "/signup",
  },
  {
    title: "Write with an agent",
    body: "Manage more. Publish faster. CueAI turns the call into decisions, owners, and follow-ups — connected to your knowledge so content and context stay in sync.",
    cta: "Start with CueAI",
    href: "/signup",
  },
  {
    title: "Ship with an agent",
    body: "From live answers to bilingual transcripts and resume rewrites, CueAI turns wild meeting chaos into work you can act on before anyone leaves the call.",
    cta: "Start with CueAI",
    href: "/signup",
  },
];

const spotlights = [
  {
    className: "lp-spotlight-magenta",
    kicker: "Live",
    title: "Designing calmer meetings",
    meta: "Inspiration",
  },
  {
    className: "lp-spotlight-violet",
    kicker: "Live",
    title: "Organic answers in modern UI",
    meta: "Product",
  },
  {
    className: "lp-spotlight-orange",
    kicker: "Live",
    title: "Earthy privacy, sharp clarity",
    meta: "Guide",
  },
  {
    className: "lp-spotlight-coral",
    kicker: "Live",
    title: "From talk track to pixels",
    meta: "Design",
  },
];

const platform = [
  { title: "Performance", body: "Sub-800ms suggestions. Core Web–ready companion.", stat: "<800ms" },
  { title: "CMS of meetings", body: "Search every decision, owner, and citation.", stat: "Semantic" },
  { title: "SEO for recall", body: "Find what was said weeks later, instantly.", stat: "Indexed" },
  { title: "Collaboration", body: "Pin, share, and assign without leaving the room.", stat: "Realtime" },
  { title: "Localization", body: "English, Hindi, Telugu — bilingual by default.", stat: "3 langs" },
  { title: "Hosting & privacy", body: "Privacy mode hides Cue from screen share.", stat: "99.99%" },
];

const customers = ["Northstar", "Lumen", "Helix", "Orbit", "Vertex", "Pulse", "Miro", "Zapier"];

function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2" aria-label="CueAI home">
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-[10px] bg-white font-semibold text-black",
          size === "sm" ? "h-7 w-7 text-xs" : "h-8 w-8 text-sm"
        )}
      >
        C
      </span>
      <span className={cn("lp-display text-white", size === "sm" ? "text-lg" : "text-xl")}>
        CueAI
      </span>
    </Link>
  );
}

function Pill({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
  className?: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 280, damping: 20 });
  const sy = useSpring(y, { stiffness: 280, damping: 20 });

  return (
    <motion.a
      ref={ref}
      href={href}
      className={cn(variant === "primary" ? "lp-btn-primary" : "lp-btn-ghost", className)}
      style={{ x: sx, y: sy }}
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * 0.2);
        y.set((e.clientY - r.top - r.height / 2) * 0.2);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
      whileTap={{ scale: 0.98 }}
    >
      {children}
    </motion.a>
  );
}

function LiveMock() {
  const lines = [
    { who: "Priya", text: "What's our latency budget for live answers?" },
    { who: "You", text: "Sub-800ms. Summaries can stay async." },
    { who: "CueAI", text: "Target p95 under 800ms. Stream from the transcript buffer." },
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setI((v) => (v + 1) % lines.length), 2400);
    return () => window.clearInterval(id);
  }, [lines.length]);

  return (
    <div className="lp-mock">
      <div className="flex items-center gap-2 border-b border-[var(--lp-hairline)] px-4 py-3">
        <span className="lp-dot" />
        <span className="lp-dot" />
        <span className="lp-dot" />
        <span className="ml-2 text-xs text-[var(--lp-ink-muted)]">CueAI · Live Session</span>
        <span className="ml-auto rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium text-white">
          Live
        </span>
      </div>
      <div className="grid md:grid-cols-2">
        <div className="space-y-3 border-b border-[var(--lp-hairline)] p-5 md:border-b-0 md:border-r">
          <div className="flex h-8 items-end gap-1">
            {Array.from({ length: 16 }).map((_, n) => (
              <motion.span
                key={n}
                className="w-1 rounded-full bg-white/80"
                animate={{ height: [6, 8 + ((n * 9) % 18), 6] }}
                transition={{ duration: 1.1, repeat: Infinity, delay: n * 0.04 }}
              />
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-2xl border border-[var(--lp-hairline)] bg-[var(--lp-surface-2)] px-3 py-3"
            >
              <p className="text-[11px] font-medium text-[var(--lp-accent)]">{lines[i].who}</p>
              <p className="mt-1 text-sm text-white/90">{lines[i].text}</p>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="space-y-3 p-5">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--lp-ink-muted)]">
            Suggested reply
          </p>
          <div className="rounded-2xl border border-[var(--lp-hairline)] bg-[var(--lp-surface-2)] p-4 text-sm leading-relaxed text-white/90">
            Keep p95 under 800ms. Stream tokens from the live transcript; defer deep retrieval when
            confidence dips.
          </div>
          <div className="flex gap-2">
            <button type="button" className="lp-btn-primary !px-3 !py-1.5 text-xs">
              Pin
            </button>
            <button type="button" className="lp-btn-ghost !px-3 !py-1.5 text-xs">
              Copy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const rootRef = useRef<HTMLDivElement>(null);
  useLandingParallax(rootRef);

  const marqueeItems = [
    "Live transcription",
    "Desktop companion",
    "Privacy mode",
    "Action items",
    "Knowledge search",
    "Bilingual AI",
    "Meeting summaries",
    "Screen context",
    "Resume tailor",
    "Enterprise controls",
  ];

  return (
    <div
      ref={rootRef}
      data-landing
      className={cn(inter.variable, display.variable, "min-h-screen overflow-x-hidden")}
    >
      {/* Nav — Framer: sticky, hairline, centered links */}
      <header className="lp-nav">
        <div className="mx-auto flex h-[60px] max-w-[1200px] items-center justify-between px-5">
          <Logo />
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-7 text-[13px] text-[var(--lp-ink-muted)] md:flex">
            {[
              ["Product", "#agents"],
              ["Platform", "#platform"],
              ["Pricing", "#pricing"],
              ["Stories", "#stories"],
            ].map(([label, href]) => (
              <a key={label} href={href} className="transition hover:text-white">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden px-3 py-2 text-[13px] text-[var(--lp-ink-muted)] transition hover:text-white sm:inline"
            >
              Log in
            </Link>
            <Pill href="/signup" className="!px-3.5 !py-2 text-[13px]">
              Sign up
            </Pill>
          </div>
        </div>
      </header>

      {/* Hero — Framer: huge centered display + twin pills */}
      <section className="relative px-5 pb-16 pt-20 sm:pt-28">
        <div className="lp-par-copy mx-auto max-w-[920px] text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-7 inline-flex"
          >
            <span className="lp-chip">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--lp-accent)]" />
              CueAI 2.0 · Everything we shipped
            </span>
          </motion.div>
          <motion.h1
            className="lp-display mx-auto text-[clamp(2.75rem,8.5vw,5.75rem)] text-white"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.05 }}
          >
            CueAI is the meeting agent for every step from live to launch
          </motion.h1>
          <motion.p
            className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[var(--lp-ink-muted)] sm:text-lg"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12 }}
          >
            Go from conversation to decisions with an agent that listens, answers, and writes —
            editable, private, and ready before the call ends.
          </motion.p>
          <motion.div
            className="mt-9 flex flex-wrap items-center justify-center gap-3"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18 }}
          >
            <Pill href="/signup">
              Get started for free
              <ArrowRight className="h-4 w-4" />
            </Pill>
            <Pill href="/login" variant="ghost">
              Download app
            </Pill>
          </motion.div>
          <p className="mt-6 text-xs text-[var(--lp-ink-dim)]">
            Trusted in live rooms ·{" "}
            <Link href="#stories" className="lp-link">
              Meet our customers
            </Link>
          </p>
        </div>

        <motion.div
          className="lp-par-stage mx-auto mt-16 max-w-[1100px]"
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.22 }}
        >
          <LiveMock />
        </motion.div>
      </section>

      {/* Infinite marquee */}
      <section className="lp-marquee py-4" aria-label="Capabilities">
        <div className="lp-marquee-track">
          {[0, 1].map((copy) => (
            <div key={copy} className="lp-marquee-group" aria-hidden={copy === 1 || undefined}>
              {Array.from({ length: 2 }).flatMap((_, round) =>
                marqueeItems.map((t) => (
                  <span key={`${copy}-${round}-${t}`} className="lp-marquee-item">
                    {t}
                    <span className="lp-marquee-sep">✦</span>
                  </span>
                ))
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Agents section — Framer editorial blocks */}
      <section id="agents" className="mx-auto max-w-[1200px] px-5 py-24">
        <div className="max-w-3xl">
          <h2 className="lp-display text-[clamp(2.2rem,5vw,4.4rem)] text-white">
            Agents that work alongside you, not instead of you
          </h2>
          <Pill href="/signup" className="mt-8">
            Start with agents
          </Pill>
        </div>

        <div className="mt-20 space-y-24">
          {agentFeatures.map((f, idx) => (
            <motion.div
              key={f.title}
              className="grid items-start gap-10 lg:grid-cols-2"
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.55 }}
            >
              <div className={idx % 2 === 1 ? "lg:order-2" : undefined}>
                <h3 className="lp-display text-[clamp(1.8rem,3.5vw,3rem)] text-white">{f.title}</h3>
                <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--lp-ink-muted)]">
                  {f.body}
                </p>
                <a href={f.href} className="lp-link mt-5 inline-flex items-center gap-1 text-sm">
                  {f.cta} <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
              <div className={cn("lp-card p-2", idx % 2 === 1 ? "lg:order-1" : undefined)}>
                <div
                  className={cn(
                    "lp-spotlight min-h-[260px]",
                    spotlights[idx % spotlights.length].className
                  )}
                >
                  <span className="text-xs font-medium uppercase tracking-wider text-white/80">
                    {spotlights[idx % spotlights.length].kicker}
                  </span>
                  <p className="lp-display mt-auto pt-24 text-3xl text-white sm:text-4xl">
                    {spotlights[idx % spotlights.length].title}
                  </p>
                  <p className="mt-2 text-sm text-white/75">
                    {spotlights[idx % spotlights.length].meta}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Gradient atmosphere grid — Framer signature */}
      <section className="mx-auto max-w-[1200px] px-5 pb-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {spotlights.map((s) => (
            <motion.div
              key={s.title}
              whileHover={{ y: -6, scale: 1.01 }}
              transition={{ type: "spring", stiffness: 320, damping: 22 }}
              className={cn("lp-spotlight flex flex-col justify-between", s.className)}
            >
              <span className="text-xs font-medium uppercase tracking-wider text-white/80">
                {s.kicker} · {s.meta}
              </span>
              <p className="lp-display mt-16 text-2xl leading-tight text-white">{s.title}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Platform */}
      <section id="platform" className="mx-auto max-w-[1200px] px-5 py-24">
        <h2 className="lp-display max-w-3xl text-[clamp(2.2rem,5vw,4rem)] text-white">
          Not just vibes, a full platform
        </h2>
        <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {platform.map((p) => (
            <motion.div
              key={p.title}
              whileHover={{ y: -4 }}
              className="lp-card p-6"
            >
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--lp-ink-dim)]">
                {p.stat}
              </p>
              <h3 className="mt-3 text-lg font-medium text-white">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--lp-ink-muted)]">{p.body}</p>
              <a href="/signup" className="lp-link mt-4 inline-block text-sm">
                Learn more
              </a>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Stories / logos */}
      <section id="stories" className="mx-auto max-w-[1200px] px-5 py-20">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="lp-display max-w-2xl text-[clamp(2rem,4vw,3.5rem)] text-white">
            Trusted by teams shipping big meetings
          </h2>
          <a href="/signup" className="lp-link text-sm">
            Read stories
          </a>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {customers.map((name) => (
            <div
              key={name}
              className="lp-card flex h-24 items-center justify-center text-sm font-medium tracking-tight text-[var(--lp-ink-muted)]"
            >
              {name}
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-[1200px] px-5 py-24">
        <h2 className="lp-display text-center text-[clamp(2.2rem,5vw,4rem)] text-white">
          Pricing that stays out of the way
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-center text-[var(--lp-ink-muted)]">
          Start free. Upgrade when CueAI is indispensable.
        </p>
        <div className="mt-14 grid gap-3 lg:grid-cols-3">
          {pricing.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "lp-card relative flex flex-col p-6",
                plan.highlighted && "ring-1 ring-white/25"
              )}
            >
              {plan.highlighted && (
                <span className="absolute -top-2.5 left-5 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-black">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-medium text-white">{plan.name}</h3>
              <p className="mt-1 text-sm text-[var(--lp-ink-muted)]">{plan.desc}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="lp-display text-4xl text-white">{plan.price}</span>
                <span className="text-sm text-[var(--lp-ink-muted)]">{plan.period}</span>
              </div>
              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex gap-2 text-sm text-[var(--lp-ink-muted)]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                    {feat}
                  </li>
                ))}
              </ul>
              <Pill
                href={plan.cta === "Book Demo" ? "/login" : "/signup"}
                variant={plan.highlighted ? "primary" : "ghost"}
                className="mt-8 w-full"
              >
                {plan.cta}
              </Pill>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-[720px] px-5 py-20">
        <h2 className="lp-display text-center text-[clamp(2rem,4vw,3.25rem)] text-white">
          Frequently asked
        </h2>
        <div className="mt-10 space-y-2">
          {faqs.map((item, i) => {
            const open = openFaq === i;
            return (
              <div key={item.q} className="lp-card overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-white"
                  onClick={() => setOpenFaq(open ? null : i)}
                  aria-expanded={open}
                >
                  {item.q}
                  <motion.span animate={{ rotate: open ? 180 : 0 }}>
                    <ChevronDown className="h-4 w-4 text-[var(--lp-ink-muted)]" />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-t border-[var(--lp-hairline)]"
                    >
                      <p className="px-5 py-4 text-sm leading-relaxed text-[var(--lp-ink-muted)]">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </section>

      {/* Closing — Framer style */}
      <section className="mx-auto max-w-[920px] px-5 py-28 text-center">
        <p className="text-sm text-[var(--lp-ink-muted)]">
          CueAI is the AI meeting agent for creating standout rooms
        </p>
        <h2 className="lp-display mt-5 text-[clamp(2.4rem,6vw,4.75rem)] text-white">
          Your next meeting starts here
        </h2>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm text-[var(--lp-ink-dim)]">
          {["Start live session", "Build knowledge base", "Launch companion", "Ship summaries"].map(
            (t) => (
              <span
                key={t}
                className="rounded-full border border-[var(--lp-hairline)] px-3 py-1.5 text-[var(--lp-ink-muted)]"
              >
                {t}
              </span>
            )
          )}
        </div>
        <div className="mt-10 flex justify-center gap-3">
          <Pill href="/signup">
            Get started for free
            <ArrowRight className="h-4 w-4" />
          </Pill>
          <Pill href="/login" variant="ghost">
            Start without AI
          </Pill>
        </div>
      </section>

      <footer className="border-t border-[var(--lp-hairline-soft)]">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-5 py-14 md:flex-row md:justify-between">
          <div>
            <Logo size="sm" />
            <p className="mt-3 max-w-xs text-sm text-[var(--lp-ink-muted)]">
              The AI meeting agent for teams who ship.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {[
              ["Product", ["Agents", "Platform", "Desktop", "Pricing"]],
              ["Company", ["Stories", "Careers", "Blog", "Contact"]],
              ["Legal", ["Privacy", "Terms", "Security", "Status"]],
            ].map(([title, links]) => (
              <div key={title as string}>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--lp-ink-dim)]">
                  {title as string}
                </p>
                <ul className="mt-3 space-y-2">
                  {(links as string[]).map((l) => (
                    <li key={l}>
                      <a href="#agents" className="text-sm text-[var(--lp-ink-muted)] hover:text-white">
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="pb-8 text-center text-xs text-[var(--lp-ink-dim)]">
          © {new Date().getFullYear()} CueAI Inc.
        </div>
      </footer>
    </div>
  );
}
