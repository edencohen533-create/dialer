import { z } from "zod";
import { withAuth, parseQuery } from "@/lib/api";
import { ok } from "@/lib/response";
import { prisma } from "@/lib/db";
import { visibleUserIds } from "@/lib/auth";
import { agentMetrics } from "@/lib/stats";
import { reapStaleSessions } from "@/lib/dialer/session";
import { telephonyStatus } from "@/lib/telephony";

export const dynamic = "force-dynamic";

const q = z.object({ from: z.string().optional(), to: z.string().optional(), listId: z.string().optional(), userId: z.string().optional() });

export const GET = withAuth(async ({ req, user }) => {
  const f = parseQuery(req, q);
  await reapStaleSessions(user.businessId).catch(() => 0);
  const visible = await visibleUserIds(user);
  let userIds = visible;
  if (f.userId) userIds = visible && !visible.includes(f.userId) ? ["__none__"] : [f.userId];

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const from = f.from ? new Date(f.from) : startOfToday;
  const to = f.to ? new Date(f.to) : undefined;

  const [agents, metrics, liveCalls, lists] = await Promise.all([
    prisma.user.findMany({
      where: { businessId: user.businessId, isActive: true, ...(visible ? { id: { in: visible } } : {}) },
      select: { id: true, fullName: true, role: true, presence: true, presenceAt: true, lastSeenAt: true, team: { select: { id: true, name: true } } },
      orderBy: { fullName: "asc" },
    }),
    agentMetrics({ businessId: user.businessId, userIds, from, to, listId: f.listId }),
    prisma.call.findMany({
      where: { businessId: user.businessId, endedAt: null, ...(visible ? { userId: { in: visible } } : {}) },
      select: { id: true, userId: true, status: true, toE164: true, createdAt: true, answeredAt: true, contact: { select: { fullName: true } }, list: { select: { name: true } } },
    }),
    prisma.dialList.findMany({ where: { businessId: user.businessId }, select: { id: true, name: true, isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const sessions = await prisma.dialerSession.findMany({
    where: { businessId: user.businessId, status: { in: ["active", "paused"] }, userId: { in: agents.map((a) => a.id) } },
    select: { userId: true, mode: true, status: true, startedAt: true, dialsCount: true, list: { select: { id: true, name: true } } },
  });
  const sessionByUser = Object.fromEntries(sessions.map((s) => [s.userId, s]));
  const liveByUser = Object.fromEntries(liveCalls.map((c) => [c.userId, c]));
  return ok({
    now: new Date().toISOString(),
    range: { from: from.toISOString(), to: to?.toISOString() ?? null },
    agents: agents.map((a) => ({ ...a, session: sessionByUser[a.id] ?? null, liveCall: liveByUser[a.id] ?? null, metrics: metrics.perUser[a.id] ?? null })),
    totals: metrics.totals,
    lists,
    telephony: telephonyStatus(),
    definitions: {
      dials: "שיחות שנוצרו בטווח (כולל כשלונות)",
      connected: "שיחות שבהן הספק אישר שהלקוח ענה",
      connectRate: "נענו ÷ ניסיונות",
      avgTalkSeconds: "סך זמן שיחה (ממענה עד ניתוק) ÷ שיחות שנענו",
      sales: "תוצאות 'בוצעה מכירה' שנשמרו על ידי הנציג",
    },
  });
}, { minRole: "manager" });
