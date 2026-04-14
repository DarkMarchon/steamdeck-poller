import admin from 'firebase-admin';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const POLL_MS = 60_000;

const STOCK_API = 'https://api.steampowered.com/IPhysicalGoodsService/CheckInventoryAvailableByPackage/v1';

const ALL_MODELS = [
  { name: '64 GB LCD',   subid: '903905',  proto: 'CICBBhAB',  isNew: false },
  { name: '256 GB LCD',  subid: '903906',  proto: 'CKgBBhAB',  isNew: false },
  { name: '512 GB LCD',  subid: '903907',  proto: 'COgBBhAB',  isNew: false },
  { name: '512 GB OLED', subid: '1202542', proto: 'CJCZBxAB',  isNew: false },
  { name: '1 TB OLED',   subid: '1202547', proto: 'CLCZBxAB',  isNew: false },
  { name: '256 GB LCD',  subid: '595604',  proto: 'COjkIhAB',  isNew: true  },
  { name: '512 GB OLED', subid: '946113',  proto: 'CKjkIhAB',  isNew: true  },
  { name: '1 TB OLED',   subid: '946114',  proto: 'CLjkIhAB',  isNew: true  },
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
// API stock detection
// ---------------------------------------------------------------------------

async function checkStock(model) {
  const url = `${STOCK_API}?origin=https://store.steampowered.com&input_protobuf_encoded=${model.proto}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    return { ...model, inStock: text.trim().length > 0 };
  } catch (err) {
    console.error(`[poll] fetch error for ${model.name} (${model.subid}):`, err.message);
    return null;
  }
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

async function poll() {
  const timestamp = new Date().toISOString();
  console.log(`[poll] checking stock at ${timestamp}`);

  const results = await Promise.all(ALL_MODELS.map(checkStock));

  for (const result of results) {
    if (result === null) continue; // fetch failed, skip

    const { name, subid, isNew, inStock } = result;
    const prev = prevState.get(subid);

    if (prev === undefined) {
      // First run — record state, no notification
      prevState.set(subid, inStock);
      console.log(`[init] ${name} (${isNew ? 'new' : 'refurb'}): ${inStock ? 'IN STOCK' : 'out of stock'}`);
      continue;
    }

    if (!prev && inStock) {
      console.log(`[alert] ${name} just came into stock!`);
      await notify(name, isNew);
    }

    prevState.set(subid, inStock);
  }
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

console.log('[poller] starting — polling every', POLL_MS / 1000, 'seconds');

if (process.env.TEST_NOTIFICATION === 'true') {
  console.log('[test] sending test notification...');
  await notify('256 GB LCD (test)', true);
}

poll();
setInterval(poll, POLL_MS);
