# QA לחייגן ולתותח השיחות — 24.09.2026

**המערכת עדיין אינה מאומתת לשימוש במוקד אמיתי.** בוצעו בדיקות API ודפדפן בפועל, מסד PostgreSQL מקומי, בדיקות תחרות ועומס והזרקת כשלים; תוקנו תקלות אבטחה, כפילויות, תור, שמירה וסנכרון. לא בוצעה שיחה חיצונית ולא נבדק שמע אמיתי. לא בוצעו מיזוג, פריסה או שינוי נתוני ייצור.

## סביבה וגבולות הראיות

- ענף `qa/comprehensive-dialer-20260924`, בסיס `3780347`; Next.js 16.3.6, React 19, Prisma 7, Node 20.20.1.
- PostgreSQL 18.4 מבודד ב־127.0.0.1:55439, מסד `dialer_qa`, סכמה `dialer`, timezone Asia/Jerusalem. הוחלו חמש המיגרציות הקיימות, ללא שינוי סכמת המוצר.
- שרת פיתוח ב־3107; בדיקת restart על build ייצור מקומי ב־3117. שרת הפיתוח הקיים ב־3000 לא שונה.
- חשבונות ולידים מלאכותיים בלבד. מעטפת `qa-local.cjs` דורסת כתובות מסד ומשביתה מפתחות חיוג חיצוני. לא נעשה שימוש ב־Neon של הפרויקט בבדיקה זו.
- Chromium אמיתי: מסכי נציג ומנהל, RTL, תקלות רשת מבוקרות; התקן מיקרופון מדומה. טלפוניה: mock ו־webhooks חתומים במפתח Ed25519 מקומי. בדיקת transport מחליפה את הספק בקוד ואינה פונה לרשת.
- קובצי JSON ולוגים: [evidence](docs/qa-20260924/evidence/). צילומי מסך מכילים נתוני בדיקה בלבד: [shots](docs/qa-20260924/shots/).

## מיפוי המערכת

| רכיב | מימוש ומצב |
|---|---|
| מסכים | כניסה, חייגן ידני/Preview/Power, רשימות ולידים, אנשי קשר וכרטיס ליד, משימות, הגדרות, מנהל חי ודוחות/היסטוריית שיחות |
| שרת | Next Route Handlers; JWT session; תפקידים ותחומי צוות; Prisma/PostgreSQL |
| טלפוניה | Telnyx Call Control + WebRTC; שתי רגלי שיחה ו־conference; מתאם mock נפרד. בתצורה שנבדקה כל שיחה מדומה |
| תור | claim עם נעילות DB, נציג אחד/שיחה אחת, נעילת ליד, TTL, תעדוף, חלונות חיוג, retries ותוצאות; Preview ו־Power בלבד |
| זמן אמת | polling HTTP, מנהל כל 1.5 שניות; heartbeat נציג; BroadcastChannel בין לשוניות. אין הוכחת push רציף או SLA |
| Webhooks | `/api/webhooks/telnyx`, אימות חתימה/זמן, מפתח אירוע ייחודי, נעילת עיבוד ומכונת מצבים |
| CRM | הערות ותוצאה, משימות callback, טיוטה מקומית ובשרת, היסטוריה; הקלטות דרך endpoint מורשה |
| האזנה/לחישה | מימוש שרת + Telnyx supervisor roles, הרשאות ואודיט; נבדקו תהליך ומצבים בסימולציה. בידוד אודיו חסום |
| חסר | Parallel/Predictive, hold, העברת שיחה חיה, barge-in, WhatsApp מחובר, AI/תמלול; העברת בעלות ליד אינה העברת שיחה |
| עבודת רקע | תור מונע בקשות/heartbeat/reconciliation; אין worker עמיד נפרד שנבדק. restart נבדק על תהליך האפליקציה, לא על worker שאינו קיים |

תוכנית הבדיקה נתנה קדימות להפרדת ארגונים, חיוגים כפולים ומצבים שאינם משקפים ספק; אחריהם תור ותוצאות, התאוששות, דפדפן ועומס.

## תוצאות ותיקונים

100/107 בדיקות API עברו; שבע השורות הנותרות מסווגות להלן לחסימות טלפוניה או יכולות חסרות. 20/20 בדיקות UI קיימות, 6/6 בדיקות עמידות דפדפן, 22/22 רגרסיות, 6/6 הזרקות כשל/זמן, בדיקת restart וארבע מדרגות עומס עברו. בדיקת U20 הורצה שוב עם כשל ניתוק האזנה והצליחה גם בהצגת שגיאה וניסיון חוזר. build עם Webpack ו־typecheck עברו; lint ללא שגיאות עם 14 אזהרות קיימות. אין להסיק מכך ששיחות אמיתיות או קיבולת מוקד אושרו.

ה־API הראשוני: 84 עברו, 16 נכשלו, 7 חסומים. חלק מהכישלונות היו זיהום fixtures (DNC/מגבלת קצב) ותוקנו במבחן, ולא נספרו כתקלות מוצר. 15 הרגרסיות הראשונות נכשלו לפני התיקון; נוספו בדיקות ככל שנמצאו סיכונים נוספים. מזהי REG נפרדים ממזהי API הישנים.

