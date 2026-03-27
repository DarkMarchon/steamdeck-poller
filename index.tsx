import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const REFURBISHED_MODELS = [
  { name: '64 GB LCD',   subid: '903905' },
  { name: '256 GB LCD',  subid: '903906' },
  { name: '512 GB LCD',  subid: '903907' },
  { name: '512 GB OLED', subid: '1202542' },
  { name: '1 TB OLED',   subid: '1202547' },
];

const NEW_MODELS = [
  { name: '512 GB OLED',          subid: '946113' },
  { name: '1 TB OLED',            subid: '946114' },
  { name: '512 GB OLED (no PSU)', subid: '1186054' },
  { name: '1 TB OLED (no PSU)',   subid: '1186055' },
];

const REFURB_URL = 'https://store.steampowered.com/sale/steamdeckrefurbished/';
const NEW_URL    = 'https://store.steampowered.com/steamdeck/';

type ModelStatus = {
  name: string;
  subid: string;
  inStock: boolean | null;
};

function parseStockFromHtml(html: string, models: typeof REFURBISHED_MODELS): ModelStatus[] {
  return models.map(model => {
    const subidPattern = new RegExp(`data-ds-packageid="${model.subid}"`, 'i');
    const hasSubid = subidPattern.test(html);
    let inStock = false;
    if (hasSubid) {
      const idx = html.search(subidPattern);
      if (idx !== -1) {
        const context = html.slice(Math.max(0, idx - 500), idx + 1000);
        const hasAddToCart = /btn_addtocart|add.?to.?cart|addtocart/i.test(context);
        const hasOutOfStock = /out.?of.?stock|not.?available/i.test(context);
        inStock = hasAddToCart && !hasOutOfStock;
      }
    }
    return { ...model, inStock };
  });
}

function StockList({ models, url, label }: { models: typeof REFURBISHED_MODELS, url: string, label: string }) {
  const [statuses, setStatuses] = useState<ModelStatus[]>(
    models.map(m => ({ ...m, inStock: null }))
  );
  const [lastChecked, setLastChecked] = useState<string>('Never');
  const [loading, setLoading] = useState(false);

  async function checkStock() {
    setLoading(true);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const html = await res.text();
      setStatuses(parseStockFromHtml(html, models));
      setLastChecked(new Date().toLocaleTimeString());
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  useEffect(() => {
    checkStock();
    const interval = setInterval(checkStock, 60000);
    return () => clearInterval(interval);
  }, []);

  const anyInStock = statuses.some(s => s.inStock);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🎮 Steam Deck Alert</Text>
      <Text style={styles.subtitle}>{label}</Text>

      <View style={[styles.statusBanner, anyInStock ? styles.bannerGreen : styles.bannerRed]}>
        <Text style={styles.bannerText}>
          {loading ? 'Checking...' : anyInStock ? '✅ Stock Available!' : '❌ Nothing in stock'}
        </Text>
      </View>

      <View style={styles.card}>
        {statuses.map(model => (
          <View key={model.subid} style={styles.row}>
            <Text style={styles.modelName}>{model.name}</Text>
            {model.inStock === null ? (
              <ActivityIndicator size="small" color="#1a9fff" />
            ) : (
              <Text style={model.inStock ? styles.inStock : styles.outOfStock}>
                {model.inStock ? 'In Stock' : 'Out of Stock'}
              </Text>
            )}
          </View>
        ))}
      </View>

      <Text style={styles.lastChecked}>Last checked: {lastChecked}</Text>

      <TouchableOpacity style={styles.button} onPress={checkStock} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Checking...' : 'Check Now'}</Text>
      </TouchableOpacity>

      {anyInStock && (
        <TouchableOpacity style={styles.buyButton} onPress={() => Linking.openURL(url)}>
          <Text style={styles.buyButtonText}>🛒 Buy on Steam</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

export default function HomeScreen() {
  const [tab, setTab] = useState<'refurb' | 'new'>('refurb');

  return (
    <View style={{ flex: 1, backgroundColor: '#0f1923' }}>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'refurb' && styles.tabActive]}
          onPress={() => setTab('refurb')}
        >
          <Text style={[styles.tabText, tab === 'refurb' && styles.tabTextActive]}>Refurbished</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'new' && styles.tabActive]}
          onPress={() => setTab('new')}
        >
          <Text style={[styles.tabText, tab === 'new' && styles.tabTextActive]}>New</Text>
        </TouchableOpacity>
      </View>

      {tab === 'refurb' ? (
        <StockList models={REFURBISHED_MODELS} url={REFURB_URL} label="Refurbished Stock Monitor" />
      ) : (
        <StockList models={NEW_MODELS} url={NEW_URL} label="New Stock Monitor" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  content: { padding: 24, paddingTop: 24, alignItems: 'center' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1a2733',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#1a9fff' },
  tabText: { color: '#8899aa', fontSize: 15, fontWeight: '600' },
  tabTextActive: { color: '#ffffff' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#ffffff', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#8899aa', marginBottom: 20 },
  statusBanner: { width: '100%', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 20 },
  bannerGreen: { backgroundColor: '#1a4731' },
  bannerRed: { backgroundColor: '#3a1a1a' },
  bannerText: { fontSize: 18, fontWeight: 'bold', color: '#ffffff' },
  card: { width: '100%', backgroundColor: '#1a2733', borderRadius: 12, padding: 16, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2a3743' },
  modelName: { fontSize: 15, color: '#ffffff' },
  inStock: { fontSize: 14, fontWeight: 'bold', color: '#4caf50' },
  outOfStock: { fontSize: 14, color: '#666' },
  lastChecked: { fontSize: 12, color: '#8899aa', marginBottom: 20 },
  button: { backgroundColor: '#1a9fff', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 10, width: '100%', alignItems: 'center', marginBottom: 12 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  buyButton: { backgroundColor: '#4caf50', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 10, width: '100%', alignItems: 'center' },
  buyButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
});
