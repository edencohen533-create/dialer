import { z } from "zod";
import { withAuth, parseBody } from "@/lib/api";
import { ok } from "@/lib/response";
import { prisma } from "@/lib/db";
import { getBusinessSettings, mergeSettings } from "@/lib/settings";
import { telephonyStatus } from "@/lib/telephony";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export const GET = withAuth(async ({ user }) => {
  const b = await prisma.business.findUnique({ where: { id: user.businessId }, select: { id: true, name: true, timezone: true } });
  return ok({ business: b, settings: await getBusinessSettings(user.businessId), telephony: telephonyStatus() });
});

const schema = z.object({
  name: z.string().min(1).max(120).optional(),
  timezone: z.string().optional(),
  settings: z
    .object({
      wrapUpSeconds: z.number().int().min(0).max(600).optional(),
      autoDialCountdownSeconds: z.number().int().min(0).max(60).optional(),
      maxAttempts: z.number().int().min(1).max(20).optional(),
      retryIntervalMinutes: z.number().int().min(1).max(10080).optional(),
      busyRetryMinutes: z.number().int().min(1).max(1440).optional(),
      lockTtlSeconds: z.number().int().min(30).max(600).optional(),
      ringTimeoutSeconds: z.number().int().min(10).max(90).optional(),
      recordingEnabled: z.boolean().optional(),
      recordingAnnouncement: z.string().max(500).optional(),
      dialWindow: z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/), days: z.array(z.number().int().min(0).max(6)), timezone: z.string().optional() }).optional(),
    })
    .optional(),
});

export const PATCH = withAuth(async ({ req, user }) => {
  const b = await parseBody(req, schema);
  const current = await prisma.business.findUnique({ where: { id: user.businessId }, select: { settings: true } });
  const merged = mergeSettings({ ...mergeSettings(current?.settings), ...(b.settings ?? {}) });
  const updated = await prisma.business.update({
    where: { id: user.businessId },
    data: { ...(b.name ? { name: b.name } : {}), ...(b.timezone ? { timezone: b.timezone } : {}), settings: merged as unknown as Prisma.InputJsonValue },
    select: { id: true, name: true, timezone: true, settings: true },
  });
  return ok(updated);
}, { minRole: "admin" });
