import admin from 'firebase-admin';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const REFURB_URL = 'https://store.steampowered.com/sale/steamdeckrefurbished/';
const NEW_URL    = 'https://store.steampowered.com/steamdeck/';
const POLL_MS    = 60_000;

const REFURBISHED_MODELS = [
  { name: '64 GB LCD',   subid: '903905' },
  { name: '256 GB LCD',  subid: '903906' },
  { name: '512 GB LCD',  subid: '903907' },
  { name: '512 GB OLED', subid: '1202542' },
  { name: '1 TB OLED',   subid: '1202547' },
];

const NEW_MODELS = [
  { name: '256 GB LCD',  subid: '595604' },
  { name: '512 GB OLED', subid: '946113' },
  { name: '1 TB OLED',   subid: '946114' },
];

// ---------------------------------------------------------------------------
// Firebase init
// ---------------------------------------------------------------------------

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID,
});

const db        = admin.firestore();
const messaging = admin.messaging();

// ---------------------------------------------------------------------------
// HTML stock detection  (mirrors app logic)
// ---------------------------------------------------------------------------

function parseStock(html, models) {
  return models.map(model => {
    const pattern = new RegExp(`data-ds-packageid="${model.subid}"`, 'i');
    const idx = html.search(pattern);
    if (idx === -1) return { ...model, inStock: false };
    const context = html.slice(Math.max(0, idx - 500), idx + 1000);
    const hasAddToCart  = /btn_addtocart|add.?to.?cart|addtocart/i.test(context);
    const hasOutOfStock = /out.?of.?stock|not.?available/i.test(context);
    return { ...model, inStock: hasAddToCart && !hasOutOfStock };
  });
}

// ---------------------------------------------------------------------------
// Firestore token helpers
// ---------------------------------------------------------------------------

async function getTokens() {
  const snap = await db.collection('device_tokens').get();
  return snap.docs.map(doc => ({ id: doc.id, token: doc.data().token })).filter(d => d.token);
}

async function removeTokens(ids) {
  const batch = db.batch();
  for (const id of ids) batch.delete(db.collection('device_tokens').doc(id));
  await batch.commit();
  console.log(`[fcm] removed ${ids.length} invalid token(s) from Firestore`);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

async function sendFCM(modelName, isNew) {
  const docs = await getTokens();
  if (docs.length === 0) {
    console.log('[fcm] no registered tokens, skipping');
    return;
  }

  const tokens = docs.map(d => d.token);
  const label  = isNew ? 'New' : 'Refurbished';

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: '🎮 Steam Deck In Stock!',
      body:  `${label} ${modelName} is now available on Steam.`,
    },
    android: {
      priority: 'high',
      notification: { channelId: 'stock-alerts', sound: 'default' },
    },
    apns: {
      payload: { aps: { sound: 'default' } },
    },
  });

  console.log(`[fcm] sent to ${tokens.length} token(s): ${response.successCount} ok, ${response.failureCount} failed`);

  // Clean up tokens that are no longer valid
  const invalidIds = response.responses
    .map((r, i) => (!r.success ? docs[i].id : null))
    .filter(Boolean);

  if (invalidIds.length > 0) await removeTokens(invalidIds);
}

async function sendWebhook(modelName, isNew) {
  const url = process.env.WEBHOOK_URL;
  if (!url) return;

  const label = isNew ? 'New' : 'Refurbished';
  try {
    await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain' },
      body:    `🎮 Steam Deck In Stock! ${label} ${modelName} is now available.`,
    });
    console.log(`[webhook] notified: ${label} ${modelName}`);
  } catch (err) {
    console.error('[webhook] error:', err.message);
  }
}

async function notify(modelName, isNew) {
  await Promise.all([sendFCM(modelName, isNew), sendWebhook(modelName, isNew)]);
}

// ---------------------------------------------------------------------------
// Poller
// ---------------------------------------------------------------------------

const prevState = new Map(); // subid -> boolean

async function pollUrl(url, models, isNew) {
  let html;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal:  AbortSignal.timeout(15_000),
    });
    html = await res.text();
  } catch (err) {
    console.error(`[poll] fetch error for ${url}:`, err.message);
    return;
  }

  const results = parseStock(html, models);

  for (const { name, subid, inStock } of results) {
    const prev = prevState.get(subid);

    if (prev === undefined) {
      // First run — record state, no notification
      prevState.set(subid, inStock);
      console.log(`[init] ${name}: ${inStock ? 'IN STOCK' : 'out of stock'}`);
      continue;
    }

    if (!prev && inStock) {
      console.log(`[alert] ${name} just came into stock!`);
      await notify(name, isNew);
    }

    prevState.set(subid, inStock);
  }
}

async function poll() {
  const timestamp = new Date().toISOString();
  console.log(`[poll] checking stock at ${timestamp}`);
  await Promise.all([
    pollUrl(REFURB_URL, REFURBISHED_MODELS, false),
    pollUrl(NEW_URL,    NEW_MODELS,         true),
  ]);
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

console.log('[poller] starting — polling every', POLL_MS / 1000, 'seconds');
poll();
setInterval(poll, POLL_MS);
