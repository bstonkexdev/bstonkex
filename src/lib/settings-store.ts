// Cupcak8 Swap — Settings persistence via Gitlawb Data SDK
import { gitlawb } from './gitlawb';

export interface TradingSettings {
  slippage: number;       // percent: 0.1, 0.5, 1, 3
  deadline: number;       // minutes: 5-60
  confirmTrades: boolean; // show confirmation modal
  showPriceImpact: boolean; // show price impact warnings
}

export interface UserSettings {
  trading: TradingSettings;
  updatedAt?: string;
}

export const DEFAULT_SETTINGS: UserSettings = {
  trading: {
    slippage: 0.5,
    deadline: 20,
    confirmTrades: true,
    showPriceImpact: true,
  },
};

const COLLECTION = 'settings';

function getCollection() {
  return gitlawb.db.collection<UserSettings>(COLLECTION);
}

export async function loadSettings(): Promise<UserSettings> {
  try {
    const col = getCollection();
    const { records } = await col.list();
    if (records.length > 0) {
      const data = records[0].data;
      return {
        trading: { ...DEFAULT_SETTINGS.trading, ...data.trading },
        updatedAt: records[0].createdAt,
      };
    }
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: UserSettings): Promise<{ ok: boolean; error?: string }> {
  try {
    const col = getCollection();
    const { records } = await col.list();
    const payload: UserSettings = { ...settings, updatedAt: new Date().toISOString() };
    if (records.length > 0) {
      await col.update(records[0].id, payload);
    } else {
      await col.create(payload);
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to save settings' };
  }
}

export async function resetSettings(): Promise<{ ok: boolean; error?: string }> {
  try {
    const col = getCollection();
    const { records } = await col.list();
    for (const r of records) {
      await col.remove(r.id);
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to reset settings' };
  }
}