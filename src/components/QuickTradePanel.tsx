// Cupcak8 Swap — Quick Trade Panel (Swap Box — Redesigned)
// Buy/Sell tabs · Market/Limit/DCA order types · Modern dark styling
import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useApp } from '../lib/context';
import { CHAINS, formatUsd, explorerTxUrl } from '../lib/config';
import type { ChainId } from '../lib/config';
import type { MarketToken } from '../lib/market-discovery';
import { getQuote, executeTrade, submitSignedTx, isQuoteValid, getQuoteRemainingSeconds, type TradeQuote, type TradeSide, type QuoteParams } from '../lib/trading';
import { checkTradeReadiness } from '../lib/engine/security-engine';
import { isDegenOn, isDegenActiveFor, acquireTradeLock, releaseTradeLock, onWalletDisconnect, onChainChange } from '../lib/engine/degen-mode';
import DegenModeToggle from './degen/DegenModeToggle';
import ChainIcon from './ChainIcon';

const D = {
  text: 'var(--text)', textSec: 'var(--text)', textMuted: 'var(--text-dim)',
  border: 'var(--border)', borderLight: 'var(--border-bright)',
  bg: 'var(--bg-deep)', bgAlt: 'var(--bg-elevated)', bgPanel: 'var(--bg-surface)',
  gold: 'var(--yellow)', goldBg: 'var(--yellow-bg)',
  green: 'var(--green)', greenBg: 'var(--green-bg)',
  red: 'var(--red)', redBg: 'var(--red-bg)',
  mono: "var(--font-mono)",
  font: "var(--font)",
} as const;

const SLIPPAGE_OPTS = [0.1, 0.5, 1.0];
const HIGH_IMPACT_PCT = 5;

type OrderType = 'market' | 'limit' | 'dca';

interface Props {
  token: MarketToken | null;
  allMarkets: MarketToken[];
  onSelectMarket: (t: MarketToken) => void;
}

