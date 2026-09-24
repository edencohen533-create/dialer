# ניהול מספרים יוצאים — מימוש, מגבלות ו־QA

נוסף מסך `/numbers` למנהלים, עם קישור מההגדרות ומהתפריט. מודול זה נבנה מעל תיקוני QA ב־PR #1; אין מיזוג או פריסה במסגרת העבודה. המיגרציה החדשה הוחלה **רק** על PostgreSQL מקומי מבודד. אין רכישות אמיתיות ואין שיחות חיצוניות בבדיקות.

## בדיקת תיעוד רשמי והחלטות חיבור

| ספק | מה התיעוד מאשר | מה מומש כאן / מה חסום |
|---|---|---|
| Truecaller | דוחות ספאם קיימים בלוח Analytics העסקי; API לזיהוי משתמשים אינו הוכחה להרשאת מוניטין | לא נמצאה הוכחת הרשאה לחשבון שלנו או חוזה API מתאים. חיבור מוניטין אוטומטי מסומן **אינו נתמך בתצורה הנוכחית**. אין scraping ואין endpoint מומצא. יש מעבר לפורטל, תיעוד בדיקה ידנית ותהליך טיפול/ערעור מתועד |
| Telnyx | חיפוש, מחירי מספרים, הזמנות עם customer_reference, בירור הזמנות, מלאי מספרים, שיוך לאפליקציה ובדיקת פרופיל יוצא | מומש adapter רשמי, עם בדיקת חיבור, סנכרון, הצעת מחיר, רכישה ובירור. קוד ו־transport מדומה נבדקו; חשבון אמיתי ורכישה אמיתית לא נבדקו |
| Zadarma | API לחיפוש לפי מדינה/יעד, הזמנת מספר, מסמכים וניתוב SIP | התיעוד נבדק; adapter לחייגן זה **לא מומש**. אין הצגה מטעה כאילו הספק אינו תומך ב־API. ממשק NumberProvider מאפשר הרחבה; אינטגרציה לשיחות Zadarma תדרוש גם adapter טלפוניה |

מקורות שנקראו לפני המימוש:

