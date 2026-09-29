/**
 * Google Gemini client for live copilot answers.
 *
 * Uses the REST generateContent endpoint directly (no SDK) so the packaged
 * desktop build does not need another dependency.
 * Docs: https://ai.google.dev/api/generate-content
 */
import { ensureAiCatalog, DEFAULT_ENDPOINTS } from "@/lib/server/ai-config";
import { readStore } from "@/lib/server/db";
import { decryptSecret } from "@/lib/server/session";

export const GEMINI_ENDPOINT = DEFAULT_ENDPOINTS.gemini;

/** Vertex publisher endpoint — usage bills the GCP project that owns the API key ($300 credits). */
export const VERTEX_PUBLISHER_ENDPOINT = "https://aiplatform.googleapis.com/v1";

/** Floating alias by default so a model retirement cannot break live answers. */
export const GEMINI_DEFAULT_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

const MODEL_FALLBACKS = [
  GEMINI_DEFAULT_MODEL,
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest",
].filter((v, i, arr) => arr.indexOf(v) === i);

export type GeminiCredentials = {
  apiKey: string;
  endpoint: string;
  model: string;
  /** vertex = GCP / Vertex AI (credits). studio = Google AI Studio. */
  backend: "vertex" | "studio";
  project?: string;
  location?: string;
  /** Where the key came from, for admin diagnostics. */
  source: "workspace" | "env";
};

export class GeminiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

/**
 * Prefer a Gemini provider configured in the admin AI catalog, and fall back to
 * GEMINI_API_KEY so a fresh workspace works without visiting the admin panel.
 */
