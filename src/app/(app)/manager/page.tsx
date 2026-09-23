"use client";

import { useCallback, useEffect, useState } from "react";
import { api, qs } from "@/lib/client/api";
import { Badge, ErrorState, Input, Phone, Select, Spinner, Stat, cx } from "@/components/ui";
import { CALL_STATUS_LABEL, MODE_LABEL, PRESENCE_LABEL, formatDuration, formatPhone, relativeTime } from "@/lib/client/format";

interface Metrics { dials: number; connected: number; connectRate: number; talkSeconds: number; avgTalkSeconds: number; sales: number; callbacks: number; outcomes: Record<string, number> }
interface Agent { id: string; fullName: string; role: string; presence: string; presenceAt: string; lastSeenAt: string | null; team: { name: string } | null; session: { mode: string; status: string; startedAt: string; dialsCount: number; list: { name: string } | null } | null; liveCall: { id: string; status: string; toE164: string; createdAt: string; answeredAt: string | null; contact: { fullName: string } | null; list: { name: string } | null } | null; metrics: Metrics | null }
interface Dash { now: string; agents: Agent[]; totals: Metrics; lists: Array<{ id: string; name: string }>; telephony: { simulation: boolean }; definitions: Record<string, string> }

const presenceTone: Record<string, "neutral" | "good" | "warn" | "info" | "bad"> = { offline: "neutral", available: "info", in_call: "good", wrap_up: "warn", paused: "warn" };

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function ManagerPage() {
  const [data, setData] = useState<Dash | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState("");
  const [listId, setListId] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const d = await api.get<Dash>(`/api/manager/dashboard${qs({ from: from ? new Date(from + "T00:00:00").toISOString() : "", to: to ? new Date(to + "T23:59:59").toISOString() : "", listId })}`);
      setData(d);
      setErr(null);
    } catch (e) { setErr((e as Error).message); }
  }, [from, to, listId]);

  useEffect(() => {
    load();
    const i = setInterval(load, 4000);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(i); clearInterval(t); };
  }, [load]);

  if (err && !data) return <ErrorState message={err} retry={load} />;
  if (!data) return <div className="flex justify-center p-10"><Spinner /></div>;
  const t = data.totals;

  return (
    <div className="p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">מסך מנהל</h1>
        {data.telephony.simulation && <Badge tone="warn">מצב הדמיה</Badge>}
        <div className="ms-auto flex flex-wrap gap-2 items-end">
          <Input label="מתאריך" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" ltr />
          <Input label="עד תאריך" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" ltr />
          <Select label="רשימה" value={listId} onChange={(e) => setListId(e.target.value)} className="h-9 w-48"><option value="">כל הרשימות</option>{data.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
        <Stat label="ניסיונות חיוג" value={t.dials} sub={data.definitions.dials} />
        <Stat label="נענו" value={t.connected} sub={data.definitions.connected} tone="good" />
        <Stat label="אחוז מענה" value={`${t.connectRate}%`} sub={data.definitions.connectRate} />
        <Stat label="זמן שיחה ממוצע" value={formatDuration(t.avgTalkSeconds)} sub={data.definitions.avgTalkSeconds} />
        <Stat label="סה״כ זמן שיחה" value={formatDuration(t.talkSeconds)} />
        <Stat label="מכירות" value={t.sales} sub={data.definitions.sales} tone="good" />
        <Stat label="חזרות שנקבעו" value={t.callbacks} tone="warn" />
      </div>

      <div className="bg-panel border border-line rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted bg-white/3">
            <tr>
              <th className="text-start px-3 h-9 font-medium">נציג</th><th className="text-start px-3 font-medium">מצב</th><th className="text-start px-3 font-medium">סשן</th><th className="text-start px-3 font-medium">שיחה נוכחית</th>
              <th className="text-start px-3 font-medium">ניסיונות</th><th className="text-start px-3 font-medium">נענו</th><th className="text-start px-3 font-medium">% מענה</th><th className="text-start px-3 font-medium">ממוצע שיחה</th><th className="text-start px-3 font-medium">מכירות</th><th className="text-start px-3 font-medium">חזרות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.agents.map((a) => {
              const m = a.metrics;
              const lc = a.liveCall;
              return (
                <tr key={a.id} className={cx(a.presence === "in_call" && "bg-good/5")}>
                  <td className="px-3 h-11"><p className="font-medium">{a.fullName}</p><p className="text-[11px] text-muted">{a.team?.name ?? (a.role === "manager" ? "מנהל" : "")}</p></td>
                  <td className="px-3"><Badge tone={presenceTone[a.presence]} dot>{PRESENCE_LABEL[a.presence]}</Badge><p className="text-[11px] text-muted mt-0.5">{relativeTime(a.presenceAt, now)}</p></td>
                  <td className="px-3 text-xs">{a.session ? <>{MODE_LABEL[a.session.mode]}{a.session.list ? ` · ${a.session.list.name}` : ""}<p className="text-muted">{a.session.dialsCount} חיוגים · {a.session.status === "paused" ? "מושהה" : "פעיל"}</p></> : <span className="text-muted">—</span>}</td>
                  <td className="px-3 text-xs">{lc ? <><span className={cx(lc.status === "answered" ? "text-good" : "text-warn")}>{CALL_STATUS_LABEL[lc.status]}</span> · {lc.contact?.fullName ?? <Phone value={formatPhone(lc.toE164)} />}<p className="text-muted tabular">{formatDuration(Math.round((now - new Date(lc.answeredAt ?? lc.createdAt).getTime()) / 1000))}</p></> : <span className="text-muted">—</span>}</td>
                  <td className="px-3 tabular">{m?.dials ?? 0}</td>
                  <td className="px-3 tabular">{m?.connected ?? 0}</td>
                  <td className="px-3 tabular">{m ? `${m.connectRate}%` : "0%"}</td>
                  <td className="px-3 tabular">{formatDuration(m?.avgTalkSeconds ?? 0)}</td>
                  <td className="px-3 tabular text-good">{m?.sales ?? 0}</td>
                  <td className="px-3 tabular">{m?.callbacks ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted">המדדים מחושבים על שיחות שנוצרו בטווח התאריכים. &quot;נענו&quot; נקבע לפי אישור ספק הטלפוניה, לא לפי בחירת הנציג.</p>
    </div>
  );
}
