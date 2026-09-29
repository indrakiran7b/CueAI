/**
 * Email delivery abstraction.
 * Supports Resend (HTTP) and SMTP (nodemailer when installed + SMTP_* env).
 * Never reports success unless the provider accepts the message.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
};

export type EmailSendResult =
  | { ok: true; provider: string; messageId?: string }
  | { ok: false; provider: string; error: string; configured: boolean };

function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isEmailDeliveryConfigured() {
  if (process.env.RESEND_API_KEY) return true;
  return (
    process.env.SMTP_ENABLED === "true" &&
    Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM)
  );
}

async function sendViaResend(message: EmailMessage): Promise<EmailSendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || process.env.SMTP_FROM || "CueAI <onboarding@resend.dev>";
  if (!key) {
    return { ok: false, provider: "resend", error: "RESEND_API_KEY not set", configured: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html || undefined,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; error?: { message?: string } };
  if (!res.ok) {
    return {
      ok: false,
      provider: "resend",
      configured: true,
      error: data.error?.message || data.message || `Resend responded ${res.status}`,
    };
  }
  return { ok: true, provider: "resend", messageId: data.id };
}

async function sendViaSmtp(message: EmailMessage): Promise<EmailSendResult> {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from || process.env.SMTP_ENABLED !== "true") {
    return { ok: false, provider: "smtp", error: "SMTP not configured", configured: false };
  }
  try {
    // Optional dependency — resolve dynamically so TypeScript does not require the package.
    const load = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<{
      createTransport: (opts: Record<string, unknown>) => {
        sendMail: (opts: Record<string, unknown>) => Promise<{ messageId?: string }>;
      };
    }>;
    const nodemailer = await load("nodemailer").catch(() => null);
    if (!nodemailer) {
      return {
        ok: false,
        provider: "smtp",
        configured: true,
        error: "nodemailer is not installed. Add it or set RESEND_API_KEY for HTTP email delivery.",
      };
    }
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
    const info = await transporter.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { ok: true, provider: "smtp", messageId: String(info.messageId || "") };
  } catch (e) {
    return {
      ok: false,
      provider: "smtp",
      configured: true,
      error: e instanceof Error ? e.message : "SMTP send failed",
    };
  }
}

export async function sendEmail(message: EmailMessage): Promise<EmailSendResult> {
  try {
    if (process.env.RESEND_API_KEY) {
      return await sendViaResend(message);
    }
    if (process.env.SMTP_ENABLED === "true" && process.env.SMTP_HOST && process.env.SMTP_FROM) {
      return await sendViaSmtp(message);
    }
    return {
      ok: false,
      provider: "none",
      configured: false,
      error:
        "Email is not configured. Set RESEND_API_KEY or SMTP_ENABLED=true with SMTP_HOST and SMTP_FROM.",
    };
  } catch (e) {
    return {
      ok: false,
      provider: "unknown",
      configured: isEmailDeliveryConfigured(),
      error: e instanceof Error ? e.message : "Email send failed",
    };
  }
}

/** Workspace add notification — links to login only (no accept path). */
export function buildWorkspaceAddedEmail(opts: {
  to: string;
  workspaceName: string;
  role: string;
}) {
  const loginUrl = `${appBaseUrl()}/login`;
  const subject = `You've been added to ${opts.workspaceName}`;
  const text = [
    `Hello,`,
    ``,
    `You have been added to "${opts.workspaceName}" as ${opts.role}.`,
    ``,
    `You can now sign in to CueAI using this email address:`,
    loginUrl,
    ``,
    `Workspace: ${opts.workspaceName}`,
    `Role: ${opts.role}`,
    ``,
    `If you did not expect this, contact your workspace administrator.`,
  ].join("\n");
  const html = `
    <p>Hello,</p>
    <p>You have been added to <strong>${escapeHtml(opts.workspaceName)}</strong> as <strong>${escapeHtml(opts.role)}</strong>.</p>
    <p>You can now sign in using this email address.</p>
    <p><a href="${loginUrl}">Open CueAI</a></p>
    <p style="color:#666;font-size:13px">
      Workspace: ${escapeHtml(opts.workspaceName)}<br/>
      Role: ${escapeHtml(opts.role)}
    </p>
    <p style="color:#666;font-size:12px">If you did not expect this, contact your workspace administrator.</p>
  `.trim();
  return { to: opts.to, subject, text, html, loginUrl };
}