| חומרה | שחזור / סיבה | תיקון ואימות |
|---|---|---|
| גבוהה — פרטיות | שליחת owner/team/script/phone של ארגון אחר ב־POST/PATCH/import; PATCH רשימה שינה DB לפני החזרת 400 | ולידציית קשרים לפני כתיבה; REG-R9–R13,R19 |
| גבוהה — פרטיות | נציג פותח איש קשר משותף ונחשף למשימה פרטית של נציג אחר | סינון משימות לפי תחום המשתמש; REG-R22 נכשל ואז עבר |
| גבוהה — ניתוב | אותו מספר נכנס נרשם לשני ארגונים; lookup בחר הראשון | נעילה ובדיקת ייחוד בין ארגונים; מספר legacy עמום נדחה; REG-R18 |
| קריטית — חיוג בלתי מבוקר | שני נציגים מחייגים במקביל לאותו מספר; כמה claims/session starts לאותו נציג | נעילות נציג/מספר, יצירה אטומית ובעלים; REG-R6,R7,R15 ועומס |
| גבוהה — עקיפת עצירה | ליד מוחזק חויג אחרי pause; Power ללא session או browser ownership; חיוג חדש בזמן wrap-up | בדיקות תנאים בתוך transaction, pause/resume/end תחת אותה נעילה; REG-R1–R5 |
| גבוהה — כפילות פולואפ | חמש בקשות outcome מקבילות יצרו חמש משימות; כשל DB השאיר סיכום חלקי | outcome/משימה/ליד/נוכחות/אודיט באותה transaction; REG-R8,R17 |
| גבוהה — retries | timeout לא מוכרע אפשר retry מאוחר מעבר לחלון מניעת כפילות ספק | retry מוגבל בזמן ובכמות; השארת השיחה שמורה כשנדרש אישור ספק; FAULT-F4, אין הוכחת Telnyx חי |
| גבוהה — Webhooks | אירוע סומן מעובד לפני side effects; תשובת dial מאוחרת דרסה answered מוקדם | processedAt רק בסוף, replay משלים finalization, עדכון סטטוס מותנה; FAULT-F2,F3 |
| גבוהה — ניתוק האזנה | ספק מחזיר שגיאה לניתוק leg מנהל והשרת בכל זאת מסמן ended | החזרת 502 ושמירת ההאזנה הפעילה לניסיון נוסף; FAULT-F6 נכשל לפני תיקון ועבר אחריו |
| גבוהה — תור | מסד TZ ירושלים השווה timestamp UTC ל־now מקומי והקדים retry/owner grace; cap ניסיונות לא נאכף על pending | SQL UTC מפורש ואכיפת attempt cap; REG-R16,R20 ו־API-W/N |
| בינונית — סטטוס | ניתוק mock לפני מענה הנציג השאיר שיחה פעילה | אירוע hangup לרגל הנציג; FAULT-F1 |
| בינונית — דוחות | חצות לפי אזור השרת/מטמון גלש ליום הבא | business timezone כולל DST ומפתח מטמון יומי; FAULT-F5 |
| בינונית — הקלטות | recording.saved לא שמר מזהה הקלטה | פענוח ושמירת recordingId; REG-R14. הורדה אמיתית חסומה |
| בינונית — build | Webpack זיהה context אופציונלי שאינו תואם לטיפוסי Route Handler | חתימת withAuth דורשת params מסוג Promise; build ורגרסיית API עברו |
| בינונית — UI | כשל שמירת טיוטה נבלע; DTMF נשלח בשני מסלולים; timers/listeners לא נוקו בחלק מהיציאות | הודעת שגיאה ושמירה מקומית; DTMF שרת בלבד; ניקוי lifecycle; BROWSER-B6,B4 ובדיקת קוד |
| בינונית — נכנסות | נוכחות/heartbeat ישנים וסיכום שיחה יכלו להיחשב זמינות | הוצאת נציגים מיושנים או עם סיכום פתוח מבחירת נציג; API inbound + סקירת קוד |

ה־build הסופי הופעל ב־`npm run build -- --webpack`: Turbopack נכשל בהרצת תהליך עזר עם EPERM בסביבה המקומית גם לאחר בקשת הרשאה. זו מגבלת סביבת ההרצה; תוצאת Webpack נשמרה בלוג.

## טבלת תרחישי API

`mock` = API אמיתי ומסד מקומי, ללא אודיו. `n/a` אינו מציין שבוצעה טלפוניה אמיתית. בשורת N20 תוקנה בדוח הגדרה מיושנת בסקריפט: האזנה/לחישה קיימות ונבדקות בנפרד ב־R/U20; hold/transfer/barge-in חסרים.

