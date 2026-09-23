import { prisma } from "@/lib/db";

export interface DialWindow {
  start: string; // "09:00"
  end: string; // "20:00"
  days: number[]; // 0 = Sunday … 6 = Saturday
  timezone?: string;
}

export interface BusinessSettings {
  wrapUpSeconds: number;
  autoDialCountdownSeconds: number;
  maxAttempts: number;
  retryIntervalMinutes: number;
  busyRetryMinutes: number;
  lockTtlSeconds: number;
  ringTimeoutSeconds: number;
  recordingEnabled: boolean;
  /** Text describing the announcement policy; actual announcement playback is a provider feature. */
  recordingAnnouncement: string;
  dialWindow: DialWindow;
}

export const DEFAULT_SETTINGS: BusinessSettings = {
  wrapUpSeconds: 60,
  autoDialCountdownSeconds: 5,
  maxAttempts: 3,
  retryIntervalMinutes: 120,
  busyRetryMinutes: 15,
  lockTtlSeconds: 90,
  ringTimeoutSeconds: 30,
  recordingEnabled: false,
  recordingAnnouncement: "",
  dialWindow: { start: "09:00", end: "20:00", days: [0, 1, 2, 3, 4], timezone: "Asia/Jerusalem" },
};

export function mergeSettings(raw: unknown): BusinessSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<BusinessSettings>;
  return {
    ...DEFAULT_SETTINGS,
    ...r,
    dialWindow: { ...DEFAULT_SETTINGS.dialWindow, ...(r.dialWindow ?? {}) },
  };
}

export async function getBusinessSettings(businessId: string): Promise<BusinessSettings & { timezone: string }> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { settings: true, timezone: true } });
  const s = mergeSettings(b?.settings);
  return { ...s, timezone: b?.timezone ?? "Asia/Jerusalem", dialWindow: { ...s.dialWindow, timezone: s.dialWindow.timezone ?? b?.timezone } };
}

/** Is `now` inside the dial window (evaluated in the window's timezone)? */
export function isWithinDialWindow(window: DialWindow, now = new Date()): boolean {
  const tz = window.timezone ?? "Asia/Jerusalem";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  if (!window.days.includes(dayIdx)) return false;
  const cur = hour * 60 + minute;
  const [sh, sm] = window.start.split(":").map(Number);
  const [eh, em] = window.end.split(":").map(Number);
  return cur >= sh * 60 + sm && cur < eh * 60 + em;
}

/** Next moment the dial window opens (approximate: scans forward in 15-minute steps, up to 8 days). */
export function nextDialWindowOpening(window: DialWindow, from = new Date()): Date | null {
  const step = 15 * 60 * 1000;
  for (let t = from.getTime(); t < from.getTime() + 8 * 24 * 3600 * 1000; t += step) {
    const d = new Date(t);
    if (isWithinDialWindow(window, d)) return d;
  }
  return null;
}
