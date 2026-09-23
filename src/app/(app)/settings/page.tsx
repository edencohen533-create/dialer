"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, qs } from "@/lib/client/api";
import { Badge, Button, Input, Modal, Panel, Phone, Select, Spinner, Textarea, cx } from "@/components/ui";
import { formatDateTime, formatPhone } from "@/lib/client/format";

type Tab = "general" | "numbers" | "users" | "scripts" | "dnc" | "telephony";
interface Settings { wrapUpSeconds: number; autoDialCountdownSeconds: number; maxAttempts: number; retryIntervalMinutes: number; busyRetryMinutes: number; lockTtlSeconds: number; ringTimeoutSeconds: number; recordingEnabled: boolean; recordingAnnouncement: string; dialWindow: { start: string; end: string; days: number[] } }
interface Tel { provider: string; simulation: boolean; requested: string; telnyx: { configured: boolean; missing: string[] } }

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("general");
  const [me, setMe] = useState<{ role: string } | null>(null);
  useEffect(() => { api.get<{ user: { role: string } }>("/api/auth/me").then((m) => setMe(m.user)).catch(() => undefined); }, []);
  const isAdmin = me?.role === "admin";
  const tabs: Array<[Tab, string]> = [["general", "חייגן"], ["numbers", "מספרים יוצאים"], ["users", "משתמשים"], ["scripts", "תסריטים"], ["dnc", "לא ליצור קשר"], ["telephony", "טלפוניה"]];
  return (
    <div className="p-5 space-y-4 max-w-5xl">
      <h1 className="text-lg font-semibold">הגדרות</h1>
      <div className="flex gap-1 border-b border-line">
        {tabs.map(([k, v]) => <button key={k} onClick={() => setTab(k)} className={cx("h-10 px-4 text-sm border-b-2 -mb-px", tab === k ? "border-accent text-text" : "border-transparent text-muted hover:text-text")}>{v}</button>)}
      </div>
      {tab === "general" && <GeneralTab isAdmin={isAdmin} />}
      {tab === "numbers" && <NumbersTab isAdmin={isAdmin} />}
      {tab === "users" && <UsersTab isAdmin={isAdmin} />}
      {tab === "scripts" && <ScriptsTab />}
      {tab === "dnc" && <DncTab />}
      {tab === "telephony" && <TelephonyTab />}
    </div>
  );
}

function GeneralTab({ isAdmin }: { isAdmin: boolean }) {
  const [s, setS] = useState<Settings | null>(null);
  const [name, setName] = useState("");
  useEffect(() => { api.get<{ business: { name: string }; settings: Settings }>("/api/settings").then((r) => { setS(r.settings); setName(r.business.name); }).catch((e) => toast.error(e.message)); }, []);
  if (!s) return <Spinner />;
  const num = (k: keyof Settings, label: string, hint?: string) => <Input label={label} hint={hint} type="number" value={String(s[k])} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} disabled={!isAdmin} />;
  const days = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
  async function save() {
    try { await api.patch("/api/settings", { name, settings: s }); toast.success("ההגדרות נשמרו"); } catch (e) { toast.error((e as Error).message); }
  }
  return (
    <Panel title="הגדרות חייגן" actions={isAdmin && <Button size="sm" onClick={save}>שמור</Button>}>
      <div className="grid md:grid-cols-3 gap-3">
        <Input label="שם העסק" value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} className="md:col-span-3" />
        {num("autoDialCountdownSeconds", "ספירה לאחור בין שיחות (שנ׳)", "בתותח שיחות, אחרי שמירת תוצאה")}
        {num("wrapUpSeconds", "זמן תיעוד (שנ׳)", "משפיע על הארכת נעילת הליד אחרי שיחה")}
        {num("maxAttempts", "מקס׳ ניסיונות לליד")}
        {num("retryIntervalMinutes", "מרווח לניסיון חוזר – אין מענה (דק׳)")}
        {num("busyRetryMinutes", "מרווח לניסיון חוזר – תפוס (דק׳)")}
        {num("ringTimeoutSeconds", "זמן צלצול מקסימלי (שנ׳)")}
        {num("lockTtlSeconds", "תוקף נעילת ליד (שנ׳)", "מתחדש אוטומטית כל 15 שנ׳ כל עוד הנציג מחובר")}
        <div className="md:col-span-3">
          <span className="block text-xs text-muted mb-1">חלון חיוג ברירת מחדל</span>
          <div className="flex flex-wrap items-center gap-2">
            <input type="time" value={s.dialWindow.start} disabled={!isAdmin} onChange={(e) => setS({ ...s, dialWindow: { ...s.dialWindow, start: e.target.value } })} className="h-9 px-2 rounded-md bg-bg border border-line ltr" />
            <span className="text-muted">עד</span>
            <input type="time" value={s.dialWindow.end} disabled={!isAdmin} onChange={(e) => setS({ ...s, dialWindow: { ...s.dialWindow, end: e.target.value } })} className="h-9 px-2 rounded-md bg-bg border border-line ltr" />
            <div className="flex gap-1 ms-2">{days.map((d, i) => <button key={i} disabled={!isAdmin} onClick={() => setS({ ...s, dialWindow: { ...s.dialWindow, days: s.dialWindow.days.includes(i) ? s.dialWindow.days.filter((x) => x !== i) : [...s.dialWindow.days, i] } })} className={cx("w-8 h-8 rounded-md text-xs", s.dialWindow.days.includes(i) ? "bg-accent text-white" : "bg-white/6 text-muted")}>{d}</button>)}</div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm md:col-span-3"><input type="checkbox" checked={s.recordingEnabled} disabled={!isAdmin} onChange={(e) => setS({ ...s, recordingEnabled: e.target.checked })} /> הקלטת שיחות (מרגע המענה, דו-ערוצי)</label>
        <Textarea label="מדיניות הודעה למתקשר על הקלטה" rows={2} value={s.recordingAnnouncement} disabled={!isAdmin} onChange={(e) => setS({ ...s, recordingAnnouncement: e.target.value })} className="md:col-span-3" />
      </div>
    </Panel>
  );
}

