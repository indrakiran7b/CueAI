/**
 * Deterministic question understanding for live interview answers.
 * Runs before generation (no extra model call) so it adds ~0ms to latency.
 */

export type ResponseType =
  | "introduction"
  | "behavioral"
  | "coding"
  | "debugging"
  | "scenario"
  | "project"
  | "experience"
  | "comparison"
  | "why"
  | "how_to"
  | "definition"
  | "yes_no"
  | "general";

/** Topic domain; independent of the answer shape in ResponseType. */
export type QuestionCategory =
  | "self_introduction"
  | "resume_background"
  | "behavioral_hr"
  | "project"
  | "technical_concept"
  | "framework_comparison"
  | "programming_language"
  | "coding"
  | "backend_api"
  | "database"
  | "sap_abap"
  | "work_experience"
  | "resume_jd_specific"
  | "system_design"
  | "debugging"
  | "scenario"
  | "follow_up"
  | "ambiguous";

export type QuestionExchange = { question: string; answer: string };

export type QuestionAnalysis = {
  responseType: ResponseType;
  category: QuestionCategory;
  /** Asks about something the candidate personally did or chose ("how did you…", "why did you use…"). */
  personalPast: boolean;
  /** Asks for a credential, key or secret value. */
  asksSecret: boolean;
  /** Long run-on question without punctuation, likely garbled by speech-to-text. */
  malformed: boolean;
  /** Coding task whose wording leaves the expected behavior open (merge, flatten…). */
  ambiguousTask?: string;
  /** Coding task that forbids built-in helpers. */
  noBuiltins: boolean;
  /** Advanced runtime/concurrency/data topic that needs precise mechanics. */
  advanced: boolean;
  /** Asks why the candidate chose something ("why did you…", "why not X?"). */
  asksRationale: boolean;
  /** Normalized question text, used to match topic accuracy notes. */
  topicText: string;
  isFollowUp: boolean;
  /** "the other one", "that one": points at something that may never have been named. */
  vagueReference: boolean;
  multiPart: boolean;
  codeOnly: boolean;
  wantsExample: boolean;
  brevity: "brief" | "normal" | "detailed";
  language?: string;
  languageSource?: "explicit" | "question_context" | "conversation" | "resume" | "target_role" | "system_default";
  needsPersonalContext: boolean;
  complexity: "simple" | "complex";
  /** Likely speech-to-text mishearings of technical terms: [heard, meant]. */
  asrHints: [string, string][];
  /** Speech-to-text flagged parts of the transcript as unreliable. */
  lowConfidence: boolean;
  targetWords: [number, number];
  maxTokens: number;
};

const INTRODUCTION =
  /\b(tell me about yourself|introduce yourself|walk me through your (resume|background|profile)|about your background|self[- ]?introduction|self[- ]intro|introduce (me|myself)|my introduction)\b/i;

const BEHAVIORAL =
  /\b(tell me about a time|describe a (time|situation)|give (me )?an example of a time|a time when you|tell me about a difficult bug|how do you (handle|deal with) (conflict|pressure|stress|criticism|failure|deadlines)|(biggest|greatest) (weakness|strength)|why should we hire|why do you want (to work|this (job|role))|where do you see yourself|disagree(d)? with (your|a) (manager|teammate|colleague))\b/i;

const CODING =
  /\b(write|implement|code|program)\b[^?.]{0,60}\b(function|program|code|query|class|method|script|algorithm|solution|report)\b|\bimplement\b[^?.]{0,70}\b(rate limiter|cache|queue|stack|tree|graph|service)\b|\bwrite (a|an|the) (sql |python |java |javascript |abap )?(query|program|function|report)\b|\b(a |the )?program (to|that|for)\b|\b(reverse|sort|find|count|remove|merge)\b[^?.]{0,40}\b(array|list|string|linked list|duplicates|words|numbers|intervals)\b[^?.]{0,30}\b(in|using) (python|java|javascript|sql|c\+\+|abap)\b|^(given\b[^?.]{0,40}\b)?(merge|flatten|reverse|sort|rotate|dedupe|deduplicate|remove duplicates (from|in)|find (the )?(second )?(largest|smallest|max|min|duplicates?|missing))\b[^?]{0,60}\b(arrays?|lists?|strings?|numbers?|elements?|integers?|intervals?)\b|^find\b[^?]{0,30}\b(?:second|third|n(?:th)?)[- ]highest salary\b/i;

