# QA — מודול ניהול מספרים

תאריך: 24.09.2026. סביבה: Next dev מקומי 3107, PostgreSQL 18.4 מבודד, schema dialer, Chromium 1366×900. ספק mock והזרקת transport בלבד. אין רכישות אמיתיות, שיחות חיצוניות או שינוי ייצור.

| שכבה | תוצאה | פירוש |
|---|---|---|
| שירותי מספרים ומסד | 24 עברו, 0 נכשלו | transaction אמיתית, בקשות מקבילות, mock provider |
| דפדפן | 5 עברו, 0 שגיאות דפדפן | CRUD ומדיניות מול שרת מקומי; חלונית רכישה עם interception מוצהר |
| רגרסיית חייגן | 22 עברו | אבטחה, תור, נעילות, אירועים ושמירת תוצאה |
| חיוג ידני | 14 עברו, 1 חסום | חסימת ספק/מיקרופון אמיתי דורשת תשתית חיה |
| Build | עבר | production build מקומי עם Webpack; אין deploy |
| Typecheck | עבר | TypeScript |
| Lint | עבר ללא שגיאות | 14 אזהרות קיימות; אין אזהרות חדשות במודול |
| Telnyx חי | חסום | אין חיבור QA מאומת; רכש אמיתי לא בוצע לפי ההוראה |
| Truecaller API מוניטין | חסום / אינו נתמך בחיבור הנוכחי | אין הרשאת חשבון ותיעוד API מורשה. ידני בלבד |
| Zadarma adapter | לא ממומש | ה־API של הספק תומך ברכישה; נבדק תיעוד, לא חיבור |

## תרחישים

| מזהה | תרחיש | סטטוס |
|---|---|---|
| NUM1 | Agent cannot manage numbers and another tenant cannot mutate them | עבר |
| NUM2 | Configuration alone never claims verified connection; no credentials in response | עבר |
| NUM3 | Three parallel reservations use three numbers and respect concurrent cap | עבר |
| NUM4 | Lead retains its prior caller ID | עבר |
| NUM5 | Paused, inactive and daily exhausted numbers are skipped | עבר |
| NUM6 | Fixed campaign cannot silently replace an unavailable number | עבר |
| NUM7 | Agent-specific policy and load policy choose eligible assignments | עבר |
| NUM8 | Spam-marked prior number blocks automatic replacement for that lead | עבר |
| NUM9 | DNC applies across all outbound numbers | עבר |
| NUM10 | No verified ownership or stale verification cannot place a real call | עבר |
| NUM11 | Outbound pause preserves callback routing to the previous agent | עבר |
| NUM12 | Purchase requires explicit admin confirmation | עבר |
| NUM13 | Concurrent purchase clicks charge once; ambiguous success is reconciled | עבר |
| NUM14 | Purchase success plus setup failure stays out of dial pool; retry never buys twice | עבר |
| NUM15 | Stale or changed price quotes cannot charge | עבר |
| NUM16 | Missing remote order after timeout does not authorize another purchase | עבר |
| NUM17 | Failed inventory sync marks connection failed and preserves numbers/history | עבר |
| NUM18 | Secrets stay server-side, provider 429 is visible, test flag blocks real purchase | עבר |
| NUM19 | Manual reputation report is distinct from API check and persists | עבר |
| NUM20 | Server throttles management API requests | עבר |
| NUM21 | Fresh provider connection and fresh number verification are both required | עבר |
| NUM22 | Telnyx adapter checks app, enabled outbound profile, inventory and documented prices | עבר |
| NUM23 | Preview call creation atomically stores the selected caller ID and reason | עבר |
| NUM24 | Concurrent agents cannot exceed a daily number limit | עבר |

## דפדפן

| תרחיש | סטטוס |
|---|---|
| Hebrew RTL management page, honest disconnected state and spam alert | עבר |
| Pause persisted on server and survives reload | עבר |
| Failed activation is shown and does not claim success | עבר |
| Campaign policy saves and reloads | עבר |
| Purchase confirmation shows price and requires explicit approval (UI fixtures only) | עבר |

