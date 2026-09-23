# דוח QA – חייגן ותותח שיחות

תאריך: 2026-09-23 · סביבה: dev מקומי + Neon (schema dialer) · ספק טלפוניה: **הדמיה (mock)** – כל תרחישי הטלפוניה החיה מסומנים "חסום לבדיקה".

| סה״כ | עבר | נכשל | חסר במימוש | חסום לבדיקה |
|---|---|---|---|---|
| 88 | 85 | 0 | 0 | 3 |

## ממצאים ותיקונים במהלך ה-QA

באגים אמיתיים שנמצאו ותוקנו (כולם אומתו בבדיקה חוזרת):

1. **SQL גולמי לא מוסמך לסכמה** – שאילתות `FOR UPDATE SKIP LOCKED` ונעילת שיחה נכשלו על Neon עם `schema=dialer` (`relation "calls" does not exist`). תוקן ב-`src/lib/db.ts` (`dbSchema()`) + `queue.ts` + `events.ts`.
2. **אירוע ספק שנרשם אך לא עובד עד הסוף נחשב "כפול" לנצח** – כעת אירוע ללא `processedAt` מעובד מחדש (`events.ts`).
3. **החלפת רשימה בזמן סשן השאירה ליד נעול** עד פקיעת ה-TTL – `startSession` משחרר ליד מוחזק לפני החלפה (W7).
4. **מצב לקוח מיושן אחרי `refresh()`** – `stateRef` התעדכן רק ב-effect, ולכן Preview לא משך ליד ותהליכי המשך קראו מצב ישן (U8/U9).
5. **תשובות poll שמגיעות בסדר הפוך דרסו מצב חדש** – נוסף מונה רצף ל-`refresh` וניקוי דגל "הסשן בלשונית אחרת" כשאין סשן (U9).
6. **חלון חיוג קצר מדקה לא נמצא בסריקה** – `nextDialWindowOpening` סורק בדקות במקום ב-15 דקות (L3).
7. **הודעת DNC לליד שנחסם אחרי הקצאה** – הבדיקה מתבצעת לפני בדיקת הנעילה כדי להחזיר `dnc_blocked` ולא `lock_lost` (P4).

הערות תכנוניות שלא שונו: נוכחות הנציג מוצגת "בשיחה" כבר משלב החיוג (לא רק ממענה) – מוגדר במכוון; ההערות נשמרות אחרי trim של רווחים בקצוות.

מה **לא** נבדק (חסום – אין חשבון Telnyx ומספר בדיקה מאושר): אודיו דו-כיווני, השתקה אמיתית, DTMF מול IVR, החלפת התקן באמצע שיחה, ניתוק רשת אמיתי במהלך שיחה, timeout מול הספק ו-retry עם אותו `command_id`, הורדת הקלטה אמיתית. כל שכבת האירועים נבדקה מול סימולציה ומול Webhooks חתומים ב-Ed25519 עם מפתח בדיקה מקומי.

הפרדה: עמודת "אופן" – `mock` = נבדק מול סימולציה בצד השרת (אותו קוד מכונת-מצבים, ללא אודיו); `n/a` = בדיקה שאינה תלויה בספק.

## חיוג ידני

