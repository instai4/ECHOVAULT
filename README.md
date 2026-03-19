# ECHOVAULT 🔐
### *Your Personal Memory Vault — Capture Everything*

> A cartoon-styled, full-featured personal memory vault web app. Save your trips, wins, certificates, journal entries, photos and videos — all in one beautiful place. Accessible from any device via the same account.

**Live Demo:** [https://echovault-tau.vercel.app](https://echovault-tau.vercel.app)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [How It Works](#how-it-works)
- [Firebase Setup](#firebase-setup)
- [Google Sheets Logger Setup](#google-sheets-logger-setup)
- [Deployment](#deployment)
- [Cross-Device Behaviour](#cross-device-behaviour)
- [Storage Architecture](#storage-architecture)
- [Known Limitations](#known-limitations)
- [Credits](#credits)

---

## Overview

EchoVault is a single-file HTML web app that lets users create personal memory vaults. Each "echo" is a memory entry — a trip, achievement, certificate, journal entry, event, project, or photo — with optional media attachments, tags, mood, and location.

User accounts and memory metadata sync across devices via **Firebase Firestore**. Photos and videos are stored **locally on the device** using **IndexedDB** for instant, zero-latency access with no upload buffering.

---

## Features

### Core
- **User authentication** — Signup and login with username + password (hashed)
- **Cross-device sync** — Same account works on phone, laptop, tablet
- **8 memory types** — Trip, Achievement, Certificate, Journal, Event, Project, Photo, Other
- **8 moods** — Happy, Excited, Proud, Nostalgic, Adventurous, Grateful, Neutral, Sad
- **Tags, location, date range** — Full metadata per memory
- **Search & filter** — Instant search across all memories by type or keyword

### Media
- **Photos & videos** — Up to 8 files per memory
- **Fullscreen lightbox** — Click any photo to view fullscreen
- **Swipe navigation** — Swipe left/right on mobile to browse photos
- **Keyboard navigation** — Arrow keys to navigate, Escape to close
- **Thumbnail strip** — Quick jump between photos in a memory
- **Instant local storage** — No upload wait — media saves to IndexedDB instantly

### UI/UX
- **Cartoon / comic book theme** — Bold outlines, offset shadows, playful typography
- **Dark & light mode** — Smooth toggle, persisted across sessions
- **Responsive** — Works on mobile, tablet, and desktop
- **Confirmation dialogs** — Delete echo and sign out require confirmation
- **Animated stats** — Total echoes, most active year, top city, top tag
- **Floating decorative icons** — Animated hero section

### Analytics
- **Google Sheets logger** — Every signup and login logged automatically with timestamp, username, action, device, and browser

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML, CSS, JavaScript (single file) |
| Fonts | Boogaloo, Nunito, Space Mono (Google Fonts) |
| Icons | Font Awesome 6.5 |
| Auth & Metadata DB | Firebase Firestore v10 |
| Local Media Storage | IndexedDB (browser built-in) |
| User Tracking | Google Apps Script + Google Sheets |
| Hosting | Vercel |

---

## How It Works

### Authentication Flow

```
Signup
  → validate inputs locally
  → save user {hash, created} to localStorage + Firestore background sync
  → enter app instantly (zero cloud wait)

Login — same device
  → find user in localStorage (instant)
  → verify password hash
  → load memories from localStorage
  → background sync checks Firestore for updates

Login — new device
  → not in localStorage → fetch accounts from Firestore
  → verify password hash
  → fetch memories from Firestore
  → cache in localStorage for next time
```

### Memory Save Flow

```
Fill in memory form → pick photos/videos
  → FileReader converts files to base64
  → base64 saved to IndexedDB (instant, ~50ms, no internet needed)
  → memory object {id, title, date, tags, media:[{idbKey,type,name}]}
     saved to localStorage
  → Firestore syncs metadata in background (no await, non-blocking)
  → Card appears immediately ✅
```

### Media Display Flow

```
render() builds card HTML with data-idb="ev_media_123_0"
  → loadLazyMedia() reads IndexedDB asynchronously
  → fills src attributes after DOM is ready
  → instant display, no network ✅
```

---

## Firebase Setup

### Step 1 — Create Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project — name it `echovault`
3. Disable Google Analytics (optional)

### Step 2 — Enable Firestore

1. Go to **Firestore Database → Create Database**
2. Start in **test mode**
3. Choose any region → Done

### Step 3 — Set Firestore Rules

Go to **Firestore → Rules** and set:

```
rules_version = '2';
service cloud.firestore.default_database {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### Step 4 — Get your config

1. Go to **Project Settings → Your Apps → Web (`</>`)**
2. Register app as `echovault`
3. Copy the `firebaseConfig` object

### Step 5 — Paste into the code

Find this block in `index.html` and replace with your config:

```html
<script type="module">
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
  import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

  const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
  };
  // ... rest of the script
</script>
```

---

## Google Sheets Logger Setup

Every signup and login is automatically logged to a Google Sheet.

### Step 1 — Create Google Sheet

Go to [sheets.google.com](https://sheets.google.com) → New sheet → Add headers in Row 1:

| A | B | C | D | E |
|---|---|---|---|---|
| Timestamp | Username | Action | Device | Browser |

### Step 2 — Create Apps Script

1. In your sheet → **Extensions → Apps Script**
2. Delete all existing code and paste:

```javascript
function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = JSON.parse(e.postData.contents);
  sheet.appendRow([
    new Date().toLocaleString(),
    data.username,
    data.action,
    data.device,
    data.browser
  ]);
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. **Deploy → New Deployment → Web App**
4. Execute as: **Me** | Who has access: **Anyone**
5. Copy the deployment URL

### Step 3 — Add URL to code

Find this line in `index.html`:

```javascript
const SHEET_URL = 'YOUR_URL_HERE';
```

Replace with your deployment URL.

---

## Deployment



---

## Cross-Device Behaviour

| Data | Device A | Device B (same account) |
|------|----------|------------------------|
| Account (username/password) | ✅ Created | ✅ Can login |
| Memory titles, dates, tags | ✅ Saved | ✅ Synced via Firestore |
| Photos & Videos | ✅ Stored locally | ❌ Not available (local only) |
| Delete a memory | ✅ Deleted | ✅ Synced — gone on next login |

> **Note:** Photos and videos are stored in IndexedDB which is device-specific. They will not appear on a second device. Only text metadata (title, date, type, tags, description, location, mood) syncs via Firestore.

---

## Storage Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     ECHOVAULT STORAGE                   │
├──────────────────────┬──────────────────────────────────┤
│    localStorage      │         Firestore                │
│  (this device only)  │    (cloud, all devices)          │
├──────────────────────┼──────────────────────────────────┤
│  • Session token     │  • User accounts                 │
│  • Cached users      │  • Memory metadata               │
│  • Cached memories   │    (title, date, tags, mood,     │
│  • Theme preference  │     location, description)       │
├──────────────────────┴──────────────────────────────────┤
│                    IndexedDB                            │
│              (this device only, large files)            │
├─────────────────────────────────────────────────────────┤
│  • Photos (base64)                                      │
│  • Videos (base64)                                      │
│  • Key format: ev_media_{memoryId}_{index}              │
└─────────────────────────────────────────────────────────┘
```

---

## Known Limitations

| Limitation | Detail |
|-----------|--------|
| Photos don't sync across devices | IndexedDB is device-local. Cloud photo sync would require Firebase Storage + CORS configuration |
| Username-based auth | No email, no password reset. If you forget your password, the account cannot be recovered |
| No encryption | Passwords are stored as simple hash (not bcrypt). Not suitable for sensitive data |
| 8 media files per memory | Hard limit to keep IndexedDB manageable |
| Single HTML file | No code splitting — entire app loads at once |
| Firestore rules are open | `allow read, write: if true` — anyone with your project ID can read/write. Acceptable for personal use |

---

## Credits

**Built by [Anurag](https://instai4.github.io/PORT-FOLIO/)**

- Instagram: [@inst.ai.4](https://www.instagram.com/inst.ai.4)
- LinkedIn: [Anurag Singh](https://www.linkedin.com/in/anurag-singh-43230a380/)
- GitHub: [instai4](https://github.com/instai4)
- Facebook: [Profile](https://www.facebook.com/share/1DMBwCvzDL/)

---

## License

This project is for personal use. Feel free to fork and modify for your own memory vault.

---

*© 2026 ECHOVAULT — All echoes reserved.*
