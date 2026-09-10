import type { MeetingRecord } from "@/lib/meetings-catalog";

export type FetchMeetingResult =
  | { ok: true; meeting: MeetingRecord }
  | { ok: false; status: number; error: string };

/** Client fetch for a single meeting. Returns 404-shaped errors for unknown IDs. */
export async function fetchMeeting(id: string): Promise<FetchMeetingResult> {
  const trimmed = id.trim();
  if (!trimmed) {
    return { ok: false, status: 400, error: "Meeting ID is required." };
  }

  try {
    const res = await fetch(`/api/meetings/${encodeURIComponent(trimmed)}`, {
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      meeting?: MeetingRecord;
      error?: string;
    };

    if (res.status === 404) {
      return { ok: false, status: 404, error: data.error || "Meeting not found" };
    }
    if (!res.ok || !data.meeting) {
      return {
        ok: false,
        status: res.status,
        error: data.error || "Failed to load meeting.",
      };
    }
    return { ok: true, meeting: data.meeting };
  } catch {
    return { ok: false, status: 0, error: "Unable to reach the meetings service." };
  }
}