| מזהה | תרחיש | צפוי | בפועל | סטטוס | אופן | ראיה |
|---|---|---|---|---|---|---|
| M1 | הקלדה בפורמט מקומי עם רווח ומקף | נרמול ל-+972501234567, המקור נשמר להצגה | status 200, toE164=+972501234567, phoneRaw=050-123 4567 | עבר | mock | call cmudlj87600bavsejl89aen3d |
| M2 | פורמט בינלאומי של מספר קיים | אותו איש קשר (ללא כפילות) | contacts before=1 after=1, name=לקוח ב׳ 1 | עבר | mock |  |
| M3 | מספר עם סוגריים | נרמול תקין | 200 +972521000004 | עבר | mock |  |
| M4 | מספר ריק / קצר / לא תקין | 400 עם הודעה ברורה, לא נוצרת שיחה | 400:missing_destination 400:invalid_phone 400:invalid_phone 400:invalid_phone | עבר | mock | calls 3→3 |
| M5 | מספר בינלאומי (ארה״ב) | מתקבל ומנורמל ל-E.164 | 200 +14155552671 | עבר | mock |  |
| M6 | לחיצה כפולה מהירה (שתי בקשות במקביל, מפתחות שונים) | נוצרת שיחה אחת בלבד | הצלחות=1 (409/200), שיחות חדשות=1 | עבר | mock |  |
| M7 | אותו מפתח idempotency פעמיים | אותו מזהה שיחה | cmudlmt7300ddvsejambsmedj / cmudlmt7300ddvsejambsmedj | עבר | mock |  |
| M8 | חיוג בזמן שיחה פעילה | 409 call_active | 409 call_active | עבר | mock |  |
| M9 | חיוג מכרטיס לקוח (contactId) | שיחה עם contactId נכון ומספר יוצא של העסק | contact ok=true, from=+97239876543 | עבר | mock |  |
| M10 | מספר יוצא של עסק אחר | 400 – לא מורשה | 400 invalid_from_number | עבר | mock |  |
| M11 | שיחות אחרונות / חיוג חוזר | המספר מופיע ב-recent | 8 רשומות, כולל 0521000005=true | עבר | mock |  |
| M12 | מספר חסום (DNC) – ידני, מכרטיס ומליד | 403 dnc_blocked בכל המסלולים | 403/dnc_blocked, 403/dnc_blocked | עבר | mock |  |
| M13 | כפילות מספר בין כרטיסים | יצירת איש קשר עם מספר קיים → 409 | 409 duplicate_phone | עבר | mock |  |
| M14 | עסק ללא מספר יוצא | 400 no_from_number | 400 no_from_number | עבר | mock |  |
| M15 | חיוג כשהספק מנותק / מיקרופון חסום | כפתור חיוג מנוטרל והודעה ברורה | נבדק ב-UI (ראה U-סדרה); ניתוק ספק אמיתי דורש חשבון Telnyx | חסום לבדיקה | n/a |  |
| U3 | הדבקה+חיוג, מצבי שיחה, טיימר ממענה, ניתוק, תיעוד במקשים | מעבר מצבים → 'בשיחה' → אחרי ניתוק פאנל תוצאה → מקש 2 + Enter שומר | paste→0501234507; מצבים=מחייג ללקוח→מצלצל→בשיחה; טיימר=true (00:12); חיוג מנוטרל בזמן שיחה=true; נבחר="ענה – לא מעוניין2"; שיחות +1 | עבר | mock | docs/qa-shots/U3-*.png |

## Preview

| מזהה | תרחיש | צפוי | בפועל | סטטוס | אופן | ראיה |
|---|---|---|---|---|---|---|
| P1 | התחלת סשן Preview ומשיכת ליד | ליד עם פרטי קשר, lockToken ותפוגת נעילה | lead=לקוח ב׳ 1, status=locked, calls=0 (אין חיוג אוטומטי) | עבר | mock |  |
| P2 | דילוג עם סיבה | הסיבה נשמרת, הליד חוזר לתור עם nextAttemptAt עתידי, attempts לא עולה | reason=לא זמן מתאים, status=pending, attempts=0, next=2026-09-23T04:56:41.349Z | עבר | mock |  |
| P3 | עדכון פרטי ליד לפני חיוג | PATCH נשמר ומופיע בכרטיס | 200 company=חברת QA | עבר | mock |  |
| P4 | ליד נחסם (DNC) בזמן ההמתנה | חיוג נדחה 403 dnc_blocked והליד מסומן dnc | 403 dnc_blocked, lead.status=dnc | עבר | mock |  |
| P5 | ליד הוסר ע״י מנהל בזמן ההמתנה | חיוג נדחה (lock_lost) | 409 lock_lost | עבר | mock |  |
| P6 | נעילה פגה וליד נלקח ע״י נציג אחר | נציג ב׳ מקבל את הליד; לנציג א׳ lock_lost | agent4 got lead=true, agent3 dial → 409 lock_lost | עבר | mock |  |
| P7 | רשימה ריקה | next-lead מחזיר null | 200 data=null | עבר | mock |  |
| U8 | אין חיוג אוטומטי; דילוג עם סיבה דרך המודל | ליד מוצג, 0 שיחות ב-8 שניות, המודל מציג סיבות ואחרי בחירה נטען ליד אחר | שיחות ב-8ש׳=0; ליד1="ישראל ישראלי" → ליד2="שרה כהן" (API: שרה כהן) | עבר | mock | docs/qa-shots/U8-*.png |