- [Truecaller Analytics: דוחות ומדדים, כולל Spam Report](https://docs.truecaller.com/truecaller-for-business/features/analytics/what-insights-are-available-on-the-analytics-dashboard).
- [Truecaller Developers: אימות מספר/זהות](https://developer.truecaller.com/).
- [Truecaller: אימות עסק אינו מסיר סימון ספאם](https://support.truecaller.com/support/solutions/articles/81000404435-can-truecaller-verified-caller-id-help-in-removing-spam-from-my-number-).
- [Zadarma: מחזור חיי מספר ומסמכים](https://zadarma.com/en/support/instructions/api/numbers/) ו־[API רשמי](https://zadarma.com/en/support/api/).
- [Telnyx: חיפוש](https://developers.telnyx.com/api-reference/phone-number-search/list-available-phone-numbers), [מדריך חיפוש](https://developers.telnyx.com/docs/numbers/phone-numbers/number-search), [רכישה](https://developers.telnyx.com/api-reference/phone-number-orders/create-a-number-order), [בירור הזמנות לפי אסמכתה](https://developers.telnyx.com/api-reference/phone-number-orders/list-number-orders).
- [Telnyx: מספר בבעלות החשבון](https://developers.telnyx.com/api-reference/phone-number-configurations/retrieve-a-phone-number), [אפליקציית Call Control](https://developers.telnyx.com/api-reference/call-control-applications/retrieve-a-call-control-application), [פרופיל חיוג יוצא](https://developers.telnyx.com/api-reference/outbound-voice-profiles/retrieve-an-outbound-voice-profile).

לא היה זמין חיבור חשבון Truecaller מורשה או מפתח Telnyx חי עם מספרי QA. לפיכך **אין יכולת חדשה שסומנה כאן כנבדקה מול ספק אמיתי**. בדיקת API מסחרי בהסכם פרטי של Truecaller מחייבת תיעוד והרשאה של אותו חשבון; אין להסיק מהתיעוד הציבורי שאין לספק שירות כזה לכל לקוחותיו.

## הגדרת שרת ופריסה עתידית

הקוד משתמש בחשבון Telnyx של מתאם השיחות הקיים. כדי לא לחשוף את מלאי החשבון לארגון אחר, יש שיוך מפורש לעסק אחד:

```text
TELNYX_API_KEY=<server secret>
TELNYX_CALL_CONTROL_APP_ID=<existing voice application>
TELNYX_NUMBERS_BUSINESS_ID=<authorized business id>
NUMBER_PURCHASES_ENABLED=false
CRON_SECRET=<server secret>
```

המפתחות נשמרים במשתני סביבה בשרת בלבד, ואינם מוחזרים ב־API או למסך. אין להזין אותם ב־Git או בצ׳אט. שמירת משתנים אינה מסמנת חיבור מאומת: פעולת בדיקה בודקת אפליקציה פעילה, פרופיל חיוג מופעל והרשאה למלאי. שינוי מפתח/אפליקציה מבטל את תוקף הבדיקה הקודמת באמצעות fingerprint שרתי.

לפני פריסה עתידית יש להחיל את `20260924030000_number_management` ולהריץ סנכרון מהחשבון הנכון. **מספרים קיימים מקבלים unverified במיגרציה. חיוג אמיתי מהם ייחסם עד אימות**, גם אם מנהל הפעיל אותם ידנית. מצב הדמיה נשאר זמין ללא אימות ספק ומסומן בממשק. בקשת Telnyx שלא הוגדרה אינה נופלת בשקט לחיוג מדומה במסלול יצירת השיחה.

אין להפעיל `NUMBER_PURCHASES_ENABLED=true` במסגרת QA זה. אפילו אם משתנה זה מופעל, `QA_LOCAL=1` חוסם רכישה אמיתית דרך שירות הרכישה. לא נבדקה פריסה מרובת חשבונות ספק; ההפרדה במימוש הנוכחי מכוונת לחשבון הקיים ולעסק מורשה יחיד. עסקים אחרים מקבלים מצב לא מוגדר, ולא את המספרים שלו.

## התנהגות המודול

- פעילות תפעולית, השהיית יוצאות, אימות בעלות ומוניטין הם שדות נפרדים. השהיית יוצאות משאירה שיחות חוזרות פעילות. אין מחיקה או ביטול אוטומטי אצל הספק.
- מוצגים ספק, שיוכי נציג וקמפיינים, זמן אימות/מוניטין, עלות כשנמסרה, ניסיונות ומענה ב־7/30/90 ימים. אלה ניסיונות שיחה ולא ספירת לידים ייחודיים. מידע ישן מוצג ככזה.
- מצבי מוניטין: clear / spam / unknown / failed / unsupported. אין חישוב ציון. בדיקה ידנית מסומנת `manual_truecaller`, עם הערה, זמן ומדווח; היא אינה תשובת API. לחצן בדיקת API מחזיר unsupported ולא משנה את זמן הבדיקה האחרונה כאילו בוצעה בדיקה חיה.
- דיווח ספאם יוצר התראה למנהל ומצב טיפול. המנהל יכול להשהות את המספר, לפתוח פנייה דרך תמיכת Truecaller ולתעד אסמכתה. שמירת תיעוד אינה שולחת ערעור אוטומטי ואינה מסירה סימון אצל Truecaller.
- מתאם ספקים נפרד ב־`src/lib/numbers/providers.ts`; בחירת ספק שרירותית/כתובת URL מהלקוח אינה מותרת. Telnyx משתמש בכתובת API קבועה עם timeout, טיפול ב־429, בלי retry אוטומטי של פעולות בתשלום.

### רכישה

חיפוש מציג מחירים במטבע הספק; ערך חסר אינו אפס. פרטי אימות שלא חזרו בחיפוש מוצגים כלא סופקו, ויש להשלים אותם בפורטל לפי דרישת הספק. יצירת quote מבצעת חיפוש נוסף בשרת, ושומרת הצעה לחמש דקות. המחירים מוצגים בחלונית נפרדת עם checkbox אישור מפורש; רק תפקיד admin מורשה לרכוש.

לאחר אישור המחיר נבדק שוב; שינוי דורש הצעה ואישור חדשים. נעילה במסד ושורה ייחודית לעסק/ספק/מספר מונעות POST רכישה כפול גם במקביל ובאתחול תהליך. `customer_reference` משמש לאיתור הזמנה; אין הנחה שהוא מנגנון idempotency של הספק.

תשובה לא ברורה משאירה unknown/submitting. הפעולה הבאה היא **GET לבירור מצב**, ולא POST חוזר. גם אם לא נמצאה הזמנה, היעדר מידע אינו מוכיח שלא בוצע חיוב. יש להמשיך בירור אצל הספק; המערכת אינה משחררת אוטומטית את אותה הזמנה לרכישה נוספת.

הצלחה ברכישה אינה הצלחה בהפעלה: יש לאתר מספר במלאי, לשייך אותו לאפליקציה, לקרוא שוב מצב active ושיוך נכון, ולוודא חיבור/פרופיל יוצא. רק אז ההזמנה ready והמספר מאומת במאגר. כשל הגדרה משאיר configuring, ובירור חוזר משלים הגדרה בלי חיוב נוסף. סנכרון מלאי לעולם אינו מוחק היסטוריה או מבטל מספר.

### רוטציה ושיחות חוזרות

לכל קמפיין: מספר קבוע, מספר קבוע לנציג, Round Robin או חלוקה לפי עומס. הבחירה מתבצעת תחת נעילת מאגר עסק באותה transaction של יצירת השיחה. מגבלות יומיות נמדדות לפי אזור הזמן העסקי; שיחות פעילות נכללות במגבלת מקביליות. נבדק גם הגבול המינימלי שנמסר מאפליקציית Telnyx ומפרופיל החיוג. המערכת אינה מודדת שימוש שנעשה בחשבון הספק מחוץ לחייגן; אכיפת הספק עצמה עדיין חיונית.

מספר מושעה/לא פעיל/לא מאומת/ישן/מוגבל לא נבחר. במצב fixed או agent אין מעבר שקט למספר אחר כשהמספר הקבוע אינו כשיר. במצב רוטציה נשמר ככל האפשר המספר הקודם לאותו יעד. כל שיחה שומרת `phoneNumberId`, `fromE164`, `numberSelectionReason`.

אין רוטציה אוטומטית כדי לעקוף סימון ספאם: אם המספר ששימש ליד מסומן כספאם וטרם טופל, החיוג לליד נעצר לבדיקה במקום החלפת Caller ID. DNC והגבלות הקשר נאכפים ברמת העסק. אין Caller ID חופשי במצב חי; מספרים צריכים להיות במלאי החשבון המשויך ובאפליקציה המאומתת.

בשיחה חוזרת ניתנת עדיפות לנציג שהוגדר למספר, אחריו לנציג השיחה היוצאת האחרונה, לבעל הליד ואז לנציג פנוי. נציגים לא זמינים אינם נבחרים; התנהגות missed/callback הקיימת נשמרת כשאין נציג. זה אינו תור PSTN חדש או IVR.

### תזמון והרשאות

נוסף cron מאומת ב־CRON_SECRET ב־`/api/jobs/numbers` לסנכרון יומי ב־03:00 UTC. אימות מספר/חיבור ישן מ־24 שעות חוסם חיוג אמיתי עד סנכרון. כשל מלאי פוסל את בדיקת החיבור ולא מסומן הצלחה. **בדיקות מוניטין מתוזמנות אינן מופעלות** כי אין API Truecaller מורשה מחובר; ה־job מחזיר במפורש reputation unsupported.

מנהל מוקד יכול לנהל השהיה, שיוכים, מדיניות ותיעוד; מנהל מערכת בלבד בודק חשבון, מחפש ורוכש. נציג נדחה בשרת. מזהים של עסק אחר נדחים. יש הגבלה משותפת במסד של 20 פעולות ניהול מספרים לדקה לעסק, מעבר לטיפול ב־429 אצל הספק, ואודיט של פעולות ניהול ואישור מחיר.

## QA ושחזור

השתמש רק במעטפת ובמסד המקומיים המתוארים ב־[הוראות QA](../qa-20260924/README.md). אחרי המיגרציה ויצירת Prisma Client יש להפעיל מחדש את שרת ה־QA כדי שלא יישאר client ישן בזיכרון.

```sh
node scripts/qa-local.cjs npm run db:deploy
node scripts/qa-local.cjs node node_modules/prisma/build/index.js generate
node scripts/qa-local.cjs npm run dev -- --hostname 127.0.0.1 --port 3107
# In a second terminal:
node scripts/qa-local.cjs node node_modules/tsx/dist/cli.mjs scripts/qa-numbers.ts
node scripts/qa-local.cjs node node_modules/tsx/dist/cli.mjs scripts/qa-numbers-ui.ts
node scripts/qa-local.cjs node node_modules/tsx/dist/cli.mjs scripts/qa-regression.ts
node scripts/qa-local.cjs npm run build -- --webpack
npm run typecheck
npm run lint
```

התוצאות המפורטות, הסיווג והצילומים מופיעים ב־[QA.md](QA.md). תיקיית evidence מכילה רק נתוני בדיקה; מפתחות, cookies וחשבונות אמת לא נכללו.
