export const MOCK_INTERVIEW_PATH = "/mock-interview";

/** Link to the Mock Interview page, optionally continuing or re-running an interview. */
export function mockInterviewHref(opts: { session?: string | null; practice?: string | null } = {}): string {
  const q = new URLSearchParams();
  if (opts.session) q.set("session", opts.session);
  if (opts.practice) q.set("practice", opts.practice);
  const s = q.toString();
  return `${MOCK_INTERVIEW_PATH}${s ? `?${s}` : ""}`;
}

/**
 * Mock interview links that used to open inside Live Session (`/meetings/live?mode=mock`,
 * `?session=`, `?practice=`, legacy `?mock=`), rewritten for the Mock Interview page.
 */
export function mockInterviewRedirect(search: string): string | null {
  const params = new URLSearchParams(search);
  const session = params.get("session") || params.get("mock");
  const practice = params.get("practice");
  if (!session && !practice && params.get("mode") !== "mock") return null;
  const href = mockInterviewHref({ session, practice });
  const desktop = params.get("desktop");
  return desktop ? `${href}${href.includes("?") ? "&" : "?"}desktop=${encodeURIComponent(desktop)}` : href;
}