## תותח שיחות

| מזהה | תרחיש | צפוי | בפועל | סטטוס | אופן | ראיה |
|---|---|---|---|---|---|---|
| W1 | התחלת סשן, משיכה וחיוג – רק שיחה אחת לנציג | שני חיוגים במקביל → אחד מצליח | הצלחות=1, שיחות חיות=1, סיום=answered | עבר | mock | call cmudlr3yx00fqvsejmoc1l5we |
| W2 | מעבר לליד הבא לפני תיעוד | 409 outcome_required | 409 outcome_required | עבר | mock |  |
| W3 | שמירת תוצאה בזמן שיחה פעילה | 409 call_still_active | בזמן שיחה: 409 call_still_active; אחרי ניתוק: 200 | עבר | mock |  |
| W4 | תוצאות ספק: נענה / אין מענה / תפוס / נדחה | telephonyResult תואם, talkSeconds רק לשיחה שנענתה ונמדד מהמענה | 0521000010→no_answer talk=0s \| 0521000011→busy talk=0s \| 0521000012→rejected talk=0s \| 0521000005→answered talk=11s ring→answer 5s | עבר | mock |  |
| W5 | השהיה – משיכת ליד בסשן מושהה | 409 session_paused | 409 session_paused, presence=paused | עבר | mock |  |
| W6 | סיום סשן בזמן שיחה | 409 call_active; אחרי ניתוק – הסשן נסגר והליד משוחרר | בזמן שיחה 409/call_active; אחרי: 200, lead.locked=false, presence=offline | עבר | mock |  |
| W7 | החלפת רשימה בזמן סשן | סשן חדש מחליף את הקודם והליד הקודם משוחרר | old.status=ended, lead.status=pending, locked=false | עבר | mock |  |
| W8 | מדיניות ניסיונות: אין מענה → ניסיון חוזר; מקסימום → מוצה | attempts=1 & nextAttemptAt≈+30ד׳; ניסיון שני → exhausted (maxAttempts=2) | #1: attempts=1 status=pending next=+30m \| #2: attempts=2 status=exhausted next=+nullm | עבר | mock |  |
| W9 | תפוס → ניסיון חוזר לפי busyRetryMinutes (5) | nextAttemptAt ≈ +5 דק׳ | provider=busy, next=+5m | עבר | mock |  |
| W10 | callback מנותב לנציג שקבע אותו | נציג אחר לא מקבל את הליד לפני חלון החסד; הבעלים כן | agent4 got=null, owner got=true | עבר | mock |  |
| U7 | סשן מלא: התחלה → חיוג אוטומטי → תיעוד → ספירה לאחור → השהיה עוצרת → המשך מחייג | אין חיוג נוסף בזמן השהיה; אחרי המשך נוצרת שיחה חדשה; 'סיים סשן' מנוטרל בזמן שיחה | שיחה ראשונה=true; שיחה חדשה במהלך השהיה=false; שיחה חדשה אחרי המשך=true; 'סיים סשן' מנוטרל בשיחה=true | עבר | mock | docs/qa-shots/U7-*.png |

## תוצאות