| מזהה | תרחיש | סטטוס | ראיה/תוצאה | אופן |
|---|---|---|---|---|
| API-M1 | הקלדה בפורמט מקומי עם רווח ומקף | עבר | status 200, toE164=+972501234567, phoneRaw=050-123 4567 | mock |
| API-M2 | פורמט בינלאומי של מספר קיים | עבר | contacts before=1 after=1, name=לקוח ב׳ 1 | mock |
| API-M3 | מספר עם סוגריים | עבר | 200 +972521000004 | mock |
| API-M4 | מספר ריק / קצר / לא תקין | עבר | 400:missing_destination 400:invalid_phone 400:invalid_phone 400:invalid_phone | mock |
| API-M5 | מספר בינלאומי (ארה״ב) עם מדיניות ברירת מחדל IL בלבד | עבר | 403 country_not_allowed (US) | mock |
| API-M6 | לחיצה כפולה מהירה (שתי בקשות במקביל, מפתחות שונים) | עבר | הצלחות=1 (409/200), שיחות חדשות=1 | mock |
| API-M7 | אותו מפתח idempotency פעמיים | עבר | cmueuvtle02lclrejxe03fivs / cmueuvtle02lclrejxe03fivs | mock |
| API-M8 | חיוג בזמן שיחה פעילה | עבר | 409 call_active | mock |
| API-M9 | חיוג מכרטיס לקוח (contactId) | עבר | contact ok=true, from=+97239876543 | mock |
| API-M10 | מספר יוצא של עסק אחר | עבר | 400 invalid_from_number | mock |
| API-M11 | שיחות אחרונות / חיוג חוזר | עבר | 7 רשומות, כולל 0521000005=true | mock |
| API-M12 | מספר חסום (DNC) – ידני, מכרטיס ומליד | עבר | 403/dnc_blocked, 403/dnc_blocked | mock |
| API-M13 | כפילות מספר בין כרטיסים | עבר | 409 duplicate_phone | mock |
| API-M14 | עסק ללא מספר יוצא | עבר | 400 no_from_number | mock |
| API-M15 | חיוג כשהספק מנותק / מיקרופון חסום | חסום | נבדק ב-UI (ראה U-סדרה); ניתוק ספק אמיתי דורש חשבון Telnyx | n/a |
| API-P1 | התחלת סשן Preview ומשיכת ליד | עבר | lead=לקוח ב׳ 1, status=locked, calls=0 (אין חיוג אוטומטי) | mock |
| API-P2 | דילוג עם סיבה | עבר | reason=לא זמן מתאים, status=pending, attempts=0, next=2026-09-24T02:01:38.615Z | mock |
| API-P3 | עדכון פרטי ליד לפני חיוג | עבר | 200 company=חברת QA | mock |
| API-P4 | ליד נחסם (DNC) בזמן ההמתנה | עבר | 403 dnc_blocked, lead.status=dnc | mock |
| API-P5 | ליד הוסר ע״י מנהל בזמן ההמתנה | עבר | 409 lock_lost | mock |
| API-P6 | נעילה פגה וליד נלקח ע״י נציג אחר | עבר | agent4 got lead=true, agent3 dial → 409 lock_lost | mock |
| API-P7 | רשימה ריקה | עבר | 200 data=null | mock |
| API-W1 | התחלת סשן, משיכה וחיוג – רק שיחה אחת לנציג | עבר | הצלחות=1, שיחות חיות=1, סיום=answered | mock |
| API-W2 | מעבר לליד הבא לפני תיעוד | עבר | 409 outcome_required | mock |
| API-W3 | שמירת תוצאה בזמן שיחה פעילה | עבר | בזמן שיחה: 409 call_still_active; אחרי ניתוק: 200 | mock |
| API-W4 | תוצאות ספק: נענה / אין מענה / תפוס / נדחה | עבר | 0521000010→no_answer talk=0s / 0521000011→busy talk=0s / 0521000012→rejected talk=0s / 0521000005→answered talk=3s ring→answer 3s | mock |
| API-W5 | השהיה – משיכת ליד בסשן מושהה | עבר | 409 session_paused, presence=paused | mock |
| API-W6 | סיום סשן בזמן שיחה | עבר | בזמן שיחה 409/call_active; אחרי: 200, lead.locked=false, presence=offline | mock |
| API-W7 | החלפת רשימה בזמן סשן | עבר | old.status=ended, lead.status=pending, locked=false | mock |
| API-W8 | מדיניות ניסיונות: אין מענה → ניסיון חוזר; מקסימום → מוצה | עבר | #1: attempts=1 status=pending next=+30m / #2: attempts=2 status=exhausted next=+nullm | mock |
| API-W9 | תפוס → ניסיון חוזר לפי busyRetryMinutes (5) | עבר | provider=busy, next=+5m | mock |
| API-W10 | callback מנותב לנציג שקבע אותו | עבר | agent4 got=null, owner got=true | mock |
| API-O1 | תוצאה "answered_interested" משיחה על ליד | עבר | 200; provider=answered, outcome=answered_interested, note ok=true (1596 תווים), lead.status=completed, בהיסטוריה=true | mock |
| API-O2 | תוצאה "answered_not_interested" משיחה על ליד | עבר | 200; provider=busy, outcome=answered_not_interested, note ok=true (1596 תווים), lead.status=completed, בהיסטוריה=true | mock |
| API-O3 | תוצאה "callback" משיחה על ליד | עבר | 200; provider=rejected, outcome=callback, note ok=true (1596 תווים), lead.status=callback, tasks=1, בהיסטוריה=true | mock |
| API-O4 | תוצאה "no_answer" משיחה על ליד | עבר | 200; provider=answered, outcome=no_answer, note ok=true (1596 תווים), lead.status=pending, בהיסטוריה=true | mock |
| API-O5 | תוצאה "busy" משיחה על ליד | עבר | 200; provider=answered, outcome=busy, note ok=true (1596 תווים), lead.status=pending, בהיסטוריה=true | mock |
| API-O6 | תוצאה "wrong_number" משיחה על ליד | עבר | 200; provider=answered, outcome=wrong_number, note ok=true (1596 תווים), lead.status=completed, בהיסטוריה=true | mock |
| API-O7 | תוצאה "sale" משיחה על ליד | עבר | 200; provider=no_answer, outcome=sale, note ok=true (1596 תווים), lead.status=completed, בהיסטוריה=true | mock |
| API-O8 | תוצאה "dnc" משיחה על ליד | עבר | 200; provider=answered, outcome=dnc, note ok=true (1596 תווים), lead.status=dnc, dnc=1, בהיסטוריה=true | mock |
| API-O9 | שמירה כפולה של תוצאה | עבר | outcome=callback, tasks=1 | mock |
| API-O10 | טיוטת הערה נשמרת בשרת ונמחקת אחרי תיעוד | עבר | draft=טיוטה 123 → after outcome="" | mock |
| API-O11 | מכירה אינה יוצרת הזמנה/הכנסה | עבר | טבלאות: _prisma_migrations, users, dnc_entries, list_leads, dial_list_agents, contacts, dialer_sessions, businesses, tasks, telephony_events, phone_numbers, scripts, note_drafts, teams, audit_logs, dial_lists, calls, call_monitors | n/a |
| API-T1 | מועד חזרה בעבר | עבר | עבר: 400/callback_in_past; בלי מועד: 400/callback_time_required | mock |
| API-T2 | אזור זמן: מועד עם offset של ישראל נשמר כרגע UTC נכון | עבר | sent=2026-09-25T06:34:00.000+03:00 stored=2026-09-25T03:34:00.000Z | mock |
| API-T3 | שינוי מועד ומשימה מסומנת כבוצעה | עבר | next=2026-09-26T01:34:15.801Z, task=done, lead=completed | mock |
| API-T4 | נציג רואה רק את המשימות שלו; מנהל רואה את הצוות | עבר | agent4=0 (כולן שלו), manager=1, agent4 מבקש של agent3=0 | mock |
| API-D1 | חסימה חלה על כל הרשימות של העסק ולא על עסק אחר עם אותו מספר | עבר | B leads=dnc,dnc; A leads=pending; dnc in A=0; audit=1 | mock |
| API-D2 | הרשאות: נציג לא מסיר חסימה, מנהל כן; שינוי מתועד | עבר | agent 403, manager 200, audit=1 | mock |
| API-D3 | רשימת DNC למנהל בלבד | עבר | 403 | mock |
| API-L1 | יצירת רשימה מסינון CRM + מניעת כפילויות + סינון DNC | עבר | added=6 (צפוי 6), שוב=0 | mock |
| API-L2 | רשימה משויכת לנציג אחר | עבר | agent3 403, agent4 200 | mock |
| API-L3 | חלון חיוג סגור (רשימת לילה) | עבר | 409 outside_dial_window next=2026-09-25T00:00:00.000Z | mock |
| API-L4 | נציג רואה רק רשימות משויכות אליו או פתוחות | עבר | QA-B רשימה, QA-L1, QA-B לילה בלבד, QA-B ריקה | mock |
| API-L5 | מחיקת רשימה עם שיחה פעילה | עבר | busy: 409/list_busy; idle: 200, exists=true active=false | mock |
| API-X1 | נציג בעסק ב׳ ניגש לאיש קשר / שיחה / הקלטה של עסק א׳ | עבר | 404 404 404 404 | mock |
| API-X2 | רשימות/חיפוש אנשי קשר לא דולפים בין עסקים | עבר | contacts all B=true; dial lead of A → 409 lock_lost | mock |
| API-X3 | דשבורד מנהל: מנהל ב׳ רואה רק את עסק ב׳; מנהל בלי צוות רואה את עצמו בלבד; נציג 403 | עבר | managerB agents=3 (רק ב׳=true), lonely=1, agent=403 | mock |
| API-X4 | היסטוריית שיחות לפי נראות | עבר | agent3=29, manager=29, lonely=0, agent3→agent4=0 | mock |
| API-X5 | פעולות ניהול | עבר | agent=403/403/403/403, manager=403/403/403, admin=200 | mock |
| API-X6 | נציג עורך איש קשר שאינו שלו ולא טיפל בו | עבר | 403 forbidden | mock |
| API-X7 | ללא cookie / cookie מזויף | עבר | 401 401 | mock |
| API-X8 | משתמש מושבת מאבד גישה מיד | עבר | לפני 200, אחרי 401 | mock |
| API-S1 | heartbeat מלשונית זרה | עבר | {"sessionOk":false,"reason":"session_taken"} | mock |
| API-S2 | לשונית שנייה מתחילה סשן | עבר | old tab next-lead → session_ended; state.ownedByThisTab=false | mock |
| API-S3 | סגירת דפדפן: סשן ללא heartbeat נסגר, נציג offline, ליד משוחרר | עבר | session=ended, presence=offline, lead=pending/locked=false | mock |
| API-S4 | סשן עם שיחה חיה לא נקצר ע״י ה-reaper | עבר | session=active | mock |
| API-G1 | מדדים תואמים ל-DB לפי ההגדרות המוצהרות | עבר | api dials=30/30 connected=16/16 avgTalk=0 sales=1/1 rate=53% | mock |
| API-G2 | מצב נציג בזמן אמת בזמן שיחה | עבר | בשיחה: in_call/answered; אחרי ניתוק: wrap_up; אחרי תיעוד: available | mock |
| API-H1 | חתימה תקינה / גוף שונה / חותמת זמן ישנה | עבר | 200 401 401 | mock |
| API-H2 | אירוע כפול ואירועים בסדר הפוך (hangup לפני answered) | עבר | hangup→ended=true result=busy; duplicate=true; events stored=1; late answered → status=ended, answeredAt=null | mock |
| API-H3 | recording.saved מסמן הקלטה; הורדה דרך proxy מאומת בלבד | עבר | status=saved id=mock-rec-cmueuzy3502w0lrejtup13l1j dur=5000ms; owner=404(recording_unavailable) other-agent=403 manager=404(recording_unavailable) – הורדה אמיתית חסומה ללא Telnyx | mock |
| API-H4 | אירוע ל-leg לא מוכר | עבר | 200 {"ok":true,"duplicate":false,"callId":null} | mock |
| API-H5 | timeout בבקשת חיוג לספק → בדיקה אם נוצרה שיחה לפני ניסיון חוזר | חסום | ספק אמיתי חסום; ענף timeout/retry נבדק בהזרקת כשל נפרדת FAULT-F4 | n/a |
| API-A1 | אודיו דו-כיווני, השתקה בפועל, DTMF ליעד IVR, החלפת אוזניות באמצע שיחה | חסום | אין חשבון Telnyx ומספר בדיקה מאושר | n/a |
| API-N1 | סדר הגשה לפי ציון שקוף + הסבר לנציג | עבר | סדר=callback>owner>plain; הסברים: חזרה שנקבעה להיום · ליד חדש (פחות משעה) / ליד חדש (פחות משעה) · הליד שלך / ליד חדש (פחות משעה) | mock |
| API-N2 | עצירת חיוגים ברמת העסק (kill switch) | עבר | next-lead dialing_paused, dial dialing_paused, dashboard paused=true, after resume 200, audit=1 | mock |
| API-N3 | השהיית רשימה בודדת | עבר | 409 list_paused; queue paused=true dueNow=0 | mock |
| API-N4 | הגבלת מדינות יעד | עבר | IL בלבד: 403/country_not_allowed (US); עם US: 200 | mock |
| API-N5 | הגבלת קצב חיוג לנציג | עבר | 200, 200, 429/rate_limited | mock |
| API-N6 | אותו מספר בשיחה חיה אצל נציג אחר (כרטיסים כפולים) | עבר | 409 number_in_call | mock |
| API-N7 | כשל טכני (leg הנציג נכשל לפני צלצול) | עבר | call=failed autoSaved=true lead=pending attempts=0 next=+10m wrapUpRequired=false audit=1 | mock |
| API-N8 | העברת ליד לנציג אחר ע״י מנהל | עבר | 200; locked=null preferred=true; agent4 got it=true; audit=1 | mock |
| API-N9 | שכפול, ארכוב ורענון רשימה דינמית | עבר | copied=7/7; archived→session list_inactive; dynamic refresh added=1; frozen refresh=400/list_frozen | mock |
| API-N10 | מכירה סוגרת את הליד בכל הרשימות האחרות ומבטלת משימות פתוחות | עבר | other list lead=completed; automation log=true ({"callId":"cmuev10b002yqlrej9n5pqha7","result":"ok","trigger":"outcome:sale","leadsClosed":4}) | mock |
| API-N11 | לקוח מתקשר: זיהוי, ניתוב לבעלים, קבלה, ניתוק, היסטוריה | עבר | routed=routed_to_owner/true; ringing=true; accept 200; answered; ended=answered talk=2s; wrap-up=true; בהיסטוריה=true | mock |
| API-N12 | בעלים עסוק → נציג זמין אחר; אף אחד זמין → לא נענה + משימת חזרה; דחייה ע״י נציג | עבר | busy owner → routed_to_available_agent (agent4=true); reject 200 ended=true note=rejected_by_agent; nobody → no_agent_available/no_answer, task +1, audit=1 | mock |
| API-N13 | סיכום סשן אמיתי | עבר | dials=2 connected=2 outcomes=2 queue.total=7 | mock |
| API-N14 | היסטוריית שינויי הגדרות | עבר | audit +2; last diff={"to":30,"from":45} | mock |
| API-N15 | ייבוא עם דוח שגיאות לפי שורה | עבר | {"created":1,"updated":0,"invalid":2,"errors":[{"row":2,"phone":"12","reason":"מספר טלפון לא תקין"},{"row":3,"phone":"abc","reason":"מספר טלפון לא תקין"}]} | mock |
| API-N16 | מדדים מורחבים ודיוק טווח (חציית חצות, ללא ספירה כפולה) | עבר | today dials=46/46, with yesterday=47; unique=6/6; avgRing=4s avgWrap=0s gap=7s adherence={"due":3,"onTime":1,"overdueOpen":0,"rate":33} | mock |
| API-N17 | מדיניות שמירה – עבודת רקע מוחקת הקלטות ישנות | עבר | unauth 401; job 200; old=none new=saved | mock |
| API-N18 | 4 נציגים בשני עסקים מריצים תותח שיחות במקביל | עבר | לידים שנמשכו=12 כפולים=0 שגיאות=0; next-lead latency p50=42ms p95=59ms (PostgreSQL מקומי; סימולציה) | mock |
| API-N19 | רשימה של 10,000 לידים – הקצאה ועימוד | עבר | leads=10000; DB RTT=1ms; next-lead p50=40ms p95=55ms; עמוד 100 (50 שורות)=21ms; סטטיסטיקה=27ms (dueNow=9990) | mock |
| API-N20 | החזקה, העברת שיחה חיה והצטרפות מנהל לשיחה | לא ממומש | חסרים; האזנה ולחישה קיימות, אך שמע אמיתי לא נבדק | n/a |
| API-N21 | תמלול, סיכום, זיהוי התנגדויות | לא ממומש | אין ספק תמלול מחובר – לא מיוצרים סיכומים מדומים | n/a |
| API-N22 | הודעת המשך לפי כללי החיבור | לא ממומש | אין חיבור WhatsApp במערכת זו | n/a |
| API-R1 | הרשאות: נציג, מנהל מעסק אחר, מנהל בלי צוות, האזנה לעצמך | עבר | agent 403, other business 404, no-team manager 403, self 400/self_monitor | mock |
| API-R2 | הצטרפות רק אחרי מענה; 'מאזין' רק אחרי אישור חיבור | עבר | early=call_not_answered; start=connecting → listening after 1478ms; live row shows monitor=listening; audit=monitor.started,monitor.joined | mock |
| API-R3 | לחיצה כפולה ושיחה אחת בכל פעם | עבר | double: 200/200 same=true; other call → 409/monitor_active; active monitors=1 | mock |
| API-R4 | מעבר מפורש ללחישה וחזרה; יציאה לא פוגעת בשיחה | עבר | whisper→whispering, listen→listening, agent switch 403, stop→ended, call alive=true; audit=monitor.started,monitor.joined,monitor.whisper_on,monitor.whisper_off,monitor.ended | mock |
| API-R5 | השיחה מסתיימת בזמן האזנה / בזמן התחברות | עבר | while listening → ended/call_ended; while connecting (connecting) → ended; active monitor after=null | mock |
| API-R6 | עדכון תוך ~2ש׳: חיוג, מענה, ניתוק משתקפים ב-/live; מונה השיחות עולה פעם אחת | עבר | statuses seen: dialing→ringing→in_call; lag DB-visible→live=0ms; provider-timestamp→live=13ms (כולל עיבוד הסימולציה מקומית מול local PostgreSQL); wrap_up=true; attempts 57→58 | mock |
| API-R7 | אירוע ישן לא מחזיר שיחה שהסתיימה; אירוע כפול לא מכפיל מונים | עבר | call stays ended, answeredAt=null; attempts 59→59; answered 36→36; row=available | mock |
| API-R8 | מדדי היום מול נתוני בדיקה ידועים (יוצאות = ניסיונות שהספק יצר; נכשלו לפני יצירה בנפרד) | עבר | attempts 59/59, answered 36/36, failedPre 0/0, rate 61%, sales 2/2, talk 21/21 | mock |
| API-R9 | דפדפן מנותק אך השיחה חיה → מוצגים שני הנתונים; אין סיום שיחה בגלל אובדן heartbeat | עבר | status=in_call connected=false call alive=true | mock |
| API-R10 | בידוד אודיו: המנהל שומע את שני הצדדים, אף צד לא שומע אותו; בלחישה רק הנציג שומע | חסום | אין חשבון Telnyx ומספר בדיקה. הבידוד נאכף אצל הספק (supervisor_role monitor/whisper + whisper_call_control_ids) – מאומת מול ה-OpenAPI בלבד | n/a |

