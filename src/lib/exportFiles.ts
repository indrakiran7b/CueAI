/** Client-side file downloads for prototype exports (no backend). */

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename: string, text: string, mime = "text/plain;charset=utf-8") {
  downloadBlob(filename, new Blob([text], { type: mime }));
}

/** Word/Google Docs–friendly HTML saved as .doc */
export function downloadDocs(filename: string, title: string, bodyHtml: string) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title,
  )}</title></head><body>${bodyHtml}</body></html>`;
  downloadBlob(
    filename.endsWith(".doc") ? filename : `${filename}.doc`,
    new Blob([html], { type: "application/msword;charset=utf-8" }),
  );
}

/**
 * Minimal multi-page text PDF (no external deps).
 * Good enough for prototype meeting/resume exports.
 */
export function downloadPdf(filename: string, title: string, body: string) {
  const lines = wrapLines(`${title}\n\n${body}`, 86);
  const contentLines: string[] = [];
  let y = 792 - 56;
  const fontSize = 11;
  const leading = 14;

  contentLines.push("BT");
  contentLines.push(`/F1 ${fontSize} Tf`);
  contentLines.push(`${50} ${y} Td`);

  lines.forEach((line, i) => {
    const safe = escapePdf(line);
    if (i === 0) {
      contentLines.push(`(${safe}) Tj`);
    } else {
      contentLines.push(`0 -${leading} Td (${safe}) Tj`);
    }
    y -= leading;
    if (y < 56) {
      // keep single page for prototype; truncate remainder note
      contentLines.push(`0 -${leading} Td (...truncated...) Tj`);
      // stop adding more
      lines.length = i + 1;
    }
  });
  contentLines.push("ET");

  const stream = contentLines.join("\n");
  const objects: string[] = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objects.push(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
  );
  objects.push(`4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`);
  objects.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  downloadBlob(
    filename.endsWith(".pdf") ? filename : `${filename}.pdf`,
    new Blob([pdf], { type: "application/pdf" }),
  );
}

function wrapLines(text: string, width: number): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) {
      out.push("");
      continue;
    }
    let line = raw;
    while (line.length > width) {
      let breakAt = line.lastIndexOf(" ", width);
      if (breakAt < width / 2) breakAt = width;
      out.push(line.slice(0, breakAt));
      line = line.slice(breakAt).trimStart();
    }
    out.push(line);
  }
  return out.slice(0, 48);
}

function escapePdf(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function meetingExportPlain(meeting: {
  title: string;
  day: string;
  duration: string;
  attendees: number;
  executiveSummary: string;
  decisions: string[];
  risks: string[];
  openQuestions: string[];
  actions: { text: string; owner: string; due: string; done?: boolean }[];
  transcript: string;
  followUpEmail: string;
}) {
  const actions = meeting.actions
    .map((a) => `- [${a.done ? "x" : " "}] ${a.text} (${a.owner}, ${a.due})`)
    .join("\n");
  return [
    meeting.title,
    `${meeting.day} · ${meeting.duration} · ${meeting.attendees} attendees`,
    "",
    "Executive summary",
    meeting.executiveSummary,
    "",
    "Key decisions",
    ...meeting.decisions.map((d) => `• ${d}`),
    "",
    "Risks",
    ...meeting.risks.map((r) => `• ${r}`),
    "",
    "Open questions",
    ...meeting.openQuestions.map((q) => `• ${q}`),
    "",
    "Action items",
    actions,
    "",
    "Follow-up email",
    meeting.followUpEmail,
    "",
    "Transcript",
    meeting.transcript,
  ].join("\n");
}

export function meetingExportHtml(meeting: Parameters<typeof meetingExportPlain>[0]) {
  const plain = meetingExportPlain(meeting);
  return `<h1>${escapeHtml(meeting.title)}</h1><pre style="font-family:Segoe UI,Arial,sans-serif;white-space:pre-wrap;font-size:12pt;">${escapeHtml(plain)}</pre>`;
}