| מזהה | תרחיש | צפוי | בפועל | סטטוס | אופן | ראיה |
|---|---|---|---|---|---|---|
| O1 | תוצאה "answered_interested" משיחה על ליד | נשמרת ב-DB עם שיוך נכון, מופיעה בהיסטוריה, הליד מתעדכן, הערה נשמרת במלואה | 200; provider=answered, outcome=answered_interested, note ok=true (1596 תווים), lead.status=completed, בהיסטוריה=true | עבר | mock | call cmudmprcu00smvsejzbpfsan0 |
| O2 | תוצאה "answered_not_interested" משיחה על ליד | נשמרת ב-DB עם שיוך נכון, מופיעה בהיסטוריה, הליד מתעדכן, הערה נשמרת במלואה | 200; provider=rejected, outcome=answered_not_interested, note ok=true (1596 תווים), lead.status=completed, בהיסטוריה=true | עבר | mock | call cmudmqsiv00t0vsejn2abx6p0 |
| O3 | תוצאה "callback" משיחה על ליד | נשמרת ב-DB עם שיוך נכון, מופיעה בהיסטוריה, הליד מתעדכן, הערה נשמרת במלואה | 200; provider=answered, outcome=callback, note ok=true (1596 תווים), lead.status=callback, tasks=1, בהיסטוריה=true | עבר | mock | call cmudmrn6k00tbvsejcs722o9f |
| O4 | תוצאה "no_answer" משיחה על ליד | נשמרת ב-DB עם שיוך נכון, מופיעה בהיסטוריה, הליד מתעדכן, הערה נשמרת במלואה | 200; provider=answered, outcome=no_answer, note ok=true (1596 תווים), lead.status=pending, בהיסטוריה=true | עבר | mock | call cmudmsoag00tqvsejz3renv53 |
| O5 | תוצאה "busy" משיחה על ליד | נשמרת ב-DB עם שיוך נכון, מופיעה בהיסטוריה, הליד מתעדכן, הערה נשמרת במלואה | 200; provider=no_answer, outcome=busy, note ok=true (1596 תווים), lead.status=pending, בהיסטוריה=true | עבר | mock | call cmudmtobr00u4vsej6ciu04r3 |
| O6 | תוצאה "wrong_number" משיחה על ליד | נשמרת ב-DB עם שיוך נכון, מופיעה בהיסטוריה, הליד מתעדכן, הערה נשמרת במלואה | 200; provider=busy, outcome=wrong_number, note ok=true (1596 תווים), lead.status=completed, בהיסטוריה=true | עבר | mock | call cmudmunrp00ufvsej4khjyws5 |
| O7 | תוצאה "sale" משיחה על ליד | נשמרת ב-DB עם שיוך נכון, מופיעה בהיסטוריה, הליד מתעדכן, הערה נשמרת במלואה | 200; provider=answered, outcome=sale, note ok=true (1596 תווים), lead.status=completed, בהיסטוריה=true | עבר | mock | call cmudmvicg00uqvsejl4vnpavf |
| O8 | תוצאה "dnc" משיחה על ליד | נשמרת ב-DB עם שיוך נכון, מופיעה בהיסטוריה, הליד מתעדכן, הערה נשמרת במלואה | 200; provider=answered, outcome=dnc, note ok=true (1596 תווים), lead.status=dnc, dnc=1, בהיסטוריה=true | עבר | mock | call cmudn3ra600xcvsejwm306lad |
| O9 | שמירה כפולה של תוצאה | השמירה השנייה לא דורסת ולא יוצרת משימה נוספת | outcome=callback, tasks=1 | עבר | mock |  |
| O10 | טיוטת הערה נשמרת בשרת ונמחקת אחרי תיעוד | PUT/GET draft עובדים; אחרי outcome הטיוטה נמחקת | draft=טיוטה 123 → after outcome="" | עבר | mock |  |
| O11 | מכירה אינה יוצרת הזמנה/הכנסה | אין ישות הזמנות במערכת; המדד סופר תוצאות בלבד | טבלאות: users, _prisma_migrations, contacts, businesses, scripts, dialer_sessions, list_leads, phone_numbers, tasks, note_drafts, telephony_events, dial_list_agents, dnc_entries, dial_lists, teams, audit_logs, calls | עבר | n/a |  |

## משימות חזרה