רוחב מסך/מסמך 1366/1366: ללא גלילה אופקית של הדף. טבלת מספרים נגללת פנימית בעת הצורך. אין pageerror. הבדיקות וידאו/שמע אינן חלק ממודול זה ולא אומתו מול ספק אמיתי.

## ממצאים במהלך המימוש

- חיבור שמור אינו הוכחה לבעלות או לזמינות: חיוג אמיתי נחסם ללא אימות חיבור ומספר עדכניים; פרופיל יוצא כבוי נכשל בבדיקה.
- חיוב כפול: חמש בקשות רכישה מקבילות יצרו POST אחד במתאם המדומה. גם timeout לאחר הצלחה הסתיים בבירור ובמספר אחד במאגר.
- רכישה הצליחה והגדרה נכשלה: המספר לא נוסף למאגר; בירור נוסף השלים הגדרה בלי רכישה נוספת.
- מכסה יומית ומקביליות: בחירה ויצירת השיחה באותה transaction מנעו חריגה תחת בקשות מקבילות.
- סכנה של החלפת מספר קבוע: fixed/agent מפסיקים אם המספר המוגדר אינו כשיר; אין fallback שקט למספר אחר.
- כשל סנכרון מלאי פוסל בדיקת חיבור, משמר מספרים והיסטוריה ומציג שגיאה.
- כשל שמירה בדפדפן לא מוצג כהצלחה. תוקנו תוויות הנגישות של בחירת קמפיין ומדיניות שנחשפו בבדיקת הדפדפן.
- לאחר יצירת Prisma Client השרת המקומי הישן החזיק schema קודמת בזיכרון; הוא הופעל מחדש. זהו כשל הכנת סביבת הבדיקה, לא הוכחת כשל אצל ספק.

## ראיות

- [תוצאות שירותים/API](evidence/numbers-results.json), [לוג](evidence/numbers-tests.log).
- [דפדפן](evidence/numbers-ui-results.json), [מסך ניהול](shots/management.png), [כשל שמירה](shots/save-failure.png), [אישור רכישה — UI fixture בלבד](shots/purchase-confirmation-ui-fixture.png).
- [רגרסיית חייגן](evidence/dialer-regression.json), [חיוג ידני](evidence/manual-regression.json).
- [Build](evidence/numbers-build.log), [טיפוסים](evidence/numbers-types.log), [Lint](evidence/numbers-lint.log).

## מגבלות שעדיין מחייבות בדיקה לפני הפעלה

יש לבצע בדיקות הרשאה ומלאי מול חשבון Telnyx ייעודי, לבדוק דרישות אימות מספר לפי המדינה ולקבל אישור נפרד לכל רכישה בתשלום. ספק יכול לשנות מחיר אחרי הבדיקה ולפני קבלת ההזמנה; המחיר נבדק סמוך לשליחה אך אינו נעול אצל הספק. אין טענה שנמדדה זמינות PSTN או שכל יעד מורשה בפרופיל הספק.

רכישה לא ודאית אינה נשלחת מחדש גם כשהבירור לא מצא הזמנה: נדרש טיפול מול הספק. הסנכרון היומי צריך להיות מופעל בסביבת הפריסה העתידית. מגבלות פעילות מחוץ לחייגן אינן נמדדות כאן. אימות בן יותר מ־24 שעות נעצר עד רענון; על תפעול המוקד לנטר כשלים בסנכרון.

ל־Truecaller אין חיבור מורשה בתצורה הנוכחית: אין בדיקות מתוזמנות, אין מדד מומצא ואין scraping. דיווח ידני מסומן ככזה, ופתיחת טיפול אינה שליחת ערעור אוטומטית. אין רוטציה אוטומטית בעקבות סימון ספאם לשם עקיפתו.