export default memo(function QuickTradePanel({ token, allMarkets, onSelectMarket }: Props) {
  const { wallet, activeChain, connect, addNotification } = useApp();
  const [side, setSide] = useState<TradeSide>('buy');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(0.5);
  const [customSlippage, setCustomSlippage] = useState('');
  const [isCustomSlippage, setIsCustomSlippage] = useState(false);
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'confirmed' | 'failed' | 'approving'>('idle');
  const [txHash, setTxHash] = useState('');
  const [txError, setTxError] = useState('');
  const [tradeId, setTradeId] = useState<string | null>(null);
  const [quoteRemaining, setQuoteRemaining] = useState(0);
  const [tokenSearchOpen, setTokenSearchOpen] = useState(false);
  const [tokenSearchQuery, setTokenSearchQuery] = useState('');
  const [degenMode, setDegenMode] = useState(false);

  const effectiveSlippage = isCustomSlippage ? (parseFloat(customSlippage) || 0.5) : slippage;
  const amountNum = parseFloat(amount) || 0;

  const readiness = useMemo(() => {
    if (!wallet.connected) return { ready: false, reason: 'WALLET_NOT_CONNECTED' };
    if (amountNum <= 0) return { ready: false, reason: 'NO_AMOUNT' };
    if (!token) return { ready: false, reason: 'NO_TOKEN' };
    return { ready: true, reason: null };
  }, [wallet.connected, amountNum, token]);

  useEffect(() => {
    if (!quote) return;
    const iv = setInterval(() => {
      setQuoteRemaining(getQuoteRemainingSeconds(quote.quoteId));
    }, 500);
    return () => clearInterval(iv);
  }, [quote]);

  useEffect(() => {
    if (!token || amountNum <= 0 || !wallet.connected) { setQuote(null); return; }
    const timer = setTimeout(async () => {
      setQuoting(true);
      try {
        const params: QuoteParams = {
          chainId: token.chainId as ChainId,
          side,
          tokenAddress: token.pairAddress || token.address,
          tokenSymbol: token.symbol,
          amountUsd: amountNum,
          slippagePct: effectiveSlippage,
          walletAddress: wallet.address,
        };
        const q = await getQuote(params);
        setQuote(q);
      } catch {
        setQuote(null);
      }
      setQuoting(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [token, amountNum, side, effectiveSlippage, wallet.connected, wallet.address]);

  const handleTrade = useCallback(async () => {
    if (!token || !wallet.address || !quote) return;
    if (!acquireTradeLock()) return;
    try {
      const isDegen = degenMode && isDegenActiveFor(wallet.address, token.chainId as ChainId);
      if (quoteRemaining <= 0) {
        setTxStatus('failed');
        setTxError('QUOTE EXPIRED — Please request a new quote');
        return;
      }
      setExecuting(true);
      setTxStatus(isDegen ? 'pending' : 'approving');
      setTxError('');
      try {
        const params: QuoteParams = {
          chainId: token.chainId as ChainId,
          side,
          tokenAddress: token.pairAddress || token.address,
          tokenSymbol: token.symbol,
          amountUsd: amountNum,
          slippagePct: effectiveSlippage,
          walletAddress: wallet.address,
        };
        const result = await executeTrade(params, quote, wallet.address);
        if (result.success && result.tradeId) {
          setTradeId(result.tradeId);
          if (!isDegen) setTxStatus('pending');
          setTxHash(result.txHash || '');
          addNotification({
            type: 'pending', title: `${side.toUpperCase()} ${token.symbol}`,
            message: `Trade submitted — ${formatUsd(amountNum)}`, priority: 'info',
          });
          if (result.txHash) {
            setTxStatus('confirmed');
            setTxHash(result.txHash);
          }
        } else {
          setTxStatus('failed');
          setTxError(result.error || 'Trade failed');
        }
      } catch (e: any) {
        setTxStatus('failed');
        setTxError(e.message || 'Execution failed');
      }
      setExecuting(false);
    } finally {
      releaseTradeLock();
    }
  }, [token, wallet.address, quote, side, amountNum, effectiveSlippage, degenMode, quoteRemaining, addNotification]);

  const balanceNum = wallet.balance ? parseFloat(wallet.balance) : 0;
  const handlePct = useCallback((pct: number) => {
    if (balanceNum <= 0) return;
    const val = (balanceNum * pct) / 100;
    setAmount(val.toFixed(4));
  }, [balanceNum]);

  const filteredMarkets = tokenSearchQuery
    ? allMarkets.filter(t =>
        t.symbol.toLowerCase().includes(tokenSearchQuery.toLowerCase()) ||
        t.name.toLowerCase().includes(tokenSearchQuery.toLowerCase())
      ).slice(0, 15)
    : allMarkets.slice(0, 15);

  const isDegenActive = degenMode && isDegenActiveFor(wallet.address, token?.chainId as ChainId || activeChain);
  const getButtonState = () => {
    if (!wallet.connected) return { label: 'CONNECT WALLET', action: () => connect('evm'), color: D.green, disabled: false };
    if (txStatus === 'pending' || txStatus === 'approving') return { label: `${txStatus === 'approving' ? 'APPROVING...' : 'PENDING...'}`, action: () => {}, color: D.gold, disabled: true };
    if (txStatus === 'confirmed') return { label: 'TRADE CONFIRMED ✓', action: () => { setTxStatus('idle'); setAmount(''); setQuote(null); }, color: D.green, disabled: false };
    if (txStatus === 'failed') return { label: 'RETRY TRADE', action: () => { setTxStatus('idle'); setTxError(''); }, color: D.red, disabled: false };
    if (amountNum <= 0) return { label: `ENTER AMOUNT`, action: () => {}, color: side === 'buy' ? D.green : D.red, disabled: true };
    if (quoting) return { label: 'FETCHING QUOTE...', action: () => {}, color: D.gold, disabled: true };
    if (!quote?.available) return { label: quote?.error ? 'QUOTE UNAVAILABLE' : 'NO QUOTE', action: () => {}, color: D.textMuted, disabled: true };
    if (quoteRemaining <= 0) return { label: 'QUOTE EXPIRED — RETRY', action: () => setQuote(null), color: D.gold, disabled: false };
    const prefix = isDegenActive ? '[DEGEN] ' : '';
    return { label: `${prefix}${side.toUpperCase()} ${token?.symbol ?? 'TOKEN'}`, action: handleTrade, color: side === 'buy' ? D.green : D.red, disabled: executing };
  };
  const btn = getButtonState();

  return (
    <div style={{
      borderLeft: `1px solid ${D.border}`,
      display: 'flex', flexDirection: 'column', overflow: 'auto',
      padding: 14, gap: 0,
    }} className="exp-quicktrade">

      {/* ── TOKEN SELECTOR ──────────────────────────────────── */}
      <div style={{
        background: D.bgPanel, border: `1px solid ${D.border}`,
        borderRadius: 8, padding: '10px 12px', marginBottom: 12,
      }}>
        <div style={{
          fontSize: 10, color: D.textMuted, marginBottom: 6,
          letterSpacing: '0.06em', fontWeight: 600, textTransform: 'uppercase',
        }}>Select Token</div>
        <div style={{ position: 'relative' }}>
          <div onClick={() => setTokenSearchOpen(!tokenSearchOpen)} style={{
            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
          }}>
            {token && <ChainIcon chainId={token.chainId as ChainId} size={18} />}
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-bright)', flex: 1 }}>
              {token?.symbol ?? 'Select token'}
            </span>
            <span style={{ fontSize: 12, color: D.textMuted, fontFamily: D.mono }}>
              {token ? formatUsd(token.price) : ''}
            </span>
            <span style={{ fontSize: 10, color: D.textMuted }}>▼</span>
          </div>
          {tokenSearchOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: -12, right: -12, marginTop: 6,
              background: D.bg, border: `1px solid ${D.border}`,
              borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              zIndex: 100, maxHeight: 280, overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}>
              <input autoFocus value={tokenSearchQuery} onChange={e => setTokenSearchQuery(e.target.value)}
                placeholder="Search..." style={{
                  padding: '10px 12px', fontSize: 13, border: 'none',
                  borderBottom: `1px solid ${D.border}`, outline: 'none',
                  background: D.bgPanel, color: 'var(--text)',
                }} />
              <div style={{ overflow: 'auto', maxHeight: 240 }}>
                {filteredMarkets.map((t, i) => (
                  <div key={`${t.chainId}-${t.address}-${i}`}
                    onClick={() => { onSelectMarket(t); setTokenSearchOpen(false); setTokenSearchQuery(''); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', cursor: 'pointer',
                      borderBottom: `1px solid ${D.border}`,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = D.bgAlt)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <ChainIcon chainId={t.chainId as ChainId} size={14} />
                    <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-bright)' }}>{t.symbol}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontFamily: D.mono, fontSize: 11, color: D.textSec }}>{formatUsd(t.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── BUY / SELL TABS ─────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 12 }}>
        <button onClick={() => { setSide('buy'); setQuote(null); }} style={{
          flex: 1, padding: '10px', fontSize: 14, fontWeight: 800,
          background: side === 'buy' ? D.green : D.bgAlt,
          color: side === 'buy' ? '#000' : D.textMuted,
          border: `1px solid ${side === 'buy' ? D.green : D.border}`,
          borderRadius: '8px 0 0 8px', cursor: 'pointer',
          transition: 'all 0.15s', letterSpacing: '0.04em',
        }}>
          BUY
        </button>
        <button onClick={() => { setSide('sell'); setQuote(null); }} style={{
          flex: 1, padding: '10px', fontSize: 14, fontWeight: 800,
          background: side === 'sell' ? D.red : D.bgAlt,
          color: side === 'sell' ? '#fff' : D.textMuted,
          border: `1px solid ${side === 'sell' ? D.red : D.border}`,
          borderLeft: 'none', borderRadius: '0 8px 8px 0', cursor: 'pointer',
          transition: 'all 0.15s', letterSpacing: '0.04em',
        }}>
          SELL
        </button>
      </div>

      {/* ── ORDER TYPE TABS (Market / Limit / DCA) ──────────── */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 14,
        background: D.bg, borderRadius: 8, padding: 3,
        border: `1px solid ${D.border}`,
      }}>
        {(['market', 'limit', 'dca'] as const).map(ot => (
          <button key={ot} onClick={() => setOrderType(ot)} style={{
            flex: 1, padding: '7px', fontSize: 11, fontWeight: 700,
            background: orderType === ot ? D.bgAlt : 'transparent',
            color: orderType === ot ? 'var(--text-bright)' : D.textMuted,
            border: 'none', borderRadius: 6, cursor: 'pointer',
            transition: 'all 0.15s',
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            {ot}
          </button>
        ))}
      </div>

      {/* ── AMOUNT INPUT ────────────────────────────────────── */}
      <div style={{
        background: D.bgPanel, border: `1px solid ${D.border}`,
        borderRadius: 8, padding: 12, marginBottom: 10,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: D.textMuted, fontWeight: 600, letterSpacing: '0.04em' }}>
            AMOUNT (USD)
          </span>
          <span style={{ fontSize: 10, color: D.textMuted }}>
            Balance: {wallet.connected ? (wallet.balance ? `${parseFloat(wallet.balance).toFixed(4)} ${CHAINS[activeChain]?.nativeSymbol ?? ''}` : 'N/A') : '—'}
          </span>
        </div>
        <input type="number" placeholder="0.00" value={amount}
          onChange={e => setAmount(e.target.value)}
          style={{
            width: '100%', background: D.bg, border: `1px solid ${D.border}`,
            borderRadius: 6, padding: '10px 12px', fontSize: 18, fontWeight: 700,
            color: 'var(--text-bright)', outline: 'none', fontFamily: D.mono,
          }} />
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          {[25, 50, 75, 100].map(pct => (
            <button key={pct} onClick={() => handlePct(pct)} style={{
              flex: 1, padding: '6px', fontSize: 11, fontWeight: 700,
              background: D.bgAlt, border: `1px solid ${D.border}`,
              borderRadius: 6, color: D.textMuted, cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              {pct}%
            </button>
          ))}
        </div>
      </div>

      {/* ── DEGEN MODE TOGGLE ───────────────────────────────── */}
      <DegenModeToggle enabled={degenMode} onToggle={setDegenMode} />

      {/* ── SLIPPAGE ────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', background: D.bgPanel,
        border: `1px solid ${D.border}`, borderRadius: 8, marginBottom: 10,
      }}>
        <span style={{ fontSize: 10, color: D.textMuted, fontWeight: 600, letterSpacing: '0.04em' }}>SLIPPAGE</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {SLIPPAGE_OPTS.map(s => (
            <button key={s} onClick={() => { setSlippage(s); setIsCustomSlippage(false); setQuote(null); }} style={{
              padding: '4px 10px', fontSize: 10, fontWeight: 700,
              background: !isCustomSlippage && slippage === s ? D.greenBg : D.bgAlt,
              border: `1px solid ${!isCustomSlippage && slippage === s ? D.green : D.border}`,
              borderRadius: 4, cursor: 'pointer',
              color: !isCustomSlippage && slippage === s ? D.green : D.textMuted,
              transition: 'all 0.15s',
            }}>
              {s}%
            </button>
          ))}
          <input type="number" placeholder="Custom" value={customSlippage}
            onFocus={() => setIsCustomSlippage(true)}
            onChange={e => { setCustomSlippage(e.target.value); setIsCustomSlippage(true); setQuote(null); }}
            style={{
              width: 56, padding: '4px 8px', fontSize: 10, fontWeight: 700,
              background: isCustomSlippage ? D.greenBg : D.bgAlt,
              border: `1px solid ${isCustomSlippage ? D.green : D.border}`,
              borderRadius: 4, color: isCustomSlippage ? D.green : D.textMuted,
              outline: 'none', textAlign: 'center',
            }} />
        </div>
      </div>

      {/* ── TRADE QUOTE ─────────────────────────────────────── */}
      <div style={{
        background: D.bgPanel, border: `1px solid ${D.border}`,
        borderRadius: 8, padding: 12, marginBottom: 10,
      }}>
        {quote && quote.priceImpact >= HIGH_IMPACT_PCT && (
          <div style={{
            padding: '8px 10px', marginBottom: 8, borderRadius: 6,
            background: D.redBg, border: `1px solid var(--red-dim)`,
            fontSize: 11, fontWeight: 700, color: D.red,
          }}>
            ⚠ HIGH PRICE IMPACT: {quote.priceImpact.toFixed(2)}%
          </div>
        )}
        {[
          ['You Pay', quote ? `$${amountNum.toFixed(2)}` : amountNum > 0 ? `$${amountNum.toFixed(2)}` : '—'],
          ['You Receive', quote?.available ? quote.outputToken : '—'],
          ['Price', token ? formatUsd(token.price) : '—'],
          ['Price Impact', quote ? `${quote.priceImpact.toFixed(2)}%` : '—'],
          ['Slippage', `${effectiveSlippage}%`],
          ['Network Fee', quote ? `$${quote.networkFeeUsd.toFixed(4)}` : '—'],
          ['Cupcak8 Swap Fee', '0.40%'],
          ['DEX Fee', quote ? `$${quote.dexFeeUsd.toFixed(4)}` : '—'],
          ['Min Received', quote?.available ? quote.minReceived : '—'],
        ].map(([label, value]) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '3px 0', fontSize: 12,
          }}>
            <span style={{ color: D.textMuted }}>{label}</span>
            <span style={{
              color: label === 'Price Impact' && quote && quote.priceImpact >= HIGH_IMPACT_PCT
                ? D.red : 'var(--text-bright)',
              fontFamily: D.mono, fontWeight: label === 'You Receive' ? 700 : 500,
            }}>
              {value}
            </span>
          </div>
        ))}
        {quote && quoteRemaining > 0 && (
          <div style={{ fontSize: 10, color: D.textMuted, textAlign: 'right', marginTop: 6 }}>
            Quote expires in {quoteRemaining}s
          </div>
        )}
      </div>

      {/* ── TX STATUS ───────────────────────────────────────── */}
      {txStatus !== 'idle' && (
        <div style={{
          padding: '10px 12px', marginBottom: 10, borderRadius: 8,
          background: txStatus === 'confirmed' ? D.greenBg : txStatus === 'failed' ? D.redBg : D.goldBg,
          border: `1px solid ${txStatus === 'confirmed' ? D.green : txStatus === 'failed' ? D.red : D.gold}`,
          fontSize: 12,
        }}>
          <div style={{ fontWeight: 700, color: txStatus === 'confirmed' ? D.green : txStatus === 'failed' ? D.red : D.gold }}>
            {txStatus === 'approving' && '⏳ AWAITING WALLET APPROVAL...'}
            {txStatus === 'pending' && '⏳ TRANSACTION SUBMITTED — PENDING...'}
            {txStatus === 'confirmed' && '✓ TRADE CONFIRMED'}
            {txStatus === 'failed' && `✕ TRADE FAILED: ${txError}`}
          </div>
          {txHash && (
            <a href={explorerTxUrl(token?.chainId as ChainId || 'bsc', txHash)} target="_blank" rel="noopener"
              style={{ fontSize: 11, color: D.gold, textDecoration: 'none', marginTop: 6, display: 'inline-block' }}>
              View Transaction ↗
            </a>
          )}
          {txStatus === 'failed' && (
            <button onClick={() => { setTxStatus('idle'); setTxError(''); }} style={{
              marginTop: 6, background: 'none', border: 'none', color: D.gold,
              fontSize: 10, fontWeight: 600, cursor: 'pointer', padding: 0,
            }}>
              TRY AGAIN
            </button>
          )}
        </div>
      )}

      {/* ── NETWORK WARNING ─────────────────────────────────── */}
      {wallet.connected && token && wallet.chainId !== token.chainId && (
        <div style={{
          padding: '8px 12px', marginBottom: 10, borderRadius: 8,
          background: D.redBg, border: `1px solid var(--red-dim)`,
          fontSize: 11, fontWeight: 600, color: D.red, textAlign: 'center',
        }}>
          ⚠ WRONG NETWORK — Switch to {CHAINS[token.chainId as ChainId]?.shortName}
        </div>
      )}

      {/* ── PRIMARY ACTION BUTTON ───────────────────────────── */}
      <button onClick={btn.action} disabled={btn.disabled} style={{
        width: '100%', padding: '14px', border: 'none', borderRadius: 8,
        fontSize: 15, fontWeight: 800, cursor: btn.disabled ? 'not-allowed' : 'pointer',
        background: btn.color,
        color: btn.color === D.green || btn.color === D.gold ? '#000' : '#FFF',
        opacity: btn.disabled ? 0.7 : 1, transition: 'all 0.15s',
        letterSpacing: '0.04em', textTransform: 'uppercase',
        boxShadow: btn.color === D.green ? '0 4px 16px var(--lime-bg)' : 'none',
      }}>
        {btn.label}
      </button>

      {/* ── WALLET INFO ─────────────────────────────────────── */}
      {wallet.connected && wallet.address && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 7, marginTop: 10, fontSize: 11, color: D.textMuted,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: D.green,
            boxShadow: '0 0 6px var(--green)',
          }} />
          {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
          {wallet.chainId && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <ChainIcon chainId={wallet.chainId} size={12} />
              {CHAINS[wallet.chainId]?.shortName}
            </span>
          )}
        </div>
      )}

      {/* ── MASCOT PROMO BADGE ──────────────────────────────── */}
      <div style={{
        marginTop: 14, padding: '12px', textAlign: 'center',
        background: 'linear-gradient(135deg, var(--lime-bg) 0%, var(--cyan-bg) 100%)',
        border: `1px solid var(--lime-bg)`,
        borderRadius: 6,
      }}>
        <img
          src="/assets/1791694030484-o3s4vm.png"
          alt="Cupcak8 Swap Mascot"
          style={{ width: 48, height: 48, margin: '0 auto 6px', display: 'block', borderRadius: 8 }}
        />
        <div style={{
          fontFamily: 'var(--font-pixel)',
          fontSize: 8, color: 'var(--lime)',
          letterSpacing: '0.1em',
        }}>
          Cupcak8 Swap
        </div>
        <div style={{ fontSize: 10, color: D.textMuted, marginTop: 3 }}>
          Trade smarter, not harder
        </div>
      </div>
    </div>
  );
});