## בדיקות דפדפן קיימות

| מזהה | תרחיש | סטטוס | ראיה |
|---|---|---|---|
| UI-U1 | כניסה → מסך חיוג, RTL, מספר טלפון מוצג LTR | עבר | html dir=rtl, phone direction=ltr |
| UI-U2 | תג הדמיה ומצב חיבור טלפוניה | עבר | badge=true, sidebar=true |
| UI-U3 | הדבקה+חיוג, מצבי שיחה, טיימר ממענה, ניתוק, תיעוד במקשים | עבר | paste→0501234507; מצבים=מחבר את הנציג→מחייג ללקוח→מצלצל→בשיחה; טיימר=true (00:03); חיוג מנוטרל בזמן שיחה=true; נבחר="ענה – לא מעוניין2"; שיחה חדשה=true |
| UI-U4 | קיצורי מקלדת לא פועלים בזמן הקלדת הערות | עבר | לפני=["אין מענה4"] אחרי=["אין מענה4"] |
| UI-U5 | טיוטת הערות שורדת רענון | עבר | textarea="טיוטה לפני רענון ✍️"; outcome=no_answer |
| UI-U6 | פס שיחה קבוע בניווט בין מסכים | עבר | bar="מספר לא מזוהה050-123-4508בשיחה00:02הדמיההשתקנתקלמסך החיוג"; same call after nav=true |
| UI-U7 | סשן מלא: התחלה → חיוג אוטומטי → תיעוד → ספירה לאחור → השהיה עוצרת → המשך מחייג | עבר | שיחה ראשונה=true; שיחה חדשה במהלך השהיה=false; שיחה חדשה אחרי המשך=true; 'סיים סשן' מנוטרל בשיחה=true |
| UI-U8 | אין חיוג אוטומטי; דילוג עם סיבה דרך המודל | עבר | שיחה חדשה ב-8ש׳=false; ליד1="מרים שפירא" → ליד2="רחל אברהם" (API: רחל אברהם) |
| UI-U9 | שתי לשוניות – השנייה משתלטת על הסשן | עבר | הודעה מוצגת; חיוג לליד מנוטרל=true |
| UI-U10 | אנשי קשר: חיוג מכרטיס ופס שיחה | עבר | שיחה חדשה=true |
| UI-U11 | דשבורד מנהל מציג נציג 'בשיחה' בזמן אמת | עבר | בזמן שיחה: כולל 'בשיחה'=true; אחרי: זמין |
| UI-U12 | מיקרופון חסום – הודעה ברורה | עבר | "הדפדפן חסם גישה למיקרופון – אפשר הרשאה בסרגל הכתובת ורענן" |
| UI-U13 | עמודי ניהול נטענים עם נתונים אמיתיים | עבר | lists=true, tasks=true, telephony tab=true |
| UI-U14 | שיחה נכנסת מוצגת לנציג עם קבל/דחה; קבלה → בשיחה; ניתוק → תיעוד | עבר | routed=routed_to_owner; answered inbound=true |
| UI-U15 | סיום רשימה: סיכום סשן אמיתי ומודל | עבר | list ok=true; modal="הרשימה נגמרה – סיכום סשן×1חיוגים0נענו0דקות שיחהמספר שגוי1זמן תיעוד ממוצע: 0 שנ׳נ"; session ended=true |
| UI-U16 | kill switch: מנהל עוצר חיוגים – הנציג נחסם עם הודעה ברורה | עבר | נחסם עם הודעה=true; אחרי חידוש שיחה חדשה=true |
| UI-U17 | 'למה עכשיו' מוצג בכרטיס הליד | עבר | "למה עכשיו: ליד חדש (פחות משעה) · הליד שלך" |
| UI-U18 | טאבים חדשים: תעדוף, בטיחות, היסטוריה נטענים עם נתונים | עבר | prio=true safety=true history=true |
| UI-U19 | דף 'מוקד בזמן אמת': מצבים, חיווי חיבור, מדדים מוגדרים, מצב חי לא מוצג בדוחות | עבר | live badge=true, groups=true, tooltip="ניסיונות חיוג יוצאים שהספק יצר (agent le", reports without status column=true |
| UI-U20 | מנהל רואה נציג בשיחה תוך ~2ש׳, מצטרף להאזנה, לוחש בלחיצה-והחזקה, אובדן פוקוס מפסיק, יציאה לא פוגעת בשיחה | עבר | אירוע-הוחל→שורה 'בשיחה' 76ms (כולל poll 1.5s + זמן בקשה מקומי); מחותמת הספק 96ms; row="דכדנה כהןצוות מכירות▶ בשיחה · 00:00רחל אברהם050-123-4533↗ יו"; whisper audit=true; blur→listen=true; agent call alive after exit=true; monitor cleared=true |

