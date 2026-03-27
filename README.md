# Steam Deck Alert — Poller

Polls the Steam API every 60 seconds and sends you an instant notification
the moment a refurbished Steam Deck comes back in stock.

## Quickstart (5 minutes, no accounts needed)

### 1. Install dependencies
```bash
npm install
```

### 2. Set up instant push notifications via ntfy.sh
ntfy.sh is a free, no-account push notification service.

- On your phone: install the **ntfy** app (iOS or Android)
- Subscribe to a topic name that's unique to you, e.g. `steamdeck-alert-john42`

### 3. Configure
```bash
cp .env.example .env
```
Edit `.env` and set:
```
WEBHOOK_URL=https://ntfy.sh/steamdeck-alert-john42
```
(use the same topic name you subscribed to in the ntfy app)

### 4. Run
```bash
node poller.js
```

You'll see output like:
```
─────────────────────────────────────────
  Steam Deck Refurbished — Stock Poller
  Polling every 60s
  Notifications: webhook
  Webhook: https://ntfy.sh/steamdeck-alert-john42
─────────────────────────────────────────

[10:32:01] Checking stock... nothing available.
[10:33:01] Checking stock... nothing available.
```

When stock appears:
```
[10:34:01] Checking stock...
  🎮  IN STOCK: 512 GB OLED
  🚨  NEW STOCK DETECTED: 512 GB OLED — sending notifications!
  📱  ntfy.sh notification sent for 512 GB OLED
```

Your phone will buzz instantly.

## Keep it running

To run this 24/7 on a server, deploy to **Railway** (free tier):
1. Push this folder to a GitHub repo
2. Go to railway.app → New Project → Deploy from GitHub
3. Add your `.env` variables in the Railway dashboard
4. Done — it runs forever

## Adding Firebase (for the mobile app)

Once you've built the React Native app (Phase 3), uncomment the Firebase
block in `poller.js` and:
1. Create a Firebase project at console.firebase.google.com
2. Download `serviceAccountKey.json` from Project Settings → Service Accounts
3. Set `FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json` in `.env`
4. Set `NOTIFY_METHOD=both` to use webhook + Firebase together

## Files

| File | Purpose |
|---|---|
| `poller.js` | Main script |
| `.env` | Your config (never commit this) |
| `.env.example` | Config template |
| `stock-state.json` | Auto-created — tracks last known stock state |
