# Expense Kiosk

Firebase-backed receipt kiosk for RFID employee login, webcam receipt capture, Gemini OCR, and manager approval.

## What It Does

- Raspberry Pi kiosk opens the `/` page full screen.
- Employee scans an RFID card with a USB reader.
- The app exchanges the card id for a Firebase custom auth token.
- Employee takes a receipt photo with the webcam.
- The server sends the image to Gemini and shows extracted receipt fields.
- Employee can retake the image or send it for manager approval.
- Manager logs in at `/login`, reviews receipt details and image, then approves or rejects.
- Employee logs in at `/login` to see status and planned payment date.
- Approved expenses get a planned payment date equal to the end of the approval month.

## Firebase Setup

Create a Firebase project with these products enabled:

- Authentication with Email/Password enabled
- Firestore
- Storage

Copy `.env.example` to `.env.local` and fill in the Firebase web config, Firebase Admin service account values, and `GEMINI_API_KEY`.

Deploy rules and indexes:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

## Firestore Data Model

Create one document per user:

`users/{uid}`

```json
{
  "displayName": "Jane Employee",
  "email": "jane@example.com",
  "role": "employee",
  "managerId": "managerFirebaseUid"
}
```

Manager profile:

```json
{
  "displayName": "Morgan Manager",
  "email": "manager@example.com",
  "role": "manager"
}
```

Map RFID cards to Firebase users:

`rfidCards/{rfidCardId}`

```json
{
  "uid": "employeeFirebaseUid",
  "disabled": false
}
```

Expenses are created by the kiosk in `expenses/{expenseId}`.

## Raspberry Pi Kiosk

Most USB RFID readers behave like keyboards. Put the cursor in the RFID field and scan the card.

Run locally on the Pi:

```bash
npm install
npm run build
npm start
```

Open Chromium in kiosk mode:

```bash
chromium-browser --kiosk http://localhost:3000
```

For production, deploy the Next.js app to a Node-capable host and point `expenses.candenizkocak.com` at it. This app uses server routes, so static Firebase Hosting alone is not enough unless you also deploy the Next server through Cloud Run, App Hosting, or another Node host.

## Gemini Model

The model is configurable with `GEMINI_MODEL`. It defaults to:

```env
GEMINI_MODEL=gemini-3-flash-preview
```

If Google changes preview model availability, update the environment variable without changing app code.
