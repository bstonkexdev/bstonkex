// BSTONKEX Admin Authorization — config-driven admin wallet detection
// No private keys stored. Only authorized wallet ADDRESSES compared at runtime.
// Admin addresses are loaded from env (VITE_ADMIN_WALLETS) or hardcoded defaults.

const ENV_ADMIN_WALLETS = (() => {
  try {
    const raw = (import.meta as any).env?.VITE_ADMIN_WALLETS;
    if (raw && typeof raw === 'string') {
      return raw.split(',').map((a: string) => a.trim().toLowerCase()).filter(Boolean);
    }
  } catch { /* ignore */ }
  return [];
})();

// Primary authorized admin wallet — only addresses, never private keys
const DEFAULT_ADMIN_WALLETS: string[] = [
  '0xb69d35a281bb9dd59b7abb65ee74d79b41a12090',
];

const adminAddresses: Set<string> = new Set([
  ...DEFAULT_ADMIN_WALLETS.map(a => a.toLowerCase()),
  ...ENV_ADMIN_WALLETS,
]);

/** Check if a wallet address is authorized as admin. */
export function isAdminWallet(address: string | null | undefined): boolean {
  if (!address) return false;
  // If no admin wallets are configured, allow any connected wallet in dev
  if (adminAddresses.size === 0) {
    if (import.meta.env.DEV) return true;
    return false;
  }
  return adminAddresses.has(address.toLowerCase());
}

/** Check if admin wallets have been configured. */
export function hasAdminConfig(): boolean {
  return adminAddresses.size > 0;
}

/** Get configured admin wallet count (does NOT expose addresses). */
export function getAdminWalletCount(): number {
  return adminAddresses.size;
}

/** Get authorization status for display. */
export function getAuthStatus(address: string | null | undefined): {
  authorized: boolean;
  reason: string;
} {
  if (!address) {
    return { authorized: false, reason: 'No wallet connected' };
  }
  if (adminAddresses.size === 0 && import.meta.env.DEV) {
    return { authorized: true, reason: 'DEV mode — all wallets authorized (configure VITE_ADMIN_WALLETS for production)' };
  }
  if (adminAddresses.size === 0) {
    return { authorized: false, reason: 'No admin wallets configured. Set VITE_ADMIN_WALLETS in .env' };
  }
  if (!isAdminWallet(address)) {
    return { authorized: false, reason: 'ACCESS DENIED — wallet not authorized for admin access' };
  }
  return { authorized: true, reason: 'Authorized admin wallet' };
}