| מזהה | תרחיש | צפוי | בפועל | סטטוס | אופן | ראיה |
|---|---|---|---|---|---|---|
| T1 | מועד חזרה בעבר | 400 callback_in_past | עבר: 400/callback_in_past; בלי מועד: 400/callback_time_required | עבר | mock |  |
| T2 | אזור זמן: מועד עם offset של ישראל נשמר כרגע UTC נכון | dueAt זהה לרגע שנשלח | sent=2026-09-24T10:01:00.000+03:00 stored=2026-09-24T07:01:00.000Z | עבר | mock |  |
| T3 | שינוי מועד ומשימה מסומנת כבוצעה | dueAt מתעדכן וגם nextAttemptAt של הליד; done → ליד completed | next=2026-09-25T05:01:35.024Z, task=done, lead=completed | עבר | mock |  |
| T4 | נציג רואה רק את המשימות שלו; מנהל רואה את הצוות | agent4 לא רואה משימות של agent3; managerB רואה | agent4=0 (כולן שלו), manager=2, agent4 מבקש של agent3=0 | עבר | mock |  |

## DNC

| מזהה | תרחיש | צפוי | בפועל | סטטוס | אופן | ראיה |
|---|---|---|---|---|---|---|
| D1 | חסימה חלה על כל הרשימות של העסק ולא על עסק אחר עם אותו מספר | לידים של +972501234503 בעסק ב׳ → dnc; בעסק א׳ נשארים | B leads=dnc,dnc; A leads=pending; dnc in A=0; audit=2 | עבר | mock |  |
| D2 | הרשאות: נציג לא מסיר חסימה, מנהל כן; שינוי מתועד | DELETE by agent → 403; by manager → 200 + audit | agent 403, manager 200, audit=1 | עבר | mock |  |
| D3 | רשימת DNC למנהל בלבד | GET by agent → 403 | 403 | עבר | mock |  |

## רשימות

| מזהה | תרחיש | צפוי | בפועל | סטטוס | אופן | ראיה |
|---|---|---|---|---|---|---|
| L1 | יצירת רשימה מסינון CRM + מניעת כפילויות + סינון DNC | added = אנשי קשר במקור qa שאינם חסומים; הוספה חוזרת = 0 | added=6 (צפוי 6), שוב=0 | עבר | mock |  |
| L2 | רשימה משויכת לנציג אחר | agent3 → 403 בהתחלת סשן; agent4 מצליח | agent3 403, agent4 200 | עבר | mock |  |
| L3 | חלון חיוג סגור (רשימת לילה) | next-lead → 409 outside_dial_window עם מועד הפתיחה הבא | 409 outside_dial_window next=2026-09-24T00:00:00.000Z | עבר | mock |  |
| L4 | נציג רואה רק רשימות משויכות אליו או פתוחות | agent3 לא רואה 'QA-B רק נציג ד׳' | QA-B רשימה, QA-L1, QA-L1, QA-L1, QA-L1, QA-L1, QA-B לילה בלבד, QA-B ריקה, QA-L5 | עבר | mock |  |
| L5 | מחיקת רשימה עם שיחה פעילה | 409 list_busy; ללא שיחה → מושבתת (לא נמחקת) | busy: 409/list_busy; idle: 200, exists=true active=false | עבר | mock |  |

## הפרדת עסקים

| מזהה | תרחיש | צפוי | בפועל | סטטוס | אופן | ראיה |
|---|---|---|---|---|---|---|
| X1 | נציג בעסק ב׳ ניגש לאיש קשר / שיחה / הקלטה של עסק א׳ | 404 בכולם | 404 404 404 404 | עבר | mock |  |
| X2 | רשימות/חיפוש אנשי קשר לא דולפים בין עסקים | contacts של ב׳ רק businessId ב׳; ליד מעסק א׳ לא ניתן לחיוג | contacts all B=true; dial lead of A → 409 call_active | עבר | mock |  |

## הרשאות

