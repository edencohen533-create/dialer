/**
 * Lead queue: atomic claim (FOR UPDATE SKIP LOCKED), lock renewal, release,
 * skip and outcome application. All operations are business-scoped.
 */
import crypto from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import type { OutcomeKey } from "@/generated/prisma/enums";
import { prisma, dbSchema } from "@/lib/db";
import { ApiError } from "@/lib/response";
import { OUTCOME_BY_KEY } from "@/lib/outcomes";
import { getBusinessSettings, isWithinDialWindow, nextDialWindowOpening, type DialWindow } from "@/lib/settings";
import { audit } from "@/lib/audit";

const CALLBACK_GRACE_MINUTES = 60;

export async function isDnc(businessId: string, phoneE164: string) {
  const hit = await prisma.dncEntry.findUnique({ where: { businessId_phoneE164: { businessId, phoneE164 } }, select: { id: true } });
  return Boolean(hit);
}

export async function listDialWindow(businessId: string, listId: string | null): Promise<DialWindow> {
  const settings = await getBusinessSettings(businessId);
  if (!listId) return settings.dialWindow;
  const list = await prisma.dialList.findUnique({ where: { id: listId }, select: { dialWindowJson: true } });
  const w = list?.dialWindowJson as Partial<DialWindow> | null;
  return { ...settings.dialWindow, ...(w ?? {}) };
}

/** Make sure the agent may work this list. */
export async function assertListAccess(businessId: string, userId: string, role: string, listId: string) {
  const list = await prisma.dialList.findFirst({ where: { id: listId, businessId }, select: { id: true, isActive: true, agents: { select: { userId: true } } } });
  if (!list) throw new ApiError("רשימה לא נמצאה", 404, "not_found");
  if (!list.isActive) throw new ApiError("הרשימה אינה פעילה", 400, "list_inactive");
  if (role === "agent" && list.agents.length > 0 && !list.agents.some((a) => a.userId === userId)) {
    throw new ApiError("הרשימה אינה משויכת אליך", 403, "forbidden");
  }
}

