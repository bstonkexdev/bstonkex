// Cupcak8 Swap — WebSocket Diagnostic
// Run in browser console: window.__testBstonkexWS()
// Tests the real PumpPortal WebSocket stream that powers the live token feed.
// No Socket.io needed — PumpPortal IS the event source.

export function testBstonkexSocket(): void {
  console.log('🔍 Testing WebSocket connection for Cupcak8 Swap...');

  // 1. Test PumpPortal WebSocket (real-time token events)
  console.log('\n📡 PumpPortal WebSocket (new token stream):');
  try {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    ws.onopen = () => {
      console.log('✅ PumpPortal WebSocket CONNECTED');
      // Subscribe to new token events
      ws.send(JSON.stringify({ method: 'subscribeNewToken' }));
      console.log('⏳ Listening for NEW_LAUNCHPAD_TOKEN events (30s timeout)...');

      // Also subscribe to trades for a known active token
      ws.send(JSON.stringify({ method: 'subscribeTokenTrade', keys: ['DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'] }));
    };

    let tokenCount = 0;
    let tradeCount = 0;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (Array.isArray(data)) {
          // Trade event
          tradeCount++;
          if (tradeCount <= 3) {
            console.log('📊 Trade event:', {
              type: data[0]?.txType,
              token: data[0]?.symbol || data[0]?.mint?.slice(0, 8),
              sol: data[0]?.solAmount,
              price: data[0]?.vSolInBondingCurve,
            });
          }
        } else if (data.mint) {
          // New token event (NEW_LAUNCHPAD_TOKEN equivalent)
          tokenCount++;
          console.log('⚡ LIVE TOKEN DETECTED (NEW_LAUNCHPAD_TOKEN):', {
            name: data.name,
            symbol: data.symbol,
            mint: data.mint?.slice(0, 8) + '...',
            creator: data.traderPublicKey?.slice(0, 8) + '...',
          });
        }
      } catch { /* non-JSON message */ }
    };

    ws.onerror = (err) => {
      console.error('❌ PumpPortal WebSocket ERROR:', err);
    };

    ws.onclose = (event) => {
      console.warn(`⚠️ PumpPortal WebSocket CLOSED (code: ${event.code}, reason: ${event.reason || 'none'})`);
      console.log(`📊 Session totals: ${tokenCount} new tokens, ${tradeCount} trade events received`);
    };

    // Auto-close after 30 seconds
    setTimeout(() => {
      console.log(`\n📊 30s Diagnostic Results:`);
      console.log(`   New tokens received: ${tokenCount}`);
      console.log(`   Trade events received: ${tradeCount}`);
      if (tokenCount > 0) console.log('   ✅ LIVE TOKEN FEED IS WORKING');
      else console.log('   ⚠️ No new tokens in 30s — may be quiet market, try again');
      ws.close();
    }, 30_000);

  } catch (err) {
    console.error('❌ Failed to create PumpPortal WebSocket:', err);
  }

  // 2. Test live tokens broadcast layer (in-app)
  console.log('\n🏪 In-app Token Broadcast Layer:');
  import('./engine/discovery/live-tokens').then(m => {
    const count = m.getTokenCount();
    console.log(`   Tracked tokens in memory: ${count}`);
    if (count > 0) {
      const latest = m.getCurrentTokens().slice(0, 3);
      latest.forEach((t, i) => {
        console.log(`   [${i + 1}] ${t.symbol} (${t.name}) — ${t.bondingCurveProgress.toFixed(1)}% curve, $${t.spotPrice.toFixed(8)}`);
      });
    }
    console.log('   Subscribe: useLiveTokens() hook or subscribeTokenList()');
  }).catch(() => console.log('   ⚠️ Broadcast layer not initialized yet'));

  // 3. Test GeckoTerminal API (fallback discovery)
  console.log('\n🦎 GeckoTerminal API (new pools fallback):');
  fetch('https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1')
    .then(r => { console.log(`   Status: ${r.status} ${r.ok ? '✅' : '❌'}`); return r.json(); })
    .then(d => {
      const pools = d.data?.length ?? 0;
      console.log(`   New pools found: ${pools}`);
      if (pools > 0) {
        const p = d.data[0];
        console.log(`   Latest: ${p.attributes?.name} — $${p.attributes?.reserve_in_usd}`);
      }
    })
    .catch(e => console.error('   ❌ GeckoTerminal error:', e.message));

  // 4. Test RugCheck API (security audits)
  console.log('\n🛡️ RugCheck API (security audits):');
  fetch('https://api.rugcheck.xyz/v1/tokens/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/report/summary')
    .then(r => { console.log(`   Status: ${r.status} ${r.ok ? '✅' : '❌'}`); return r.json(); })
    .then(d => {
      console.log(`   Score: ${d.score}, LP Locked: ${d.lpLockedPct?.toFixed(1)}%, Mint Auth: ${d.mintAuthority ?? 'none'}`);
    })
    .catch(e => console.error('   ❌ RugCheck error:', e.message));

  console.log('\n🏁 Diagnostic complete — check results above.');
}

// Expose to window for console access
if (typeof window !== 'undefined') {
  (window as any).__testBstonkexWS = testBstonkexSocket;
}
