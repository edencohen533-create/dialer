/**
 * Manager metrics. Every metric is defined explicitly:
 *  - dials:          calls created (any status) in range
 *  - connected:      calls where the provider confirmed the lead answered (answeredAt != null)
 *  - connectRate:    connected / dials
 *  - talkSeconds:    sum(talkSeconds) = answeredAt→endedAt per call
 *  - avgTalkSeconds: talkSeconds / connected
 *  - outcomes:       count per business outcome (agent's choice), only calls with a saved outcome
 *  - sales:          outcomes.sale
 *  - callbacks:      outcomes.callback
 */
import { prisma } from "@/lib/db";
import type { OutcomeKey } from "@/generated/prisma/enums";

export interface StatsFilter {
  businessId: string;
  userIds: string[] | null; // null = all
  from?: Date;
  to?: Date;
  listId?: string;
}

export async function agentMetrics(f: StatsFilter) {
  const where = {
    businessId: f.businessId,
    ...(f.userIds ? { userId: { in: f.userIds } } : {}),
    ...(f.listId ? { listId: f.listId } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
  };
  const calls = await prisma.call.findMany({ where, select: { userId: true, answeredAt: true, talkSeconds: true, outcome: true, endedAt: true } });
  const per = new Map<string, { dials: number; connected: number; talkSeconds: number; outcomes: Partial<Record<OutcomeKey, number>> }>();
  const totals = { dials: 0, connected: 0, talkSeconds: 0, outcomes: {} as Partial<Record<OutcomeKey, number>> };
  for (const c of calls) {
    const a = per.get(c.userId) ?? { dials: 0, connected: 0, talkSeconds: 0, outcomes: {} };
    a.dials++;
    totals.dials++;
    if (c.answeredAt) {
      a.connected++;
      totals.connected++;
      a.talkSeconds += c.talkSeconds ?? 0;
      totals.talkSeconds += c.talkSeconds ?? 0;
    }
    if (c.outcome) {
      a.outcomes[c.outcome] = (a.outcomes[c.outcome] ?? 0) + 1;
      totals.outcomes[c.outcome] = (totals.outcomes[c.outcome] ?? 0) + 1;
    }
    per.set(c.userId, a);
  }
  const finish = (x: typeof totals) => ({
    ...x,
    connectRate: x.dials ? Math.round((x.connected / x.dials) * 100) : 0,
    avgTalkSeconds: x.connected ? Math.round(x.talkSeconds / x.connected) : 0,
    sales: x.outcomes.sale ?? 0,
    callbacks: x.outcomes.callback ?? 0,
  });
  return { totals: finish(totals), perUser: Object.fromEntries([...per.entries()].map(([k, v]) => [k, finish(v)])) };
}