function NumbersTab({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Array<{ id: string; e164: string; label: string | null; isDefault: boolean; isActive: boolean }>>([]);
  const [phone, setPhone] = useState(""); const [label, setLabel] = useState("");
  const load = useCallback(() => api.get<typeof items>("/api/phone-numbers").then(setItems).catch((e) => toast.error(e.message)), []);
  useEffect(() => { load(); }, [load]);
  async function add() { try { await api.post("/api/phone-numbers", { phone, label }); setPhone(""); setLabel(""); load(); } catch (e) { toast.error((e as Error).message); } }
  async function patch(id: string, body: object) { try { await api.patch(`/api/phone-numbers/${id}`, body); load(); } catch (e) { toast.error((e as Error).message); } }
  return (
    <Panel title="מספרים מורשים לחיוג יוצא">
      <p className="text-xs text-muted mb-3">רק מספרים ברשימה זו יוצגו ללקוח כמזהה מתקשר. ב-Telnyx המספר חייב להיות משויך לחשבון ול-Call Control App.</p>
      {isAdmin && <div className="flex gap-2 mb-4"><Input placeholder="+972…" value={phone} onChange={(e) => setPhone(e.target.value)} ltr /><Input placeholder="תווית" value={label} onChange={(e) => setLabel(e.target.value)} /><Button onClick={add} disabled={!phone}>הוסף</Button></div>}
      <ul className="divide-y divide-line">
        {items.map((n) => (
          <li key={n.id} className="flex items-center gap-3 py-2 text-sm">
            <Phone value={formatPhone(n.e164)} className="font-medium" /><span className="text-muted">{n.label}</span>
            {n.isDefault && <Badge tone="accent">ברירת מחדל</Badge>}{!n.isActive && <Badge tone="bad">לא פעיל</Badge>}
            {isAdmin && <div className="ms-auto flex gap-2">{!n.isDefault && n.isActive && <Button size="sm" variant="ghost" onClick={() => patch(n.id, { isDefault: true })}>קבע כברירת מחדל</Button>}<Button size="sm" variant="ghost" onClick={() => patch(n.id, { isActive: !n.isActive })}>{n.isActive ? "השבת" : "הפעל"}</Button></div>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function UsersTab({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Array<{ id: string; fullName: string; email: string; role: string; isActive: boolean; team: { name: string } | null }>>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", role: "agent", teamId: "" });
  const load = useCallback(() => api.get<{ items: typeof items; teams: typeof teams }>("/api/users").then((r) => { setItems(r.items); setTeams(r.teams); }).catch((e) => toast.error(e.message)), []);
  useEffect(() => { load(); }, [load]);
  async function create() { try { await api.post("/api/users", { ...form, teamId: form.teamId || null }); setOpen(false); setForm({ fullName: "", email: "", password: "", role: "agent", teamId: "" }); load(); } catch (e) { toast.error((e as Error).message); } }
  async function patch(id: string, body: object) { try { await api.patch(`/api/users/${id}`, body); load(); } catch (e) { toast.error((e as Error).message); } }
  const roleLabel: Record<string, string> = { admin: "מנהל מערכת", manager: "מנהל מוקד", agent: "נציג" };
  return (
    <Panel title="משתמשים" actions={isAdmin && <Button size="sm" onClick={() => setOpen(true)}>+ משתמש</Button>}>
      <table className="w-full text-sm"><thead className="text-xs text-muted"><tr><th className="text-start h-8 font-medium">שם</th><th className="text-start font-medium">אימייל</th><th className="text-start font-medium">תפקיד</th><th className="text-start font-medium">צוות</th><th></th></tr></thead>
        <tbody className="divide-y divide-line">{items.map((u) => <tr key={u.id}><td className="h-10">{u.fullName}{!u.isActive && <Badge tone="bad" className="ms-2">מושבת</Badge>}</td><td className="ltr text-start text-muted">{u.email}</td><td>{roleLabel[u.role]}</td><td className="text-muted">{u.team?.name ?? "—"}</td><td className="text-end">{isAdmin && <Button size="sm" variant="ghost" onClick={() => patch(u.id, { isActive: !u.isActive })}>{u.isActive ? "השבת" : "הפעל"}</Button>}</td></tr>)}</tbody></table>
      <Modal open={open} onClose={() => setOpen(false)} title="משתמש חדש" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button><Button onClick={create} disabled={!form.fullName || !form.email || form.password.length < 6}>צור</Button></>}>
        <div className="space-y-2">
          <Input label="שם מלא" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <Input label="אימייל" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} ltr />
          <Input label="סיסמה (6+ תווים)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} ltr />
          <Select label="תפקיד" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="agent">נציג</option><option value="manager">מנהל מוקד</option><option value="admin">מנהל מערכת</option></Select>
          <Select label="צוות" value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}><option value="">ללא</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
        </div>
      </Modal>
    </Panel>
  );
}

function ScriptsTab() {
  const [items, setItems] = useState<Array<{ id: string; title: string; body: string; isDefault: boolean }>>([]);
  const [edit, setEdit] = useState<{ id?: string; title: string; body: string; isDefault: boolean } | null>(null);
  const load = useCallback(() => api.get<typeof items>("/api/scripts").then(setItems).catch((e) => toast.error(e.message)), []);
  useEffect(() => { load(); }, [load]);
  async function save() {
    if (!edit) return;
    try { if (edit.id) await api.patch(`/api/scripts/${edit.id}`, edit); else await api.post("/api/scripts", edit); setEdit(null); load(); } catch (e) { toast.error((e as Error).message); }
  }
  return (
    <Panel title="תסריטי שיחה" actions={<Button size="sm" onClick={() => setEdit({ title: "", body: "", isDefault: items.length === 0 })}>+ תסריט</Button>}>
      <ul className="divide-y divide-line">{items.map((s) => <li key={s.id} className="flex items-center gap-3 py-2"><span className="font-medium">{s.title}</span>{s.isDefault && <Badge tone="accent">ברירת מחדל</Badge>}<Button size="sm" variant="ghost" className="ms-auto" onClick={() => setEdit(s)}>עריכה</Button></li>)}</ul>
      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? "עריכת תסריט" : "תסריט חדש"} width="max-w-2xl" footer={<><Button variant="ghost" onClick={() => setEdit(null)}>ביטול</Button><Button onClick={save} disabled={!edit?.title}>שמור</Button></>}>
        {edit && <div className="space-y-2"><Input label="כותרת" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /><Textarea label="תוכן" rows={12} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.isDefault} onChange={(e) => setEdit({ ...edit, isDefault: e.target.checked })} /> ברירת מחדל לעסק</label></div>}
      </Modal>
    </Panel>
  );
}

function DncTab() {
  const [items, setItems] = useState<Array<{ id: string; phoneE164: string; reason: string | null; createdAt: string; createdBy: { fullName: string } | null }>>([]);
  const [q, setQ] = useState(""); const [phone, setPhone] = useState(""); const [reason, setReason] = useState("");
  const load = useCallback(() => api.get<{ items: typeof items }>(`/api/dnc${qs({ q })}`).then((r) => setItems(r.items)).catch((e) => toast.error(e.message)), [q]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  async function add() { try { await api.post("/api/dnc", { phone, reason }); setPhone(""); setReason(""); load(); } catch (e) { toast.error((e as Error).message); } }
  async function remove(p: string) { try { await api.delete("/api/dnc", { phone: p }); load(); } catch (e) { toast.error((e as Error).message); } }
  return (
    <Panel title="רשימת לא ליצור קשר (DNC)">
      <p className="text-xs text-muted mb-3">מספרים ברשימה זו נחסמים בכל רשימות החיוג של העסק, והחסימה נבדקת שוב ברגע החיוג.</p>
      <div className="flex gap-2 mb-3"><Input placeholder="מספר" value={phone} onChange={(e) => setPhone(e.target.value)} ltr /><Input placeholder="סיבה" value={reason} onChange={(e) => setReason(e.target.value)} /><Button onClick={add} disabled={!phone}>חסום</Button></div>
      <Input placeholder="חיפוש" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
      <ul className="divide-y divide-line">{items.map((d) => <li key={d.id} className="flex items-center gap-3 py-2 text-sm"><Phone value={formatPhone(d.phoneE164)} className="font-medium" /><span className="text-muted">{d.reason}</span><span className="text-muted text-xs ms-auto">{formatDateTime(d.createdAt)} · {d.createdBy?.fullName ?? "מערכת"}</span><Button size="sm" variant="ghost" onClick={() => remove(d.phoneE164)}>הסר</Button></li>)}</ul>
    </Panel>
  );
}

function TelephonyTab() {
  const [t, setT] = useState<Tel | null>(null);
  useEffect(() => { api.get<Tel>("/api/telephony/status").then(setT).catch((e) => toast.error(e.message)); }, []);
  if (!t) return <Spinner />;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <Panel title="חיבור טלפוניה (Telnyx)">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm">מצב נוכחי:</span>
        {t.simulation ? <Badge tone="warn">מצב הדמיה – אין שיחות אמיתיות</Badge> : <Badge tone="good">Telnyx פעיל</Badge>}
        {t.requested === "telnyx" && !t.telnyx.configured && <Badge tone="bad">חסרים: {t.telnyx.missing.join(", ")}</Badge>}
      </div>
      <ol className="text-sm space-y-2 list-decimal ps-5 text-text/90">
        <li>ב-Mission Control צור <b>Call Control Application</b> (Voice API) והגדר Webhook URL: <code className="ltr bg-black/40 px-1 rounded text-xs">{origin}/api/webhooks/telnyx</code> (POST). העתק את ה-ID ל-<code className="ltr text-xs">TELNYX_CALL_CONTROL_APP_ID</code>.</li>
        <li>צור <b>SIP Credential Connection</b> (לרישום הדפדפנים ב-WebRTC). העתק את ה-ID ל-<code className="ltr text-xs">TELNYX_CREDENTIAL_CONNECTION_ID</code>. המערכת יוצרת credential לכל נציג אוטומטית.</li>
        <li>שייך <b>Outbound Voice Profile</b> לשני החיבורים, ושייך את מספרי הטלפון של העסק ל-Call Control App.</li>
        <li>העתק את <b>API Key</b> ל-<code className="ltr text-xs">TELNYX_API_KEY</code> ואת <b>Public Key</b> (Keys &amp; Credentials) ל-<code className="ltr text-xs">TELNYX_PUBLIC_KEY</code> לאימות חתימות Webhook.</li>
        <li>הגדר <code className="ltr text-xs">TELEPHONY_PROVIDER=telnyx</code> ופרוס מחדש. הוסף את המספרים היוצאים בלשונית &quot;מספרים יוצאים&quot; בפורמט E.164.</li>
      </ol>
      <p className="text-xs text-muted mt-4">זרימת שיחה: השרת מחייג קודם לדפדפן הנציג (SIP leg), ורק אחרי שהדפדפן עונה מחייג ללקוח ומגשר בין השניים כשהלקוח עונה. מצב &quot;נענה&quot; מגיע אך ורק מאירועי Telnyx החתומים.</p>
    </Panel>
  );
}