/** The lead currently locked by this user (at most one). */
export async function currentLockedLead(userId: string) {
  return prisma.listLead.findFirst({
    where: { lockedByUserId: userId, status: { in: ["locked", "in_call"] } },
    include: { contact: true, list: { select: { id: true, name: true, scriptId: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Atomically claim the next eligible lead in a list for this agent.
 * Returns null when the queue is empty. Never hands the same lead to two agents.
 */
export async function claimNextLead(businessId: string, userId: string, listId: string) {
  const settings = await getBusinessSettings(businessId);
  const window = await listDialWindow(businessId, listId);
  if (!isWithinDialWindow(window)) {
    const next = nextDialWindowOpening(window);
    throw new ApiError("מחוץ לחלון החיוג של הרשימה", 409, "outside_dial_window", { nextOpening: next?.toISOString() ?? null, window });
  }
  const existing = await currentLockedLead(userId);
  if (existing) {
    if (existing.listId !== listId) throw new ApiError("יש ליד פתוח ברשימה אחרת – סיים אותו קודם", 409, "lead_already_locked");
    return existing;
  }

  const token = crypto.randomUUID();
  const ttl = settings.lockTtlSeconds;
  const S = dbSchema();
  const T = (t: string) => Prisma.raw(`"${S}"."${t}"`);
  const E = Prisma.raw(`"${S}"."LeadStatus"`);
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    UPDATE ${T("list_leads")} SET
      status = 'locked'::${E},
      locked_by_user_id = ${userId},
      lock_token = ${token},
      lock_expires_at = now() + (${ttl} || ' seconds')::interval,
      updated_at = now()
    WHERE id = (
      SELECT l.id FROM ${T("list_leads")} l
      JOIN ${T("contacts")} c ON c.id = l.contact_id
      WHERE l.list_id = ${listId}
        AND l.business_id = ${businessId}
        AND (
          l.status IN ('pending'::${E}, 'callback'::${E})
          OR (l.status = 'locked'::${E} AND l.lock_expires_at < now())
        )
        AND (l.next_attempt_at IS NULL OR l.next_attempt_at <= now())
        AND (
          l.preferred_user_id IS NULL
          OR l.preferred_user_id = ${userId}
          OR l.next_attempt_at < now() - (${CALLBACK_GRACE_MINUTES} || ' minutes')::interval
        )
        AND NOT EXISTS (
          SELECT 1 FROM ${T("dnc_entries")} d WHERE d.business_id = l.business_id AND d.phone_e164 = c.phone_e164
        )
      ORDER BY
        (l.status = 'callback'::${E}) DESC,
        l.priority DESC,
        l.next_attempt_at ASC NULLS FIRST,
        l.created_at ASC
      LIMIT 1
      FOR UPDATE OF l SKIP LOCKED
    )
    RETURNING id
  `);
  if (rows.length === 0) return null;
  const lead = await prisma.listLead.findUnique({
    where: { id: rows[0].id },
    include: { contact: true, list: { select: { id: true, name: true, scriptId: true } } },
  });
  await audit(businessId, userId, "lead", rows[0].id, "lead.claimed", { listId });
  return lead;
}

/** Extend the lock while the agent is still working the lead. */
export async function renewLock(userId: string, leadId: string, lockToken: string, seconds: number) {
  const r = await prisma.listLead.updateMany({
    where: { id: leadId, lockedByUserId: userId, lockToken, status: { in: ["locked", "in_call"] } },
    data: { lockExpiresAt: new Date(Date.now() + seconds * 1000) },
  });
  return r.count > 0;
}

export async function assertLeadLock(userId: string, leadId: string, lockToken: string | undefined) {
  const lead = await prisma.listLead.findUnique({ where: { id: leadId }, include: { contact: true } });
  if (!lead) throw new ApiError("ליד לא נמצא", 404, "not_found");
  if (lead.lockedByUserId !== userId || (lockToken && lead.lockToken !== lockToken)) {
    throw new ApiError("הליד כבר לא נעול עבורך (פג תוקף או עבר לנציג אחר)", 409, "lock_lost");
  }
  if (lead.lockExpiresAt && lead.lockExpiresAt.getTime() < Date.now() && lead.status !== "in_call") {
    throw new ApiError("נעילת הליד פגה – משוך ליד מחדש", 409, "lock_expired");
  }
  return lead;
}

/** Release a lead back to the queue (e.g. session ended without dialing). */
export async function releaseLead(userId: string, leadId: string, reason: string) {
  const lead = await prisma.listLead.findUnique({ where: { id: leadId } });
  if (!lead || lead.lockedByUserId !== userId) return false;
  if (lead.status === "in_call") return false; // never release while a call may be alive
  const back: "pending" | "callback" = lead.lastOutcome === "callback" && lead.nextAttemptAt ? "callback" : "pending";
  await prisma.listLead.update({
    where: { id: leadId },
    data: { status: back, lockedByUserId: null, lockToken: null, lockExpiresAt: null },
  });
  await audit(lead.businessId, userId, "lead", leadId, "lead.released", { reason });
  return true;
}

/** Preview mode: skip a lead with a reason. It goes back to the queue after the retry interval (attempt not counted). */
export async function skipLead(businessId: string, userId: string, leadId: string, lockToken: string, reason: string) {
  const lead = await assertLeadLock(userId, leadId, lockToken);
  if (lead.status === "in_call") throw new ApiError("לא ניתן לדלג במהלך שיחה", 409, "call_active");
  const settings = await getBusinessSettings(businessId);
  const list = await prisma.dialList.findUnique({ where: { id: lead.listId }, select: { retryIntervalMinutes: true } });
  const minutes = list?.retryIntervalMinutes ?? settings.retryIntervalMinutes;
  await prisma.listLead.update({
    where: { id: leadId },
    data: {
      status: "pending",
      lockedByUserId: null,
      lockToken: null,
      lockExpiresAt: null,
      lastSkipReason: reason,
      nextAttemptAt: new Date(Date.now() + minutes * 60_000),
      preferredUserId: null,
    },
  });
  await audit(businessId, userId, "lead", leadId, "lead.skipped", { reason });
}

/** Apply the agent's business outcome to the lead and release the lock. */
export async function applyOutcomeToLead(opts: {
  businessId: string;
  userId: string;
  leadId: string;
  outcome: OutcomeKey;
  callbackAt?: Date;
  note?: string;
}) {
  const { businessId, userId, leadId, outcome, callbackAt } = opts;
  const def = OUTCOME_BY_KEY[outcome];
  const lead = await prisma.listLead.findUnique({ where: { id: leadId }, include: { contact: true, list: true } });
  if (!lead) throw new ApiError("ליד לא נמצא", 404, "not_found");
  const settings = await getBusinessSettings(businessId);
  const maxAttempts = lead.list.maxAttempts ?? settings.maxAttempts;
  const window = { ...settings.dialWindow, ...((lead.list.dialWindowJson as Partial<DialWindow> | null) ?? {}) };

  const release = { lockedByUserId: null, lockToken: null, lockExpiresAt: null, preferredUserId: null as string | null };
  let data: Prisma.ListLeadUpdateInput = { lastOutcome: outcome, ...release };

  if (def.addsToDnc) {
    data = { ...data, status: "dnc", nextAttemptAt: null };
  } else if (def.requiresCallbackTime) {
    if (!callbackAt) throw new ApiError("יש לבחור מועד לחזרה", 400, "callback_time_required");
    data = { ...data, status: "callback", nextAttemptAt: callbackAt, preferredUserId: userId };
  } else if (def.closesLead) {
    data = { ...data, status: "completed", nextAttemptAt: null };
  } else if (def.retry) {
    if (lead.attempts >= maxAttempts) {
      data = { ...data, status: "exhausted", nextAttemptAt: null };
    } else {
      const minutes = outcome === "busy" ? settings.busyRetryMinutes : (lead.list.retryIntervalMinutes ?? settings.retryIntervalMinutes);
      let next = new Date(Date.now() + minutes * 60_000);
      if (!isWithinDialWindow(window, next)) next = nextDialWindowOpening(window, next) ?? next;
      data = { ...data, status: "pending", nextAttemptAt: next };
    }
  } else {
    data = { ...data, status: "completed" };
  }

  await prisma.listLead.update({ where: { id: leadId }, data });

  if (def.addsToDnc) {
    await addToDnc(businessId, userId, lead.contact.phoneE164, `outcome:${outcome}`);
  }
  await audit(businessId, userId, "lead", leadId, "lead.outcome", { outcome, callbackAt: callbackAt?.toISOString() });
}

/** Block a number for the whole business and pull it out of every list. */
export async function addToDnc(businessId: string, userId: string | null, phoneE164: string, reason?: string) {
  await prisma.dncEntry.upsert({
    where: { businessId_phoneE164: { businessId, phoneE164 } },
    create: { businessId, phoneE164, reason, createdByUserId: userId },
    update: { reason },
  });
  const contacts = await prisma.contact.findMany({ where: { businessId, phoneE164 }, select: { id: true } });
  await prisma.listLead.updateMany({
    where: { businessId, contactId: { in: contacts.map((c) => c.id) }, status: { notIn: ["in_call"] } },
    data: { status: "dnc", lockedByUserId: null, lockToken: null, lockExpiresAt: null, nextAttemptAt: null, preferredUserId: null },
  });
  await prisma.task.updateMany({ where: { businessId, contactId: { in: contacts.map((c) => c.id) }, status: "open" }, data: { status: "cancelled" } });
  await audit(businessId, userId, "dnc", phoneE164, "dnc.added", { reason });
}

export async function removeFromDnc(businessId: string, userId: string, phoneE164: string) {
  await prisma.dncEntry.deleteMany({ where: { businessId, phoneE164 } });
  await audit(businessId, userId, "dnc", phoneE164, "dnc.removed");
}

/** Queue counters for a list (used by the workspace and list pages). */
export async function listQueueStats(listId: string) {
  const grouped = await prisma.listLead.groupBy({ by: ["status"], where: { listId }, _count: { _all: true } });
  const byStatus: Record<string, number> = {};
  for (const g of grouped) byStatus[g.status] = g._count._all;
  const due = await prisma.listLead.count({
    where: { listId, status: { in: ["pending", "callback"] }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
  });
  return { byStatus, dueNow: due, total: Object.values(byStatus).reduce((a, b) => a + b, 0) };
}
