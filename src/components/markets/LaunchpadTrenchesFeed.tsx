// Cupcak8 Swap — Launchpad Trenches Feed (LIVE)
// Real-time feed of newly launched tokens with bonding curve progress meters.
// Uses the browser-side broadcast layer (PumpPortal WebSocket → React state).
// Replaces Socket.io pattern with useLiveTokens() hook.

import { useState, useCallback } from 'react';
import { useLiveTokens, useOnNewToken, useBondingCurveProgress } from '../../lib/useLiveTokens';
import type { LiveToken } from '../../lib/engine/discovery/live-tokens';
import SecurityBadges from './SecurityBadges';

// ── Bonding Curve Meter ──────────────────────────────────────

function BondingCurveMeter({ mint, initialProgress }: { mint: string; initialProgress: number }) {
  const { progress } = useBondingCurveProgress(mint);
  const pct = progress || initialProgress;

  return (
    <div className="w-36">
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-gray-400">Curve Progress</span>
        <span className={`font-bold ${pct >= 80 ? 'text-yellow-400' : 'text-green-400'}`}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            pct >= 80
              ? 'bg-gradient-to-r from-yellow-500 to-orange-400'
              : 'bg-gradient-to-r from-green-500 to-emerald-300'
          }`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

// ── Token Row ────────────────────────────────────────────────

function TokenRow({ token, isNew }: { token: LiveToken; isNew: boolean }) {
  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg transition-colors border ${
        isNew
          ? 'bg-emerald-950/40 border-emerald-700/60 animate-pulse'
          : 'bg-gray-900 border-gray-800/60 hover:bg-gray-800'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-purple-900 flex items-center justify-center font-bold text-xs">
          {token.symbol?.slice(0, 3)}
        </div>
        <div>
          <div className="font-bold text-sm">
            {token.symbol}{' '}
            <span className="text-xs text-gray-400 font-normal">({token.name})</span>
          </div>
          <div className="text-[10px] text-gray-500 font-mono">
            {token.mint?.slice(0, 6)}...{token.mint?.slice(-4)}
          </div>
          <SecurityBadges chainId="solana" address={token.mint} compact />
        </div>
      </div>

      {/* Bonding Curve Meter */}
      <BondingCurveMeter mint={token.mint} initialProgress={token.bondingCurveProgress} />

      <button
        className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-3 py-1.5 rounded-md transition-all"
        onClick={() => {
          // Navigate to token page for trading
          window.location.hash = `#token/${token.mint}`;
        }}
      >
        Quick Buy
      </button>
    </div>
  );
}

// ── Main Feed Component ──────────────────────────────────────

export default function LaunchpadTrenchesFeed() {
  const { tokens, nearGraduation, count, isLoading } = useLiveTokens({
    sortBy: 'newest',
    limit: 50,
  });
  const [flashMint, setFlashMint] = useState<string | null>(null);

  // Flash highlight on new token arrival
  useOnNewToken(useCallback((token: LiveToken) => {
    setFlashMint(token.mint);
    setTimeout(() => setFlashMint(null), 3000);
  }, []));

  return (
    <div className="w-full bg-[#0d111c] text-white p-4 rounded-xl border border-gray-800 font-mono">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-green-400 flex items-center gap-2">
          <span className="animate-pulse">🟢</span> LAUNCHPAD TRENCHES (LIVE)
        </h2>
        <div className="flex items-center gap-3">
          {nearGraduation.length > 0 && (
            <span className="text-xs bg-yellow-900/40 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-700/40">
              {nearGraduation.length} near graduation
            </span>
          )}
          <span className="text-xs text-gray-400">{count} Active Feeds</span>
        </div>
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span>Streaming via PumpPortal WebSocket</span>
      </div>

      {/* Loading state */}
      {isLoading && tokens.length === 0 && (
        <div className="flex items-center justify-center py-8 text-gray-500">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500 mr-2" />
          Connecting to launchpad stream...
        </div>
      )}

      {/* Empty state */}
      {!isLoading && tokens.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-gray-500">
          <div className="text-3xl mb-2">📡</div>
          <div className="text-sm">Waiting for new token launches...</div>
          <div className="text-xs mt-1 text-gray-600">This feed updates in real-time</div>
        </div>
      )}

      {/* Token list */}
      <div className="space-y-2">
        {tokens.map((token) => (
          <TokenRow
            key={token.mint}
            token={token}
            isNew={flashMint === token.mint}
          />
        ))}
      </div>
    </div>
  );
}