/** Past-tense personal questions are about the candidate's own work, so they need the resume. */
const PERSONAL_PAST =
  /\b(how|why|which|what|where|when) (did|have) you\b|\bdid you (use|choose|pick|build|implement|parse|pass|handle|store|deploy|test|train|integrate)\b|\byou (used|chose|picked|built|implemented|deployed)\b/i;

const PERSONAL_CHOICE = /\b(instead of|over|rather than|vs\.?|versus|and not)\b|^(and |so |but )?why not\b/i;

const SYSTEM_DESIGN =
  /\bsystem design\b|\b(design|architect)\b[^?.]{0,40}\b(system|service|url shortener|shortener|chat|feed|rate limiter|cache|notification|payment|booking|platform|backend|api)\b/i;

const SECRET = /\b(api[ -]?keys?|secret( key)?s?|access tokens?|credentials?|passwords?)\b/i;

/** Topics that need precise mechanics rather than a one-line definition. */
const ADVANCED_TECH =
  /\b(event[- ]?loop|asyncio|async ?io|asgi|wsgi|gil|global interpreter lock|concurren\w*|parallelism|race condition|deadlock|cancel\w*|starvation|backpressure|task ?group|coroutines?|garbage collect\w*|memory leak|isolation level|transactions?|indexing|sharding|replication|consistency|idempotenc\w*|distributed|thread[- ]?safe\w*|mutex|semaphore)\b/i;

const BACKEND_API =
  /\b(rest(ful)?|api|endpoint|http|flask|fastapi|django|express|spring|middleware|jwt|oauth|auth(entication|orization)?|cors|status codes?|graphql|websocket|asgi|wsgi)\b/i;
const DATABASE =
  /\b(sql|mysql|postgres\w*|mongodb|nosql|database|db|query|queries|join|index(es|ing)?|normali[sz]ation|primary key|foreign key|transaction|orm|sqlalchemy|redis)\b/i;
const SAP_ABAP =
  /\b(sap|abap|bapi|badi|rfc|idoc|odata|cds views?|amdp|open sql|internal tables?|user exits?|customer exits?|enhancement points?|se38|st05|sat|sm37|we0[25]|bd87)\b/i;
const FRAMEWORKS =
  /\b(flask|fastapi|django|express|spring( boot)?|react(js)?|angular|vue|next\.?js|node(\.js)?|laravel|rails|pytorch|tensorflow|pandas|numpy|selenium|playwright|cypress|pytest|junit)\b/gi;