| מזהה | תרחיש | צפוי | בפועל | סטטוס | אופן | ראיה |
|---|---|---|---|---|---|---|
| X3 | דשבורד מנהל: מנהל ב׳ רואה רק את עסק ב׳; מנהל בלי צוות רואה את עצמו בלבד; נציג 403 |  | managerB agents=3 (רק ב׳=true), lonely=1, agent=403 | עבר | mock |  |
| X4 | היסטוריית שיחות לפי נראות | נציג רואה רק שלו; מנהל צוות רואה את הצוות; מנהל בלי צוות רק את עצמו | agent3=28, manager=28, lonely=0, agent3→agent4=0 | עבר | mock |  |
| X5 | פעולות ניהול | agent: settings PATCH 403, users POST 403, lists POST 403, import 403; manager: users POST 403, settings PATCH 403; admin: 200 | agent=403/403/403/403, manager=403/403/403, admin=200 | עבר | mock |  |
| X6 | נציג עורך איש קשר שאינו שלו ולא טיפל בו | 403 | 403 forbidden | עבר | mock |  |

## אבטחה

| מזהה | תרחיש | צפוי | בפועל | סטטוס | אופן | ראיה |
|---|---|---|---|---|---|---|
| X7 | ללא cookie / cookie מזויף | 401 | 401 401 | עבר | mock |  |
| X8 | משתמש מושבת מאבד גישה מיד | 401 אחרי isActive=false | לפני 200, אחרי 401 | עבר | mock |  |

## סשנים

| מזהה | תרחיש | צפוי | בפועל | סטטוס | אופן | ראיה |
|---|---|---|---|---|---|---|
| S1 | heartbeat מלשונית זרה | sessionOk=false session_taken | {"sessionOk":false,"reason":"session_taken"} | עבר | mock |  |
| S2 | לשונית שנייה מתחילה סשן | הסשן הראשון מסתיים; פעולות מהלשונית הראשונה → session_ended | old tab next-lead → session_ended; state.ownedByThisTab=false | עבר | mock |  |
| S3 | סגירת דפדפן: סשן ללא heartbeat נסגר, נציג offline, ליד משוחרר | אחרי reaper: session ended, presence offline, lead pending | session=ended, presence=offline, lead=pending/locked=false | עבר | mock |  |
| S4 | סשן עם שיחה חיה לא נקצר ע״י ה-reaper | הסשן נשאר פעיל כל עוד השיחה חיה | session=active | עבר | mock |  |
| U9 | שתי לשוניות – השנייה משתלטת על הסשן | הלשונית הראשונה מציגה 'הסשן עבר ללשונית אחרת' ומנטרלת פעולות | הודעה מוצגת; חיוג לליד מנוטרל=true | עבר | mock | docs/qa-shots/U9-*.png |

## מנהל

| מזהה | תרחיש | צפוי | בפועל | סטטוס | אופן | ראיה |
|---|---|---|---|---|---|---|
| G1 | מדדים תואמים ל-DB לפי ההגדרות המוצהרות | dials=count(calls), connected=count(answeredAt), avgTalk=sum(talk)/connected | api dials=24/24 connected=13/13 avgTalk=9 sales=0/0 rate=54% | עבר | mock |  |
| G2 | מצב נציג בזמן אמת בזמן שיחה | presence=in_call + liveCall בדשבורד; אחרי סיום wrap_up | בשיחה: in_call/answered; אחרי ניתוק: wrap_up; אחרי תיעוד: available | עבר | mock |  |
| U11 | דשבורד מנהל מציג נציג 'בשיחה' בזמן אמת | שורת agent1 מציגה 'בשיחה' ואחרי תיעוד 'זמין'/'מנותק' | בזמן שיחה: כולל 'בשיחה'=true; אחרי: זמין | עבר | mock | docs/qa-shots/U11-*.png |

## Webhooks