## רגרסיות לתיקונים

| מזהה | תרחיש | סטטוס | ראיה |
|---|---|---|---|
| REG-R1 | Paused session cannot dial a held lead | עבר | ראו JSON ולוג המצורפים |
| REG-R2 | Power call requires session and lead | עבר | ראו JSON ולוג המצורפים |
| REG-R3 | Session ownership cannot be omitted | עבר | ראו JSON ולוג המצורפים |
| REG-R4 | Manager-paused list prevents dialing an already held lead | עבר | ראו JSON ולוג המצורפים |
| REG-R5 | Wrap-up blocks a new manual call | עבר | ראו JSON ולוג המצורפים |
| REG-R6 | Concurrent agents cannot call the same normalized number | עבר | ראו JSON ולוג המצורפים |
| REG-R7 | Concurrent next-lead requests hold at most one lead per agent | עבר | ראו JSON ולוג המצורפים |
| REG-R8 | Concurrent callback saves create one task | עבר | ראו JSON ולוג המצורפים |
| REG-R9 | Reject cross-tenant contact owner before write | עבר | ראו JSON ולוג המצורפים |
| REG-R10 | Reject cross-tenant list relations before write | עבר | ראו JSON ולוג המצורפים |
| REG-R11 | Rejected list patch leaves caller ID unchanged | עבר | ראו JSON ולוג המצורפים |
| REG-R12 | Reject cross-tenant user team | עבר | ראו JSON ולוג המצורפים |
| REG-R13 | Simulation endpoint cannot route into another tenant | עבר | ראו JSON ולוג המצורפים |
| REG-R14 | Recording webhook retains provider recording ID | עבר | ראו JSON ולוג המצורפים |
| REG-R15 | Concurrent session starts leave one live session | עבר | ראו JSON ולוג המצורפים |
| REG-R16 | Future retry and owner grace use UTC on a non-UTC database | עבר | ראו JSON ולוג המצורפים |
| REG-R17 | Failed outcome transaction keeps summary and task unsaved | עבר | ראו JSON ולוג המצורפים |
| REG-R18 | An inbound number cannot be registered to a second tenant | עבר | ראו JSON ולוג המצורפים |
| REG-R19 | Cross-tenant import owner is rejected atomically | עבר | ראו JSON ולוג המצורפים |
| REG-R20 | Exhausted attempt count cannot reenter the queue as pending | עבר | ראו JSON ולוג המצורפים |
| REG-R21 | Expired signed session is rejected by direct API | עבר | ראו JSON ולוג המצורפים |
| REG-R22 | Contact card cannot expose another agent's private follow-up task | עבר | ראו JSON ולוג המצורפים |