const LANGUAGE_ONLY =
  /^(and |so )?(what is|what's|explain|define)\s+(python|java|javascript|typescript|php|c\+\+|c#|go|golang|ruby|rust|kotlin|swift|sql|html|css)\s*\??$/i;

const DEBUGGING =
  /\b(debug|troubleshoot|flaky|root cause)\b|\b(fix|investigate)\b[^?.]{0,60}\b(bug|issue|failure|error|exception|leak|bottleneck|slow)\b|\b(slow|latency|timeout)\b[^?.]{0,50}\b(concurrent|under load|production)\b|\b(fails|failing|crash(es|ing)?)\b[^?.]{0,40}\b(how|why|what)\b|\b(how|what) would you do if\b[^?.]{0,40}\b(fails|breaks|is slow|crash)/i;

const SCENARIO =
  /^(suppose|imagine|let'?s say|say you|assume|if you (had|were|need)|what would you do|how would you (handle|approach|design|scale|test|prioriti[sz]e|deal))\b|\bhow would you (design|architect|scale)\b/i;

const PROJECT =
  /\b(your|the|one) (last |current |final[- ]year |recent )?project\b|\bproject from your resume\b|\btechnical decision in a project\b|\btechnologies in your project\b|\bin your (project|experience|last (role|job|company)|current (role|job|company))\b|\bhow (have|did) you (use|used|implement|implemented|apply|applied|build|built)\b|\byou (have )?(used|built|implemented|worked on)\b[^?.]{0,30}\bproject\b/i;

const EXPERIENCE =
  /\b(have you (ever )?(used|worked (with|on)|done|tested|written|automated|learned|learnt)|do you have (any )?experience|how (much|many years of) experience|are you (familiar|comfortable|good|experienced) (with|at|in)|do you know|do you use|can you work (with|in))\b/i;

const COMPARISON =
  /\b(difference(s)? between|differ(s|ent)? from|vs\.?|versus|compare|compared (to|with)|which is (better|faster|preferred)|pros and cons)\b|\bwhen (would|should|do) you use\b[^?]{0,60}\b(instead of|over|rather than|vs)\b/i;

const WHY = /^(and |so |but )?why\b/i;
const HOW_TO = /^(and |so |but )?(how (do|does|would|can|could|should|to|is|are)|what are the steps)\b/i;
const DEFINITION =
  /^(and |so )?(what (is|are|'s|was|were) (a |an |the )?|define\b|what do you (mean|understand) by\b|explain (the concept of|what)\b|can you explain what\b)/i;
const YES_NO = /^(is|are|can|could|does|do|should|will|would|has|have|was|were)\b/i;

const EXPLICIT_FOLLOW_UP =
  /\b(you mentioned|you said|you talked about|earlier you|as you said|going back to|following up|follow[- ]up|you just (said|mentioned)|in that case|based on (that|your answer))\b/i;
const LEADING_CONNECTOR = /^(and|so|but|then|also|okay so|ok so|right so|alright)\b/i;
const PRONOUN_REFERENCE =
  /\b(it|that|this|those|these|they|them|its|such)\b/i;
const VAGUE_REFERENCE = /\b(the other (one|ones|thing|part)|that one|this one|the (first|second|third|last) one|the former|the latter)\b/i;

const CODE_ONLY = /\b(code only|only (the )?code|just (the )?code|just write (it|the code))\b/i;
const BRIEF = /\b(briefly|in brief|in short|one (line|sentence|word)|quick(ly)?|short answer|in a nutshell|tl;?dr|keep it short)\b/i;
const DETAILED = /\b(in detail|in depth|deep dive|elaborate|thoroughly|step by step|walk me through)\b/i;
const EXAMPLE = /\b(example|for instance|show me|demonstrate|real[- ]world)\b/i;

const LANGUAGES: [RegExp, string][] = [
  [/\babap\b/i, "ABAP"],
  [/\bpython\b/i, "Python"],
  [/\btype ?script\b/i, "TypeScript"],
  [/\bjava ?script\b|\bnode(\.js| js)?\b|\breact(?:\.js| js)?\b/i, "JavaScript"],
  [/\bjava\b/i, "Java"],
  [/\bc\+\+|\bc plus plus\b|\bcpp\b/i, "C++"],
  [/\bc#|\bc sharp\b/i, "C#"],
  [/\bgolang\b|\bgo (lang|language)\b/i, "Go"],
  [/\bsql\b|\bsequel\b|\bmysql\b|\bpostgres/i, "SQL"],
  [/\bkotlin\b/i, "Kotlin"],
  [/\bswift\b/i, "Swift"],
  [/\brust\b/i, "Rust"],
  [/\bruby\b/i, "Ruby"],
  [/\bphp\b/i, "PHP"],
  [/\bc language\b|\busing c(?!\s*(?:\+\+|#))\b|\bin c(?!\s*(?:\+\+|#))\b|\binc,?\s+(?=(?:write|implement|code|program|function)\b)/i, "C"],
];

export type LanguageSelection = {
  language?: string;
  source?: QuestionAnalysis["languageSource"];
};

function languageIn(text: string): string | undefined {
  return LANGUAGES.map(([re, language], priority) => ({
    language,
    priority,
    index: text.search(re),
  }))
    .filter((match) => match.index >= 0)
    .sort((a, b) => a.index - b.index || a.priority - b.priority)[0]?.language;
}

function resumeSkillText(context: string): string {
  const normalized = context.replace(/\r/g, "");
  const section = /(?:^|\n)\s*(?:technical\s+)?skills?\s*:?\s*\n?([\s\S]*?)(?=\n\s*(?:experience|employment|projects?|education|certifications?|achievements?|summary|profile)\s*:?\s*(?:\n|$)|$)/i.exec(
    normalized,
  )?.[1];
  return section?.trim() || normalized;
}

function languageFromResume(context: string): string | undefined {
  const skills = resumeSkillText(context);
  const cIndex = skills.search(/(?:^|[,;|/\s])C(?=$|[,;|/\s])/);
  const found = LANGUAGES.map(([re, language], priority) => ({
    language,
    priority,
    index: skills.search(re),
  })).filter((match) => match.index >= 0);
  if (cIndex >= 0) found.push({ language: "C", priority: LANGUAGES.length, index: cIndex });
  return found.sort((a, b) => a.index - b.index || a.priority - b.priority)[0]?.language;
}

/**
 * Select code language without a model call. Explicit wording wins, followed by
 * the current question/code context, active conversation, verified resume and
 * target role. JavaScript is only a transparent last resort when no evidence
 * exists; Python is never an implicit default.
 */
export function selectProgrammingLanguage(input: {
  question: string;
  history?: QuestionExchange[];
  transcript?: { who: string; text: string }[];
  verifiedContext?: string;
  targetRole?: string;
}): LanguageSelection {
  const explicit = languageIn(input.question);
  if (explicit) return { language: explicit, source: "explicit" };
  if (SAP_ABAP.test(input.question) && /\b(code|program|implement|write|class|report)\b/i.test(input.question)) {
    return { language: "ABAP", source: "question_context" };
  }
  if (DATABASE.test(input.question) && /\b(query|sql|database)\b/i.test(input.question)) {
    return { language: "SQL", source: "question_context" };
  }
  if (/\b(?:second|third|n(?:th)?)[- ]highest salary\b|\bemployees?\b[^?.]{0,40}\bsalar(?:y|ies)\b/i.test(input.question)) {
    return { language: "SQL", source: "question_context" };
  }
  const conversation = [
    ...(input.history || []).slice(-4).flatMap((h) => [h.question, h.answer]),
    ...(input.transcript || []).slice(-6).map((l) => l.text),
  ].join("\n");
  const established = languageIn(conversation);
  if (established) return { language: established, source: "conversation" };
  const resumeLanguage = languageFromResume(input.verifiedContext || "");
  if (resumeLanguage) return { language: resumeLanguage, source: "resume" };
  const roleLanguage = languageIn(input.targetRole || "");
  if (roleLanguage) return { language: roleLanguage, source: "target_role" };
  return { language: "JavaScript", source: "system_default" };
}

/** Common Whisper mishearings in technical interviews. Hints only — never rewrite the question. */
const ASR_TERMS: { heard: RegExp; meant: string; when?: RegExp }[] = [
  { heard: /\binc\b/i, meant: "in C", when: /\b(write|implement|code|program|function|linked list|pointer)\b/i },
  { heard: /\b(two|too) ?pulls?\b|\bto pulls\b/i, meant: "tuple" },
  { heard: /\bto pull\b/i, meant: "tuple", when: /\b(list|python|immutable|mutable|dictionary|set)\b/i },
  { heard: /\bmy ?sequel\b/i, meant: "MySQL" },
  { heard: /\bpost ?gray(s)?\b|\bpost ?gress?\b/i, meant: "PostgreSQL" },
  { heard: /\bno ?sequel\b/i, meant: "NoSQL" },
  { heard: /\b(cube|cuber|kuber) ?(net(t)?(i|e)s|nettie|nettis)\b/i, meant: "Kubernetes" },
  { heard: /\b(pie|pi) ?test\b|\bpy test\b/i, meant: "pytest" },
  { heard: /\bnum ?pie\b/i, meant: "NumPy" },
  { heard: /\bjango\b/i, meant: "Django" },
  { heard: /\bjay ?son\b/i, meant: "JSON" },
  { heard: /\bjason\b/i, meant: "JSON", when: /\b(api|response|payload|parse|format|data|xml|object)\b/i },
  { heard: /\bx ?pad\b|\bex path\b/i, meant: "XPath" },
  { heard: /\bsprint boot\b/i, meant: "Spring Boot" },
  { heard: /\bpost man\b/i, meant: "Postman" },
  { heard: /\bget hub\b/i, meant: "GitHub" },
  { heard: /\b(cafe|coffee) ?ka\b/i, meant: "Kafka" },
  { heard: /\bsell?enium\b|\bcelenium\b/i, meant: "Selenium" },
  { heard: /\bjen kins\b/i, meant: "Jenkins" },
  { heard: /\bpolly ?morph(ism)?\b|\bpoly morph(ism)?\b/i, meant: "polymorphism" },
  { heard: /\boops\b/i, meant: "OOP (object-oriented programming)", when: /\b(concept|pillar|principle|java|python|class|object)s?\b/i },
  { heard: /\bsequel\b(?! to\b)/i, meant: "SQL" },
];

const BUDGETS: Record<ResponseType, [number, number]> = {
  introduction: [80, 140],
  behavioral: [90, 150],
  coding: [40, 120],
  debugging: [70, 130],
  scenario: [70, 130],
  project: [70, 130],
  experience: [40, 90],
  comparison: [50, 100],
  why: [40, 90],
  how_to: [50, 100],
  definition: [30, 70],
  yes_no: [25, 60],
  general: [40, 90],
};

function classify(q: string): ResponseType {
  if (INTRODUCTION.test(q)) return "introduction";
  if (BEHAVIORAL.test(q)) return "behavioral";
  if (CODING.test(q)) return "coding";
  if (DEBUGGING.test(q)) return "debugging";
  if (PROJECT.test(q) || PERSONAL_PAST.test(q) || /\b(explain|describe|walk me through) (your|the|my) project\b/i.test(q)) return "project";
  if (PERSONAL_PAST.test(q) && PERSONAL_CHOICE.test(q)) return "comparison";
  if (COMPARISON.test(q)) return "comparison";
  if (SCENARIO.test(q) || SYSTEM_DESIGN.test(q)) return "scenario";
  if (EXPERIENCE.test(q)) return "experience";
  if (WHY.test(q)) return "why";
  if (DEFINITION.test(q)) return "definition";
  if (HOW_TO.test(q)) return "how_to";
  if (YES_NO.test(q)) return "yes_no";
  return "general";
}

function categorize(q: string, type: ResponseType, isFollowUp: boolean, malformed: boolean): QuestionCategory {
  if (type === "introduction") return "self_introduction";
  if (type === "behavioral") return "behavioral_hr";
  if (SAP_ABAP.test(q)) return "sap_abap";
  if (type === "coding") return "coding";
  if (type === "debugging") return "debugging";
  if (type === "project") return "project";
  if (SYSTEM_DESIGN.test(q)) return "system_design";
  if (type === "scenario") return "scenario";
  if (type === "experience") return "resume_background";
  if (isFollowUp && q.split(" ").length <= 6) return "follow_up";
  if (malformed && type === "general") return "ambiguous";
  if (type === "comparison" && (q.match(FRAMEWORKS) || []).length >= 1) return "framework_comparison";
  if (LANGUAGE_ONLY.test(q)) return "programming_language";
  if (DATABASE.test(q) && !BACKEND_API.test(q)) return "database";
  if (BACKEND_API.test(q)) return "backend_api";
  if (DATABASE.test(q)) return "database";
  return "technical_concept";
}

function ambiguousCodingTask(q: string): string | undefined {
  if (/\bmerge\b/i.test(q) && !/\bsorted\b|\bmerge sort\b/i.test(q)) {
    return 'Ambiguous: "merge" could mean concatenate, merge two sorted arrays keeping order, or merge without duplicates.';
  }
  if (/\bflatten\b/i.test(q) && !/\b(one level|single level|deep(ly)?|any depth|fully)\b/i.test(q)) {
    return 'Ambiguous: "flatten" could mean one level or any depth, and whether the input may be mutated.';
  }
  if (/\b(remove|delete) duplicates\b/i.test(q) && !/\b(order|sorted)\b/i.test(q)) {
    return "Ambiguous: whether the original order must be preserved.";
  }
  return undefined;
}

function countParts(q: string): number {
  const marks = (q.match(/\?/g) || []).length;
  const joins = (q.match(/\b(and|also|plus)\s+(when|why|how|what|which|where|can you|could you)\b/gi) || []).length;
  return Math.max(marks, 1 + joins);
}

export function detectAsrHints(text: string): [string, string][] {
  const hints: [string, string][] = [];
  for (const { heard: re, meant, when } of ASR_TERMS) {
    const m = text.match(re);
    if (!m) continue;
    if (when && !when.test(text)) continue;
    const heard = m[0];
    if (heard.toLowerCase() === meant.toLowerCase()) continue;
    if (!hints.some(([, existing]) => existing === meant)) hints.push([heard, meant]);
  }
  return hints.slice(0, 4);
}

export function analyzeQuestion(
  question: string,
  context: {
    history?: QuestionExchange[];
    transcript?: { who: string; text: string }[];
    uncertain?: boolean;
    verifiedContext?: string;
    targetRole?: string;
  } = {},
): QuestionAnalysis {
  const q = question.trim().replace(/\s+/g, " ");
  const hasPrior =
    (context.history?.length || 0) > 0 ||
    (context.transcript || []).some((l) => l.text.trim() && l.text.trim() !== q);

  let responseType = classify(q);
  const asrHints = detectAsrHints(q);
  const selectedLanguage =
    responseType === "coding"
      ? selectProgrammingLanguage({
          question: q,
          history: context.history,
          transcript: context.transcript,
          verifiedContext: context.verifiedContext,
          targetRole: context.targetRole,
        })
      : { language: languageIn(q), source: languageIn(q) ? ("explicit" as const) : undefined };
  const language = selectedLanguage.language;

  const words = q.split(" ").length;
  const explicitFollowUp = EXPLICIT_FOLLOW_UP.test(q);
  const connectorFollowUp = hasPrior && LEADING_CONNECTOR.test(q);
  // Short questions that point at "it/that" without naming a subject depend on the last turn.
  const pronounFollowUp =
    hasPrior && words <= 14 && PRONOUN_REFERENCE.test(q) && !language && asrHints.length === 0;
  const vagueReference = words <= 12 && VAGUE_REFERENCE.test(q);
  // "Why?", "Why not GPT?", "How so?" only make sense against the previous turn.
  const terseFollowUp = hasPrior && words <= 4 && /^(and |so |but )?(why|how( so)?|what about|why not|really|meaning)\b/i.test(q);
  const isFollowUp = explicitFollowUp || connectorFollowUp || pronounFollowUp || terseFollowUp || (hasPrior && vagueReference);
  const personalPast = PERSONAL_PAST.test(q);
  const asksSecret = SECRET.test(q);
  const malformed = words >= 16 && !/[?.!,;]/.test(q);
  const advanced = ADVANCED_TECH.test(q);
  const ambiguousTask = responseType === "coding" ? ambiguousCodingTask(q) : undefined;

  const codeOnly = CODE_ONLY.test(q);
  if (codeOnly && responseType !== "coding") responseType = "coding";
  const multiPart = countParts(q) > 1;
  const wantsExample = EXAMPLE.test(q) && responseType !== "behavioral";
  const brevity: QuestionAnalysis["brevity"] = BRIEF.test(q)
    ? "brief"
    : DETAILED.test(q)
      ? "detailed"
      : "normal";

  // Terse follow-ups ("Why not GPT?") usually continue a personal/project thread.
  const needsPersonalContext =
    ["introduction", "behavioral", "project", "experience"].includes(responseType) ||
    personalPast ||
    terseFollowUp ||
    /\b(your|yourself|did you|have you|you used|do you (know|have|use|like|prefer))\b/i.test(q);

  const complexity: QuestionAnalysis["complexity"] =
    ["coding", "debugging", "scenario"].includes(responseType) || multiPart || brevity === "detailed" || advanced || malformed
      ? "complex"
      : "simple";

  let [lo, hi] = BUDGETS[responseType];
  if (advanced && responseType !== "coding") [lo, hi] = [Math.max(lo, 90), Math.max(hi, 170)];
  else if (SYSTEM_DESIGN.test(q)) [lo, hi] = [Math.max(lo, 100), Math.max(hi, 180)];
  if (brevity === "brief") [lo, hi] = [Math.min(lo, 20), Math.min(hi, 50)];
  if (brevity === "detailed") [lo, hi] = [hi, Math.round(hi * 1.6)];
  if (multiPart && brevity !== "brief") hi = Math.round(hi * 1.3);

  // ~1.6 tokens/word for prose; code needs far more room.
  const maxTokens =
    responseType === "coding" ? (codeOnly ? 600 : 750) : Math.min(700, Math.round(hi * 1.9) + 60);

  return {
    responseType,
    category: categorize(q, responseType, isFollowUp, malformed),
    personalPast,
    asksSecret,
    malformed,
    ambiguousTask,
    advanced,
    topicText: q,
    asksRationale:
      /\bwhy (did|do|would|have) you\b|\bwhy (choose|chose|pick|use|go with)\b/i.test(q) ||
      (/^(and |so |but )?why( not)?\b/i.test(q) && (terseFollowUp || personalPast)),
    noBuiltins: responseType === "coding" && /\bwithout (using )?(any )?(built[- ]?in|inbuilt|library|libraries)\b/i.test(q),
    isFollowUp,
    vagueReference,
    multiPart,
    codeOnly,
    wantsExample,
    brevity,
    language,
    languageSource: selectedLanguage.source,
    needsPersonalContext,
    complexity,
    asrHints,
    lowConfidence: context.uncertain === true,
    targetWords: [lo, hi],
    maxTokens,
  };
}

/** Facts interviewers probe on topics where models commonly slip; injected only when the topic matches. */
const TOPIC_HINTS: [RegExp, string][] = [
  [
    /\brate limiter|token bucket|sliding window|leaky bucket\b/i,
    "A thread-safe limiter needs one atomic decision for refill/check/decrement. In one process use a mutex or an atomic/serialized critical section; across processes use a shared store with an atomic script or transaction. Polling loops and independent timers do not guarantee FIFO fairness. Use a monotonic clock, bound bursts, define rejection or waiting behavior, and cover clock jumps, cancellation, shutdown and distributed contention.",
  ],
  [
    /\b(event[- ]?loop|asyncio|async ?io|starv\w*|blocking call|coroutines?)\b/i,
    "asyncio runs all coroutines on one thread, so any blocking call or long CPU loop stalls every task. Offload blocking I/O with asyncio.to_thread or loop.run_in_executor. CPU-bound pure-Python code in a thread still contends for the GIL (except free-threaded builds), so chunk it and await asyncio.sleep(0) between chunks, or move it to a process pool if allowed. Awaiting something that is already complete may not yield. Debug mode (PYTHONASYNCIODEBUG=1, loop.slow_callback_duration) reports slow callbacks.",
  ],
  [
    /\b(cancelled ?error|task ?group|asyncio\.shield)\b|\b(cancel\w*|disconnect\w*)\b.*\b(async\w*|tasks?|asgi|coroutines?)\b|\b(async\w*|tasks?|asgi|coroutines?)\b.*\b(cancel\w*|disconnect\w*)\b/i,
    "task.cancel() raises CancelledError at the task's next await; clean up in try/finally or async with, and if you catch CancelledError, re-raise it. asyncio.TaskGroup (Python 3.11+) cancels the remaining children when one child fails or the enclosing task is cancelled, waits for them, and raises an ExceptionGroup for failures. asyncio.shield protects the inner awaitable, but the awaiting task is still cancelled. On ASGI client disconnect the server sends http.disconnect; whether the handler is cancelled depends on the framework (e.g., Starlette cancels a StreamingResponse, while a regular endpoint keeps running unless it checks request.is_disconnected()).",
  ],
  [
    /\b(gil|global interpreter lock|multithreading|multiprocessing)\b/i,
    "In CPython the GIL lets only one thread run Python bytecode at a time, so threads help I/O-bound work but not CPU-bound pure-Python work; multiprocessing or native extensions that release the GIL give real parallelism (free-threaded 3.13+ builds are the exception).",
  ],
];

const TYPE_DIRECTIVES: Record<ResponseType, string> = {
  introduction:
    "Self-introduction: a ready-to-say first-person intro of about 45-75 seconds: name and current status (degree/role) from the briefing, core skills that overlap the job, one or two real projects or internships with what the candidate actually did, and one closing line on why this role fits. Use only resume facts; job requirements the resume lacks may only be mentioned as interest or learning. Omit any detail the resume doesn't give (such as the college name) — never fill it with an invented or placeholder name.",
  behavioral:
    "Behavioral: use STAR briefly only when the briefing explicitly documents that event, the candidate's action, and the result. Project technologies or generic responsibilities are not evidence that a particular bug, conflict, outage, deadline, or decision happened. If no real story is documented, say that the supplied background does not include a specific example and give a clearly labeled STAR framework the candidate must personalize; never synthesize an incident from nearby project facts.",
  coding:
    "Coding: use the selected language from the evidence-based language routing below; never silently default to Python. State the selected language briefly unless the interviewer requested code only. Give correct code in one fenced block with the matching language tag and version-appropriate APIs. Handle important edge cases. After the code, explain the algorithm and important lines, give a real sample when useful, and include time/space complexity. Never claim the code was executed unless diagnostics confirm that it was.",
  debugging:
    "Debugging: lead with the most likely causes, then the concrete steps you would take to isolate and fix it, in order.",
  scenario:
    "Scenario: state the recommended approach first, then the key steps and one trade-off.",
  project:
    "Project question: answer from the briefing's project facts only, in first person. For a full project explanation use: what it does and for whom (as the resume describes it), architecture and flow (input -> processing -> output), technologies with the role each played, your contribution, how it was tested exactly as stated, and the result as stated. Mention a challenge only if the resume names one; otherwise you may name one honest limitation or next improvement, framed as such. Attribute each tool to the project or internship it is listed under — never move tools between them. For a narrow question (\"how did you…\", \"which… did you use\") answer exactly that step with the actual library/service/flow from the briefing. If a detail is not in the briefing, say it plainly (\"I didn't track that\", \"that part wasn't in scope\") or describe how you would do it, clearly marked as such. Never invent metrics, users, team size, deployment, or rationale.",
  experience:
    "Experience question: answer honestly from the briefing first (yes / some exposure / not yet), then explain the technology correctly in a few sentences. If it is not in the candidate's background, say so plainly and describe related skills or how you'd ramp up — do not claim projects with it.",
  comparison:
    "Comparison: state the core difference first, then contrast both sides on the practical points that matter, and say when to use each. If the question asks why the candidate chose one option, give the reason only if the briefing states it; otherwise ground the answer in the project's real needs (e.g., size, sync vs async, what the candidate knew) and present the trade-off honestly without claiming a deliberate decision that isn't documented.",
  why: "Why question: give the main reason first, then one supporting reason or consequence.",
  how_to: "How question: describe the process as clear ordered steps in spoken form.",
  definition:
    "Definition: one-sentence definition, then how it works or why it matters, plus a tiny example if helpful.",
  yes_no: "Yes/no question: answer yes or no first, then justify in a sentence or two.",
  general: "Answer the exact question directly and concretely.",
};

/** Compact per-question guidance injected into the user prompt. */
export function describeAnalysis(a: QuestionAnalysis, history: QuestionExchange[] = []): string {
  const lines = [`Type: ${a.responseType}. ${TYPE_DIRECTIVES[a.responseType]}`];
  if (a.isFollowUp) {
    const last = history[history.length - 1];
    lines.push(
      last
        ? `Follow-up to the previous question ("${last.question.slice(0, 140)}"). Resolve "it/that/you mentioned" against that exchange, answer only the new angle, and do not repeat the earlier answer.`
        : "Follow-up: resolve references using the recent transcript; answer only the new angle.",
    );
  }
  if (a.vagueReference) {
    lines.push(
      'Vague reference: resolve it only if the conversation explicitly named the options it points to. Otherwise output just one short clarifying question, e.g. "Sorry, which one do you mean?" — never introduce a topic nobody mentioned.',
    );
  }
  if (a.category === "system_design") {
    lines.push(
      "System design: clarify the core requirements in one line, then cover API, data model, high-level components, the key scaling choice, and one trade-off. Keep it spoken, not a document.",
    );
  }
  if (a.category === "sap_abap") {
    lines.push(
      "SAP/ABAP: identify the exact SAP area, distinguish related concepts precisely, and include a practical example or diagnostic sequence. State version or system assumptions when behavior varies. Never claim SAP project experience unless verified context explicitly supports it.",
    );
  }
  if (a.malformed) {
    lines.push(
      "The question is a run-on transcript. Infer the most likely technical question, restate it in a few words at the start (e.g., \"So, on what happens to tasks when the client disconnects:\"), then answer every part.",
    );
  }
  if (a.advanced && a.responseType !== "coding") {
    lines.push(
      "Advanced topic: be precise about mechanics and edge cases (exact exception names, what is and isn't guaranteed). Prefer current, non-deprecated APIs and name version requirements when relevant.",
    );
  }
  for (const [re, hint] of TOPIC_HINTS) if (re.test(a.topicText)) lines.push(`Accuracy notes: ${hint}`);
  if (a.asksRationale) {
    lines.push(
      "Rationale question: if the resume does not state why the choice was made, do not invent reasons (cost, free tier, benchmarks, team decisions). Say honestly that you didn't run a formal comparison if that is the case, then give the factual trade-offs between the options and name the alternative from the question explicitly.",
    );
  }
  if (a.ambiguousTask) {
    lines.push(
      `${a.ambiguousTask} State your assumption in one short sentence, solve that version, and name the alternative interpretation in one sentence.`,
    );
  }
  if (a.noBuiltins) {
    lines.push(
      "\"Without built-in functions\": do not use helpers such as math.isqrt, sqrt, sum, any, all, sorted, set or imported libraries for the core logic; basic syntax plus input(), int(), print() and range() is fine.",
    );
  }
  if (a.asksSecret) {
    lines.push(
      "Credential question: never output a key, token or password value. Name the provider/model and where the key is kept (e.g., environment variable, secret manager) only as the briefing states; if storage isn't stated, say how you keep keys out of code.",
    );
  }
  if (a.multiPart) lines.push("Multi-part: answer every part, in the order asked.");
  if (a.codeOnly) lines.push("The interviewer asked for code only: return just the code block.");
  if (a.wantsExample && a.responseType !== "coding") lines.push("Include one short concrete example.");
  if (a.language) {
    lines.push(
      `Selected language: ${a.language} (source: ${a.languageSource || "question context"}). Use it consistently and do not switch languages unless the interviewer explicitly asks.`,
    );
  }
  if (a.asrHints.length) {
    lines.push(
      `Speech-to-text likely misheard: ${a.asrHints.map(([heard, meant]) => `"${heard}" = ${meant}`).join("; ")}. Answer the intended term without mentioning the mishearing.`,
    );
  }
  if (a.lowConfidence) {
    lines.push(
      "The transcript is low-confidence (speech-to-text was unsure). If the intended question is still clear, answer it. If a key word is ambiguous enough that you could answer the wrong question, give one short clarifying question instead of guessing.",
    );
  }
  if (!a.codeOnly) {
    lines.push(
      a.responseType === "coding"
        ? `Keep prose to about ${a.targetWords[0]}-${a.targetWords[1]} words besides the code.`
        : `Length: about ${a.targetWords[0]}-${a.targetWords[1]} words.`,
    );
  }
  return lines.join("\n");
}