function vertexProjectPath(project: string, location: string, model: string) {
  return `${VERTEX_PUBLISHER_ENDPOINT}/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
}

function generateUrl(creds: GeminiCredentials, model: string) {
  if (creds.backend === "vertex" && creds.project && creds.location) {
    return vertexProjectPath(creds.project, creds.location, model);
  }
  if (creds.backend === "vertex") {
    return `${VERTEX_PUBLISHER_ENDPOINT}/publishers/google/models/${model}:generateContent`;
  }
  return `${creds.endpoint}/models/${model}:generateContent`;
}

export async function resolveGeminiCredentials(): Promise<GeminiCredentials | null> {
  const envKey =
    process.env.VERTEX_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    "";
  const project =
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    "";
  const location = process.env.GOOGLE_CLOUD_LOCATION?.trim() || "us-central1";
  const preferVertex = process.env.GEMINI_BACKEND !== "studio";

  try {
    const store = await readStore();
    ensureAiCatalog(store.ai);
    const provider = (store.ai.providers || []).find((p) => p.type === "gemini" && p.enabled);
    if (provider) {
      const key = (provider.apiKeyEnc ? decryptSecret(provider.apiKeyEnc) : "") || envKey;
      if (key) {
        const chatModel = (store.ai.models || []).find(
          (m) => m.providerId === provider.id && m.enabled && m.capability === "chat",
        );
        const endpoint = (provider.endpoint || (preferVertex ? VERTEX_PUBLISHER_ENDPOINT : GEMINI_ENDPOINT)).replace(
          /\/$/,
          "",
        );
        const backend: GeminiCredentials["backend"] =
          preferVertex || endpoint.includes("aiplatform.googleapis.com") ? "vertex" : "studio";
        return {
          apiKey: key,
          endpoint,
          model: chatModel?.name || GEMINI_DEFAULT_MODEL,
          backend,
          project: project || undefined,
          location,
          source: provider.apiKeyEnc ? "workspace" : "env",
        };
      }
    }
  } catch {
    // Store problems must not hide a working env key.
  }

  if (!envKey) return null;
  return {
    apiKey: envKey,
    endpoint: preferVertex ? VERTEX_PUBLISHER_ENDPOINT : GEMINI_ENDPOINT,
    model: GEMINI_DEFAULT_MODEL,
    backend: preferVertex ? "vertex" : "studio",
    project: project || undefined,
    location,
    source: "env",
  };
}

export type GeminiTurn = { role: "user" | "model"; text: string };

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  modelVersion?: string;
  error?: { message?: string; status?: string };
};

export type GeminiJsonSchema = {
  type: "OBJECT";
  properties: Record<string, { type: "STRING" | "NUMBER" | "BOOLEAN" | "ARRAY"; items?: unknown }>;
  required?: string[];
};

export type GeminiRequest = {
  credentials: GeminiCredentials;
  system?: string;
  prompt: string;
  history?: GeminiTurn[];
  /** Optional screenshot for Analyze Screen. */
  inlineImage?: { mimeType: string; data: string };
  temperature?: number;
  maxOutputTokens?: number;
  /** MINIMAL keeps live answers fast; raise it for offline analysis. */
  thinkingLevel?: "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";
  jsonSchema?: GeminiJsonSchema;
  signal?: AbortSignal;
};

export type GeminiResult = {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

function buildBody(req: GeminiRequest, includeThinking: boolean) {
  const userParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: req.prompt },
  ];
  if (req.inlineImage?.data) {
    userParts.push({
      inlineData: {
        mimeType: req.inlineImage.mimeType || "image/png",
        data: req.inlineImage.data,
      },
    });
  }

  const contents = [
    ...(req.history || []).map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
    { role: "user" as const, parts: userParts },
  ];

  return {
    contents,
    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
    generationConfig: {
      temperature: req.temperature ?? 0.4,
      maxOutputTokens: req.maxOutputTokens ?? 600,
      ...(req.jsonSchema
        ? { responseMimeType: "application/json", responseSchema: req.jsonSchema }
        : {}),
      ...(includeThinking && req.thinkingLevel
        ? { thinkingConfig: { thinkingLevel: req.thinkingLevel } }
        : {}),
    },
  };
}

async function callModel(req: GeminiRequest, model: string, includeThinking: boolean) {
  const res = await fetch(generateUrl(req.credentials, model), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": req.credentials.apiKey,
    },
    body: JSON.stringify(buildBody(req, includeThinking)),
    signal: req.signal,
  });

  const payload = (await res.json().catch(() => ({}))) as GeminiResponse;
  return { res, payload };
}

/** Generate text, retrying across model aliases when one is unavailable. */
export async function generateGeminiText(req: GeminiRequest): Promise<GeminiResult> {
  const models = [req.credentials.model, ...MODEL_FALLBACKS].filter(
    (v, i, arr) => arr.indexOf(v) === i,
  );

  let lastStatus = 502;
  let lastMessage = "Gemini did not return an answer.";

  for (const model of models) {
    let { res, payload } = await callModel(req, model, true);

    // Older models reject thinkingConfig outright; retry once without it.
    if (res.status === 400 && /thinking/i.test(payload.error?.message || "")) {
      ({ res, payload } = await callModel(req, model, false));
    }

    if (res.ok) {
      const text = (payload.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || "")
        .join("")
        .trim();

      if (text) {
        return {
          text,
          model: payload.modelVersion || model,
          inputTokens: payload.usageMetadata?.promptTokenCount || 0,
          outputTokens: payload.usageMetadata?.candidatesTokenCount || 0,
        };
      }

      const blocked = payload.promptFeedback?.blockReason;
      if (blocked) {
        throw new GeminiError(`Gemini blocked this request (${blocked}).`, 422);
      }
      lastMessage = "Gemini returned an empty answer.";
      continue;
    }

    lastStatus = res.status;
    lastMessage = payload.error?.message || `Gemini responded with ${res.status}.`;
    console.error("gemini_generate_failed", req.credentials.backend, model, res.status, lastMessage.slice(0, 300));

    // Vertex may reject an AI Studio key or a project without billing — retry Studio.
    if (
      req.credentials.backend === "vertex" &&
      (res.status === 400 || res.status === 403 || res.status === 404)
    ) {
      const studioReq = {
        ...req,
        credentials: { ...req.credentials, backend: "studio" as const, endpoint: GEMINI_ENDPOINT },
      };
      const studio = await callModel(studioReq, model, false);
      if (studio.res.ok) {
        const text = (studio.payload.candidates?.[0]?.content?.parts || [])
          .map((p) => p.text || "")
          .join("")
          .trim();
        if (text) {
          return {
            text,
            model: studio.payload.modelVersion || model,
            inputTokens: studio.payload.usageMetadata?.promptTokenCount || 0,
            outputTokens: studio.payload.usageMetadata?.candidatesTokenCount || 0,
          };
        }
      }
    }

    // A bad key or rate limit will fail the same way on every model.
    if (res.status === 401 || res.status === 429) {
      throw new GeminiError(lastMessage, res.status);
    }
    if (res.status === 403 && req.credentials.backend !== "vertex") {
      throw new GeminiError(lastMessage, res.status);
    }
  }

  throw new GeminiError(lastMessage, lastStatus);
}

/** Transcribe an audio clip with Gemini when Groq Whisper is not configured. */
export async function transcribeAudioWithGemini(
  buffer: Buffer,
  mime: string,
): Promise<string> {
  const credentials = await resolveGeminiCredentials();
  if (!credentials) {
    throw new GeminiError("Gemini is not configured for transcription.", 503);
  }

  const data = buffer.toString("base64");
  const audioMime = mime.includes("ogg")
    ? "audio/ogg"
    : mime.includes("mp4") || mime.includes("m4a")
      ? "audio/mp4"
      : mime.includes("wav")
        ? "audio/wav"
        : "audio/webm";

  const models = [credentials.model, ...MODEL_FALLBACKS].filter((v, i, arr) => arr.indexOf(v) === i);
  let lastMessage = "Gemini could not transcribe that audio.";
  const backends: GeminiCredentials[] = [credentials];
  if (credentials.backend === "vertex") {
    backends.push({ ...credentials, backend: "studio", endpoint: GEMINI_ENDPOINT });
  }

  for (const creds of backends) {
    for (const model of models) {
      const res = await fetch(generateUrl(creds, model), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": creds.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: "Transcribe this audio. Return only the spoken words. No timestamps, labels, or commentary. If there is no speech, return an empty string.",
                },
                { inlineData: { mimeType: audioMime, data } },
              ],
            },
          ],
          generationConfig: { temperature: 0, maxOutputTokens: 512 },
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as GeminiResponse;
      if (!res.ok) {
        lastMessage = payload.error?.message || `Gemini STT responded with ${res.status}.`;
        if (res.status === 401) throw new GeminiError(lastMessage, res.status);
        continue;
      }
      return (payload.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || "")
        .join("")
        .trim();
    }
  }

  throw new GeminiError(lastMessage, 502);
}