## הזרקת כשלים לספק ומסד

| מזהה | תרחיש | סטטוס | ראיה |
|---|---|---|---|
| FAULT-F1 | Immediate hangup before agent answers reaches terminal state | עבר | ראו JSON ולוג המצורפים |
| FAULT-F2 | Early agent webhook cannot be overwritten by dial response | עבר | ראו JSON ולוג המצורפים |
| FAULT-F3 | A failed finalization side effect is retried on event redelivery | עבר | ראו JSON ולוג המצורפים |
| FAULT-F4 | Unknown dial timeout never redials beyond provider deduplication window | עבר | ראו JSON ולוג המצורפים |
| FAULT-F5 | Business day boundaries are independent of server timezone and DST | עבר | ראו JSON ולוג המצורפים |
| FAULT-F6 | Failed supervisor hangup does not report a successful disconnect | עבר | ראו JSON ולוג המצורפים |

## עמידות בדפדפן אמיתי

| מזהה | תרחיש | סטטוס | ראיה |
|---|---|---|---|
| BROWSER-B1 | Reload during a call retains the same call and does not dial again | עבר | {'callCount': 1} |
| BROWSER-B2 | Offline manager marks data stale; reconnect catches the ended call | עבר | {'reconnectToCurrentStateMs': 1288} |
| BROWSER-B6 | Draft save failure is visible and local note survives reload | עבר | {'errorVisible': True, 'localDraftRetained': True} |
| BROWSER-B3 | Failed outcome save keeps note and wrap-up; retry persists exactly once | עבר | {'persistedNote': True} |
| BROWSER-B4 | Desktop Hebrew layout fits 1366px and navigation does not multiply polling | עבר | {'pollsIn13Seconds': 2, 'width': 1366, 'scroll': 1366, 'dir': 'rtl'} |
| BROWSER-B5 | Browser without a session returns to login | עבר | {'redirected': True} |

