import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const MODELS = [
  { name: '64 GB LCD',   subid: '903905' },
  { name: '256 GB LCD',  subid: '903906' },
  { name: '512 GB LCD',  subid: '903907' },
  { name: '512 GB OLED', subid: '1202542' },
  { name: '1 TB OLED',   subid: '1202547' },
];

const STORE_URL = 'https://store.steampowered.com/sale/steamdeckrefurbished/';

type ModelStatus = {
  name: string;
  subid: string;
  inStock: boolean | null;
};

export default function HomeScreen() {
  const [statuses, setStatuses] = useState<ModelStatus[]>(
    MODELS.map(m => ({ ...m, inStock: null }))
  );
  const [lastChecked, setLastChecked] = useState<string>('Never');
  const [loading, setLoading] = useState(false);

  async function checkStock() {
    setLoading(true);
    try {
      const res = await fetch(STORE_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const html = await res.text();

      const updated = MODELS.map(model => {
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

      setStatuses(updated);
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
      <Text style={styles.subtitle}>Refurbished Stock Monitor</Text>

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
        <TouchableOpacity style={styles.buyButton} onPress={() => Linking.openURL(STORE_URL)}>
          <Text style={styles.buyButtonText}>🛒 Buy on Steam</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1923',
  },
  content: {
    padding: 24,
    paddingTop: 60,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#8899aa',
    marginBottom: 24,
  },
  statusBanner: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  bannerGreen: {
    backgroundColor: '#1a4731',
  },
  bannerRed: {
    backgroundColor: '#3a1a1a',
  },
  bannerText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  card: {
    width: '100%',
    backgroundColor: '#1a2733',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a3743',
  },
  modelName: {
    fontSize: 16,
    color: '#ffffff',
  },
  inStock: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4caf50',
  },
  outOfStock: {
    fontSize: 14,
    color: '#666',
  },
  lastChecked: {
    fontSize: 12,
    color: '#8899aa',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#1a9fff',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buyButton: {
    backgroundColor: '#4caf50',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  buyButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