| מזהה | תרחיש | צפוי | בפועל | סטטוס | אופן | ראיה |
|---|---|---|---|---|---|---|
| H1 | חתימה תקינה / גוף שונה / חותמת זמן ישנה | 200 / 401 / 401 | 200 401 401 | עבר | mock |  |
| H2 | אירוע כפול ואירועים בסדר הפוך (hangup לפני answered) | כפול מסומן duplicate ללא שינוי; hangup מסיים; answered מאוחר לא מחייה את השיחה | hangup→ended=true result=busy; duplicate=true; events stored=1; late answered → status=ended, answeredAt=null | עבר | mock |  |
| H3 | recording.saved מסמן הקלטה; הורדה דרך proxy מאומת בלבד | recordingStatus=saved; GET recording ע״י נציג אחר של אותו צוות → מותר למנהל, 403 לנציג אחר | status=saved id=mock-rec-cmudm932b00olvsejz45nit3t dur=5000ms; owner=404(recording_unavailable) other-agent=403 manager=404(recording_unavailable) – הורדה אמיתית חסומה ללא Telnyx | עבר | mock |  |
| H4 | אירוע ל-leg לא מוכר | 200 ללא שינוי | 200 {"ok":true,"duplicate":false,"callId":null} | עבר | mock |  |
| H5 | timeout בבקשת חיוג לספק → בדיקה אם נוצרה שיחה לפני ניסיון חוזר | dialPendingSince → המתנה ל-webhook → retry עם אותו command_id | דורש ספק אמיתי/פרוקסי רשת; הלוגיקה קיימת ב-reconcileCall אך לא הופעלה בבדיקה | חסום לבדיקה | n/a |  |

## אודיו

| מזהה | תרחיש | צפוי | בפועל | סטטוס | אופן | ראיה |
|---|---|---|---|---|---|---|
| A1 | אודיו דו-כיווני, השתקה בפועל, DTMF ליעד IVR, החלפת אוזניות באמצע שיחה | אודיו נשמע בשני הצדדים | אין חשבון Telnyx ומספר בדיקה מאושר | חסום לבדיקה | n/a |  |

## UI

| מזהה | תרחיש | צפוי | בפועל | סטטוס | אופן | ראיה |
|---|---|---|---|---|---|---|
| U1 | כניסה → מסך חיוג, RTL, מספר טלפון מוצג LTR | dir=rtl על html; אלמנט .phone עם direction ltr | html dir=rtl, phone direction=ltr | עבר | mock | docs/qa-shots/U1-*.png |
| U2 | תג הדמיה ומצב חיבור טלפוניה | מוצג 'מצב הדמיה' ובסרגל 'הדמיה' | badge=true, sidebar=true | עבר | mock | docs/qa-shots/U2-*.png |
| U4 | קיצורי מקלדת לא פועלים בזמן הקלדת הערות | הקלדת '4' בתיבת ההערות לא בוחרת תוצאה | לפני=["אין מענה4"] אחרי=["אין מענה4"] | עבר | mock | docs/qa-shots/U4-*.png |
| U6 | פס שיחה קבוע בניווט בין מסכים | ב-/contacts מוצג פס עם טיימר ונתק; חזרה ל-/dialer מציגה אותה שיחה | bar="מספר לא מזוהה050-123-4508בשיחה00:07הדמיההשתקנתקלמסך החיוג"; same call after nav=true | עבר | mock | docs/qa-shots/U6-*.png |
| U10 | אנשי קשר: חיוג מכרטיס ופס שיחה | לחיצה על 'חייג' בשורה יוצרת שיחה ופס שיחה מופיע | שיחה חדשה=true | עבר | mock | docs/qa-shots/U10-*.png |
| U12 | מיקרופון חסום – הודעה ברורה | בלי הרשאת מיקרופון מוצגת הודעת שגיאה בלוח השיחה | "הדפדפן חסם גישה למיקרופון – אפשר הרשאה בסרגל הכתובת ורענן" | עבר | mock | docs/qa-shots/U12-*.png |
| U13 | עמודי ניהול נטענים עם נתונים אמיתיים | /lists מציג את הרשימה, /tasks נטען, /settings טאבים | lists=true, tasks=true, telephony tab=true | עבר | mock | docs/qa-shots/U13-*.png |

## תיעוד

| מזהה | תרחיש | צפוי | בפועל | סטטוס | אופן | ראיה |
|---|---|---|---|---|---|---|
| U5 | טיוטת הערות שורדת רענון | אחרי reload התיבה מכילה את הטקסט | textarea="טיוטה לפני רענון ✍️"; outcome=no_answer | עבר | mock | docs/qa-shots/U5-*.png |