## ביצועים והתאוששות

108 מחזורי חיוג מדומים, 1,476 בקשות כולל מסירת אירועים חוזרת, 324 אירועים ייחודיים; 10,000 לידים מלאכותיים. בכל מדרגה: אפס שגיאות, אפס הקצאות כפולות, אפס שיחות פעילות לאחר ניקוי. זמני API אינם זמני שמע או השהיית Telnyx. זהו עומס קצר על מחשב פיתוח עם מסד מקומי, לא בדיקת soak או הבטחת קיבולת ייצור.

| נציגים במקביל | בקשות | בקשות/שנייה | API p50 ms | API p95 ms | מקסימום ms |
|---|---|---|---|---|---|
| 1 | 41 | 21.3 | 70 | 236 | 236 |
| 5 | 205 | 30.1 | 153 | 662 | 2004 |
| 10 | 410 | 39.8 | 251 | 1063 | 1687 |
| 20 | 820 | 97.4 | 219 | 625 | 1220 |

- EXPLAIN על שאילתת בחירת מועמד מייצגת: 2.062ms, סריקה ומיון top-N על כ־10,000 רשומות. זו אינה מדידת transaction claim מלאה. אין הצדקה לאינדקס חדש ממדידה זו לבדה.
- עדכון מסך מנהל: דגימה מקומית אחת 76ms מהחלת האירוע עד הופעת השורה; 96ms מחותמת אירוע הספק המדומה. polling כל 1.5s, ולכן אין להסיק SLA של 96ms.
- מדידה נוספת בהרצת U20 הממוקדת: 1,289ms מהחלת האירוע ו־1,414ms מחותמת הספק המדומה. שתי הדגימות אינן התפלגות latency.
- חיבור מחדש של מנהל לאחר offline: 1,288ms עד מצב עדכני. לאחר ארבעה מעברי מסכים נמדדו שתי בקשות polling ב־13 שניות במצב הנבדק; לא נמדדה דליפת heap ארוכת טווח.
- עצירת תהליך האפליקציה והפעלתו מחדש: 699ms, אותו callId, ניסיון עם אותו idempotency key נשאר רשומה אחת, ניתוק וסיכום הצליחו. ספק mock אינו הוכחה לשרידות שיחת PSTN בזמן קריסה.
- סריקת 26 קובצי JS של לקוח מול ערכי הסודות המקומיים המוגדרים: ללא התאמות; אין קובצי env פרטיים ב־Git. זו סריקה ממוקדת, לא ביקורת סודות מלאה או penetration test.

