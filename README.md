# Legal Diary Pro

An offline case diary for one advocate, built as an Android app. React + TypeScript + Vite, packaged
with Capacitor. App id: `com.legaldiary.pro`.

All data stays on the phone. There is no server, no login and no internet needed.

## What the app has

- Dashboard, Cause List, Cases, Diary, Clients and Analytics, all reached from the side menu.
- Cause List: daily, weekly, monthly, selected-date and upcoming views. Add a case, update the next
  date, add proceedings, court order or notes, and mark priority, straight from the list.
- Hearing history: every hearing is its own record with an audit trail. History is append-only
  (nothing is overwritten or deleted). Each case has a Timeline.
- Case details: Information, Timeline, Documents and Notes.
- Reminders: a local notification at 5:00 PM India time the day before a hearing (time can be
  changed). High priority cases are listed first. A case or a whole date can be muted.
- Documents: attach PDF, photos and other files to a case, with categories, preview, download,
  share and delete (with confirmation). On the phone they are real files in the app's private folder.
- Backup and Restore: versioned JSON or ZIP (with documents), a check before restoring, merge or
  replace, a safety backup before any restore, and a check after.
- Search across cases, and analytics made only from real data.
- PDF and Print: one case's full history, a daily cause list and a monthly cause list. The PDF has no
  advocate name. Letters outside the Latin alphabet (for example Hindi) cannot be drawn in the PDF and
  are shown as "?", with a warning on screen.

## Not in this version

Login or PIN, Settings screen, Income Tracker, Legal Calculator, Judgment Search, Legal Search,
Legal Notices, Advocate Profile card and the AI section suggestion were removed.

## Where data is kept

- Android: SQLite (case data and metadata) and real files for documents.
- Browser (testing only): IndexedDB.
- All dates are plain `YYYY-MM-DD` text, and "today" is always India time (Asia/Kolkata).
- A date that was never recorded is shown as "Not recorded". It is never invented.
- Permissions asked: notifications, exact alarms (for on-time reminders) and start-after-restart (to
  keep reminders). No storage permission is used.

## Work on the code (Windows, Command Prompt)

    npm install
    npm run dev        (opens the app in the browser at http://localhost:5173)
    npm run lint       (type checks)
    npx vitest run     (automatic tests)
    npm run build      (makes the dist folder)

## Build the Android app

The APK is built on GitHub, not on the PC. The workflow is `.github/workflows/build-apk.yml`. It runs
when you push to the `pro-test` branch (or start it by hand on the Actions page) and:

1. installs packages, runs lint and the tests, builds the web app,
2. runs `npx cap sync android`,
3. builds the TEST app (`com.legaldiary.pro.test`, debug key) and uploads it as the artifact
   `LegalDiaryPro-TEST-APK`,
4. builds the real app (`com.legaldiary.pro`, signed) and uploads it as the artifact
   `LegalDiaryPro-LIVE-APK-DO-NOT-INSTALL-YET`. This is the real-app APK, the name is old.

The version code is the GitHub run number. The version name is 3.0.

Signing uses two GitHub secrets: `LD_KEYSTORE_BASE64` and `LD_KEYSTORE_PASSWORD`. The key file itself is
never put in the repository. Keep a copy of the key and its password in safe places. Without them a
new version cannot be installed over the old one.

## Install on a phone

New features are installed on the TEST app first. Only after they work there, the same build of the real
app is installed over the old one with:

    adb install -r real.apk

Never uninstall the real app to update it: uninstalling erases its data. Always make a backup first
(Backup and Restore inside the app, then copy the file to the PC).

## Folders

- `src/core` - the rules and data code (dates, cases, hearing history, repository, backup, reminders,
  documents). It has no screen code and is covered by automatic tests.
- `src/ui` - the screens and the phone-specific parts (SQLite driver, files, notifications).
- `android` - the Capacitor Android project (flavors `trial` and `live`).
- `tools` - small helper scripts used while building the project.
- `branding` and `public` - logo and icon sources.

The `main` branch still holds the first version of the app and its own build. This README describes the
`pro-test` branch.
<!-- end of README.md -->
