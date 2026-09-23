# Dialer – חייגן ותותח שיחות למוקדי מכירות

Next.js 16 · Prisma 7 · PostgreSQL (Neon) · Telnyx (Call Control + WebRTC) · עברית / RTL.

## הרצה מקומית

```bash
npm install
cp .env.example .env          # מלא DATABASE_URL, DATABASE_URL_UNPOOLED, JWT_SECRET
npx prisma migrate deploy      # יוצר את הסכמה (schema=dialer בכתובת ה-DB)
npm run db:seed                # עסק דמו + משתמשים + רשימה
npm run dev                    # http://localhost:3000
```

משתמשי דמו: `admin@demo.local / admin123`, `manager@demo.local / manager123`, `agent1@demo.local / agent123`, `agent2@demo.local / agent123`.

ללא הגדרות Telnyx המערכת רצה ב**מצב הדמיה** (מסומן בבירור בכל מסך). בהדמיה: מספר שמסתיים ב-`0` → אין מענה, `1` → תפוס, `2` → נדחה, אחרת → נענה.

## חיבור Telnyx (שיחות אמיתיות)

| משתנה | מקור |
|---|---|
| `TELEPHONY_PROVIDER=telnyx` | |
| `TELNYX_API_KEY` | Mission Control → API Keys |
| `TELNYX_PUBLIC_KEY` | Account Settings → Keys & Credentials → Public Key (base64) – לאימות Ed25519 של Webhooks |
| `TELNYX_CALL_CONTROL_APP_ID` | Voice → Call Control Application. Webhook URL: `https://<domain>/api/webhooks/telnyx` |
| `TELNYX_CREDENTIAL_CONNECTION_ID` | Voice → SIP Connections → Credential Connection (לרישום דפדפני הנציגים) |

שני החיבורים צריכים Outbound Voice Profile. מספרי העסק משויכים ל-Call Control App ומוזנים במסך הגדרות → מספרים יוצאים (E.164).

**זרימת שיחה:** השרת מחייג קודם ל-leg של הנציג (`sip:<credential>@sip.telnyx.com`, `command_id` ייחודי), הדפדפן עונה אוטומטית, ואז השרת מחייג ללקוח עם `link_to` + `bridge_on_answer`. "נענה" נקבע רק מאירועי `call.answered`/`call.bridged` חתומים. אירועים כפולים / בסדר שגוי מטופלים (מזהה אירוע ייחודי, מכונת מצבים שמתקדמת קדימה בלבד, hangup תמיד סוגר).

## מבנה

- `src/lib/telephony/` – ממשק ספק, מתאם Telnyx (REST + אימות חתימה + פענוח Webhook), מתאם הדמיה, מעבד אירועים (`events.ts`).
- `src/lib/dialer/` – תור לידים (נעילה אטומית `FOR UPDATE SKIP LOCKED`, DNC, חלונות חיוג, מדיניות ניסיונות), שיחות (idempotency, reconcile, תוצאות), סשנים (בעלות לשונית, heartbeat).
- `src/app/api/` – REST. `src/components/telephony/DialerProvider.tsx` – חיבור WebRTC, polling, לולאת תותח שיחות, פס שיחה קבוע.
- `prisma/schema.prisma` – כל הטבלאות מבודדות לפי `businessId`.

## פקודות

`npm run typecheck` · `npm run lint` · `npm run build` · `npm run db:migrate` · `npm run db:seed` · `npx tsx scripts/dev-reset.ts` (איפוס נתוני בדיקה).