## מה עדיין חוסם אישור למוקד אמיתי

| תרחיש/יכולת | סטטוס | מה חסר |
|---|---|---|
| שיחה אמיתית נכנסת ויוצאת, סטטוס מול הספק, שני כיווני שמע, mute, DTMF והתקנים | חסום | TELNYX_API_KEY, Call Control app, credential connection, מספרי QA מורשים ו־webhook נגיש |
| האזנה/לחישה והוכחה שלקוח אינו שומע לחישה | חסום | שלוש נקודות קצה אמיתיות ובדיקת שמע אצל כל משתתף |
| הקלטה אמיתית וגישת מורשים להורדה | חסום | שיחה מוקלטת בספק אמיתי; נבדקו הרשאות ושיוך בסימולציה |
| ניתוק רשת/קריסת דפדפן תוך אודיו חי, כשל Telnyx אמיתי | חסום | חשבון QA ותרחיש ספק אמיתי; נבדקו offline HTTP, reload ותהליך מקומי |
| התאוששות כשכל הדפדפנים סגורים ו־webhook חסר | חסום | לא הוכח reconciliation עצמאי רציף; אין worker עמיד שנבדק. אין להבטיח ניקוי אוטומטי לכל שיחה אבודה |
| timeout עם מצב ספק לא ידוע | חסום | קיים guard שמונע redial עיוור ושומר את הנציג; נדרש נוהל בירור מצב ספק לפני שחרור |
| Parallel/Predictive, החזקה, העברת שיחה חיה, barge-in | לא ממומש | מחוץ למימוש Preview/Power הנוכחי |
| WhatsApp ואוטומציית הודעות אמיתית | לא ממומש | אין חיבור; לא נשלחה הודעה ולא נבדקה מסירה |
| AI/תמלול | לא ממומש | אין ספק מחובר |
| קיבולת ספק, עומס ממושך/מרובה שרתים, זיכרון לאורך שעות | חסום | בדיקת עומס מקומית קצרה בלבד |

יש להשלים את הבדיקות החסומות עם נתוני QA מורשים לפני אישור תפעולי. אין בדוח טענה שאודיו, בידוד לחישה או זמינות ספק אומתו.

## קבצים ששונו והפעלה חוזרת

[הוראות שחזור](docs/qa-20260924/README.md). הקבצים העיקריים: `calls.ts`, `queue.ts`, `session.ts`, `events.ts`, `inbound.ts`, `monitor.ts`, נתיבי contacts/lists/users/phone-numbers, `DialerProvider.tsx`, `LeadCard.tsx`, ומחשבון היום העסקי. נוספו כלי QA לסביבה מבודדת, רגרסיות, fault injection, עומס, דפדפן ו־restart. רשימה מלאה: [changed-files.txt](docs/qa-20260924/evidence/changed-files.txt). אין מיגרציה חדשה ואין שינוי נתוני ייצור.
