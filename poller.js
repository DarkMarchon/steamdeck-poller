// ─────────────────────────────────────────────────────────────
// Steam Deck Alert — Stock Poller (Refurbished + New)
// ─────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync } from "fs";

const ENV_PATH = "./.env";
const STATE_PATH = "./stock-state.json";

function loadEnv() {
  if (!existsSync(ENV_PATH)) {
    console.error("❌  No .env file found. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }
  const lines = readFileSync(ENV_PATH, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
  }
}

loadEnv();

const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_SECONDS || "60", 10) * 1000;
const NOTIFY_METHOD = process.env.NOTIFY_METHOD || "webhook";
const WEBHOOK_URL   = process.env.WEBHOOK_URL || "";

// ── Steam Deck models ─────────────────────────────────────────

const REFURBISHED_MODELS = [
  { name: "64 GB LCD (Refurb)",   subid: "903905",  url: "https://store.steampowered.com/sale/steamdeckrefurbished/" },
  { name: "256 GB LCD (Refurb)",  subid: "903906",  url: "https://store.steampowered.com/sale/steamdeckrefurbished/" },
  { name: "512 GB LCD (Refurb)",  subid: "903907",  url: "https://store.steampowered.com/sale/steamdeckrefurbished/" },
  { name: "512 GB OLED (Refurb)", subid: "1202542", url: "https://store.steampowered.com/sale/steamdeckrefurbished/" },
  { name: "1 TB OLED (Refurb)",   subid: "1202547", url: "https://store.steampowered.com/sale/steamdeckrefurbished/" },
];

const NEW_MODELS = [
  { name: "512 GB OLED (New)",         subid: "946113",  url: "https://store.steampowered.com/steamdeck/" },
  { name: "1 TB OLED (New)",           subid: "946114",  url: "https://store.steampowered.com/steamdeck/" },
  { name: "512 GB OLED no PSU (New)",  subid: "1186054", url: "https://store.steampowered.com/steamdeck/" },
  { name: "1 TB OLED no PSU (New)",    subid: "1186055", url: "https://store.steampowered.com/steamdeck/" },
];

const ALL_MODELS = [...REFURBISHED_MODELS, ...NEW_MODELS];

// ── Persistent state ──────────────────────────────────────────

function loadState() {
  if (!existsSync(STATE_PATH)) return {};
  try { return JSON.parse(readFileSync(STATE_PATH, "utf8")); }
  catch { return {}; }
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// ── Stock detection ───────────────────────────────────────────

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function checkModelInHtml(html, subid) {
  const subidPattern = new RegExp(`data-ds-packageid="${subid}"`, "i");
  const hasSubid = subidPattern.test(html);
  if (!hasSubid) return false;
  const idx = html.search(subidPattern);
  if (idx === -1) return false;
  const context = html.slice(Math.max(0, idx - 500), idx + 1000);
  const hasAddToCart = /btn_addtocart|add.?to.?cart|addtocart/i.test(context);
  const hasOutOfStock = /out.?of.?stock|not.?available/i.test(context);
  return hasAddToCart && !hasOutOfStock;
}

async function checkAllModels() {
  // Fetch both pages once each (not once per model)
  let refurbHtml = "", newHtml = "";
  const errors = [];

  try {
    refurbHtml = await fetchPage("https://store.steampowered.com/sale/steamdeckrefurbished/");
  } catch (err) {
    errors.push(`Refurb page: ${err.message}`);
  }

  try {
    newHtml = await fetchPage("https://store.steampowered.com/steamdeck/");
  } catch (err) {
    errors.push(`New page: ${err.message}`);
  }

  const results = ALL_MODELS.map(model => {
    const html = REFURBISHED_MODELS.includes(model) ? refurbHtml : newHtml;
    const inStock = html ? checkModelInHtml(html, model.subid) : false;
    return { ...model, inStock, error: null };
  });

  return { results, errors };
}

// ── Notifications ─────────────────────────────────────────────

async function notifyWebhook(model) {
  if (!WEBHOOK_URL) return;

  const isNtfy = WEBHOOK_URL.includes("ntfy.sh");
  const message = `${model.name} is now available! Tap to buy.`;

  if (isNtfy) {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Title": "Steam Deck In Stock!",
        "Priority": "urgent",
        "Tags": "steam,gaming,alert",
        "Content-Type": "text/plain",
        "Click": model.url,
      },
      body: message,
    });
    console.log(`  📱  ntfy notification sent for ${model.name}`);
  } else {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `🎮 **Steam Deck ${model.name}** is IN STOCK!\n${model.url}`,
        text: `Steam Deck ${model.name} is IN STOCK! ${model.url}`,
      }),
    });
    console.log(`  📣  Webhook notification sent for ${model.name}`);
  }
}

async function sendNotifications(model) {
  if (NOTIFY_METHOD === "webhook" || NOTIFY_METHOD === "both") {
    await notifyWebhook(model);
  }
}

// ── Main poll loop ────────────────────────────────────────────

async function poll(state) {
  const now = new Date().toLocaleTimeString();
  process.stdout.write(`[${now}] Checking stock... `);

  const { results, errors } = await checkAllModels();

  if (errors.length) {
    console.log(`\n  ⚠️  ${errors.join(", ")}`);
  }

  const inStock = results.filter(r => r.inStock);
  if (inStock.length === 0) {
    console.log("nothing available.");
  } else {
    console.log(`\n  🎮  IN STOCK: ${inStock.map(r => r.name).join(", ")}`);
  }

  for (const result of results) {
    const wasInStock = state[result.subid] === true;
    const nowInStock = result.inStock;

    if (nowInStock && !wasInStock) {
      console.log(`\n  🚨  NEW STOCK: ${result.name} — sending notifications!`);
      await sendNotifications(result);
    }

    if (!nowInStock && wasInStock) {
      console.log(`  ℹ️  ${result.name} is now out of stock again.`);
    }

    state[result.subid] = nowInStock;
  }

  saveState(state);
  return state;
}

async function main() {
  console.log("─────────────────────────────────────────");
  console.log("  Steam Deck Alert — Stock Poller");
  console.log(`  Watching ${ALL_MODELS.length} models (refurb + new)`);
  console.log(`  Polling every ${POLL_INTERVAL / 1000}s`);
  console.log(`  Notifications: ${NOTIFY_METHOD}`);
  if (WEBHOOK_URL) console.log(`  Webhook: ${WEBHOOK_URL}`);
  console.log("─────────────────────────────────────────\n");

  let state = loadState();
  state = await poll(state);

  setInterval(async () => {
    state = await poll(state);
  }, POLL_INTERVAL);
}

main();
