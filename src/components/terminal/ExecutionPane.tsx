// Cupcak8 Swap — Execution Panel
// Buy/Sell with real quote engine, Cupcak8 strawberry pink / coral red theme
import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../lib/context';
import { CHAINS, formatUsd } from '../../lib/config';
import type { MarketToken } from '../../lib/market-discovery';
import { getQuote, executeTrade, submitSignedTx, isQuoteValid, getQuoteRemainingSeconds } from '../../lib/trading';
import type { TradeQuote, TradeSide } from '../../lib/trading';
import { checkTradeReadiness } from '../../lib/engine/security-engine';

interface Props {
  token: MarketToken | null;
}

type Mode = 'market' | 'limit' | 'dca';

export default function ExecutionPane({ token }: Props) {
  const { wallet, activeChain, connect, setConfirmState, addNotification, setWalletModal } = useApp();
  const [mode, setMode] = useState<Mode>('market');
  const [side, setSide] = useState<TradeSide>('buy');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(0.5);
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'confirmed' | 'failed'>('idle');
  const [txHash, setTxHash] = useState('');
  const [txError, setTxError] = useState('');
  const [quoteRemaining, setQuoteRemaining] = useState(0);

  const chain = CHAINS[activeChain];
  const amountNum = parseFloat(amount) || 0;

  // Quote timer
  useEffect(() => {
    if (!quote || !isQuoteValid(quote.quoteId)) { setQuoteRemaining(0); return; }
    const iv = setInterval(() => {
      const rem = getQuoteRemainingSeconds(quote.quoteId);
      setQuoteRemaining(rem);
      if (rem <= 0) setQuote(null);
    }, 1000);
    return () => clearInterval(iv);
  }, [quote]);

  // Get quote when amount changes
  const fetchQuote = useCallback(async () => {
    if (!token || amountNum <= 0 || !wallet.connected || !wallet.address) { setQuote(null); return; }
    setQuoting(true);
    try {
      const q = await getQuote({
        chainId: activeChain, side, tokenAddress: token.address,
        tokenSymbol: token.symbol, amountUsd: amountNum,
        slippagePct: slippage, walletAddress: wallet.address,
      });
      setQuote(q);
    } catch { setQuote(null); }
    setQuoting(false);
  }, [token, amountNum, side, slippage, activeChain, wallet]);

  useEffect(() => {
    const timer = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timer);
  }, [fetchQuote]);

  const handleTrade = async () => {
    if (!token || !quote || !wallet.connected || !wallet.address || executing) return;
    setExecuting(true);
    setTxStatus('idle');
    setTxError('');

    try {
      const result = await executeTrade(
        {
          chainId: activeChain, side, tokenAddress: token.address,
          tokenSymbol: token.symbol, amountUsd: amountNum,
          slippagePct: slippage, walletAddress: wallet.address,
        },
        quote,
        wallet.address,
      );

      if (result.success && result.txHash) {
        setTxStatus('pending');
        setTxHash(result.txHash);
        addNotification({
          type: 'pending', title: `${side.toUpperCase()} SUBMITTED`,
          message: `${token.symbol} ${formatUsd(amountNum)}`,
          txHash: result.txHash, chainId: activeChain,
        });

        const confirmed = await submitSignedTx(result.tradeId ?? '', result.txHash);
        if (confirmed.success) {
          setTxStatus('confirmed');
          addNotification({
            type: 'confirmed', title: `${side.toUpperCase()} CONFIRMED`,
            message: `${token.symbol} ${formatUsd(amountNum)}`,
            txHash: result.txHash, chainId: activeChain,
          });
        } else {
          setTxStatus('failed');
          setTxError(confirmed.error || 'Transaction failed');
        }
      } else {
        setTxStatus('failed');
        setTxError(result.error || 'Trade failed');
        addNotification({
          type: 'failed', title: `${side.toUpperCase()} FAILED`,
          message: result.error || 'Trade execution failed',
          chainId: activeChain,
        });
      }
    } catch (e: any) {
      setTxStatus('failed');
      setTxError(e.message || 'Unknown error');
    }
    setExecuting(false);
  };

  const readiness = checkTradeReadiness({
    wallet: { connected: wallet.connected, address: wallet.address },
    walletChain: wallet.chainId,
    requiredChain: activeChain,
    balance: parseFloat(wallet.balance || '0'),
    tradeAmount: amountNum,
    networkFeeReserve: activeChain === 'solana' ? 0.005 : 0.001,
    nativePrice: activeChain === 'solana' ? 180 : activeChain === 'base' ? 3500 : activeChain === 'robinhood' ? 3500 : 600,
    quote: quote ? { available: quote.available, quoteId: quote.quoteId, remainingSeconds: quoteRemaining } : null,
    priceImpact: quote?.priceImpact ?? 0,
    slippage,
    route: quote?.route ?? [],
    dex: quote?.dex,
    spender: quote?.spender,
    platformFeePct: 0.40,
  });

  return (
    <div className="terminal-pane" style={{ padding: 12, gap: 0 }}>
      {/* Mode tabs */}
      <div className="exec-mode-tabs">
        {([['market', 'Market'], ['limit', 'Limit'], ['dca', 'DCA']] as const).map(([id, label]) => (
          <button key={id} className={`exec-mode-tab ${mode === id ? 'active' : ''}`}
            onClick={() => setMode(id)}>
            {label}
          </button>
        ))}
      </div>

      {/* Buy / Sell tabs */}
      <div className="exec-side-tabs">
        <button className={`exec-side-tab exec-side-buy ${side === 'buy' ? 'active' : ''}`}
          onClick={() => setSide('buy')}>
          BUY
        </button>
        <button className={`exec-side-tab exec-side-sell ${side === 'sell' ? 'active' : ''}`}
          onClick={() => setSide('sell')}>
          SELL
        </button>
      </div>

      {/* Pay amount */}
      <div className="exec-input-group">
        <div className="exec-input-label">
          <span>Pay</span>
          <span style={{ color: 'var(--text-dim)' }}>
            Balance: {wallet.balance ? parseFloat(wallet.balance).toFixed(4) : '0.00'} {chain?.nativeSymbol || ''}
          </span>
        </div>
        <div style={{ position: 'relative' }}>
          <input className="exec-input" type="number" placeholder="0.00"
            value={amount} onChange={e => setAmount(e.target.value)} />
          <span style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            fontSize: 13, fontWeight: 700, color: 'var(--text-bright)',
          }}>
            {chain?.nativeSymbol || 'BNB'}
          </span>
        </div>
        <div className="pct-buttons">
          {[25, 50, 75, 100].map(pct => (
            <button key={pct} className="pct-btn"
              onClick={() => {
                const bal = parseFloat(wallet.balance || '0');
                const val = (bal * pct) / 100;
                const nativePrice = activeChain === 'solana' ? 180 : activeChain === 'base' ? 3500 : activeChain === 'robinhood' ? 3500 : 600;
                setAmount((val * nativePrice).toFixed(2));
              }}>
              {pct}%
            </button>
          ))}
        </div>
      </div>

      {/* Receive amount */}
      <div className="exec-input-group">
        <div className="exec-input-label">
          <span>Receive (est.)</span>
        </div>
        <div style={{ position: 'relative' }}>
          <input className="exec-input" type="text" placeholder="0.00"
            readOnly value={quote?.estimatedOutput || ''} style={{ opacity: 0.7 }} />
          <span style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            fontSize: 13, fontWeight: 700, color: 'var(--text-bright)',
          }}>
            {token?.symbol || 'TOKEN'}
          </span>
        </div>
      </div>

      {/* Slippage */}
      <div style={{ margin: '8px 0' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 6,
        }}>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 600 }}>Slippage</span>
          <div style={{ display: 'flex', gap: 3 }}>
            {[0.1, 0.5, 1.0].map(s => (
              <button key={s} onClick={() => setSlippage(s)} style={{
                padding: '3px 8px', fontSize: 10, fontWeight: 700,
                background: slippage === s ? 'var(--yellow-bg)' : 'var(--bg-elevated)',
                border: `1px solid ${slippage === s ? 'var(--yellow)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                color: slippage === s ? 'var(--yellow-dim)' : 'var(--text-dim)',
                transition: 'all 0.12s',
              }}>
                {s}%
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Order summary */}
      <div style={{
        padding: '8px 0', borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)', margin: '8px 0',
      }}>
        {[
          ['Price Impact', quote ? `${quote.priceImpact.toFixed(2)}%` : '—', quote && quote.priceImpact > 3 ? 'var(--red)' : undefined],
          ['Platform Fee', quote ? quote.platformFee : '—', undefined],
          ['DEX Fee', quote ? quote.dexFee : '—', undefined],
          ['Network Fee', quote ? quote.networkFee : '—', undefined],
          ['Min Output', quote ? quote.minReceived : '—', undefined],
          ['Route', quote ? quote.route.join(' → ') : '—', undefined],
          ['DEX', quote ? quote.dex : '—', undefined],
          ['Quote Valid', quote ? `${quoteRemaining}s` : '—', quoteRemaining > 3 ? 'var(--lime-dim)' : quoteRemaining > 0 ? 'var(--yellow)' : 'var(--red)'],
        ].map(([label, value, color]) => (
          <div key={label as string} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '3px 0', fontSize: 10,
          }}>
            <span style={{ color: 'var(--text-muted)' }}>{label as string}</span>
            <span style={{ color: (color as string) || 'var(--text)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{value as string}</span>
          </div>
        ))}
      </div>

      {/* Quoting indicator */}
      {quoting && (
        <div style={{ fontSize: 10, color: 'var(--yellow-dim)', textAlign: 'center', padding: 6, fontWeight: 600 }}>
          Fetching quote...
        </div>
      )}

      {/* TX status */}
      {txStatus !== 'idle' && (
        <div style={{
          padding: 8, borderRadius: 'var(--radius-sm)', marginBottom: 8, fontSize: 11, textAlign: 'center',
          fontWeight: 700,
          background: txStatus === 'confirmed' ? 'var(--lime-bg)' : txStatus === 'failed' ? 'var(--red-bg)' : 'var(--yellow-bg)',
          color: txStatus === 'confirmed' ? 'var(--lime-dim)' : txStatus === 'failed' ? 'var(--red)' : 'var(--yellow-dim)',
        }}>
          {txStatus === 'pending' && 'Transaction pending...'}
          {txStatus === 'confirmed' && `Confirmed${txHash ? ` — ${txHash.slice(0, 10)}...` : ''}`}
          {txStatus === 'failed' && `Failed: ${txError}`}
        </div>
      )}

      {/* Readiness errors */}
      {!readiness.ready && readiness.blockingChecks.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--red)', marginBottom: 6, fontWeight: 600 }}>
          {readiness.blockingChecks[0]?.message}
        </div>
      )}

      {/* Action button */}
      {!wallet.connected ? (
        <button onClick={() => setWalletModal(activeChain === 'solana' ? 'solana' : 'evm')} style={{
          width: '100%', padding: '14px', fontSize: 14, fontWeight: 800,
          background: '#FFD966', border: 'none', borderRadius: 'var(--radius)',
          color: '#3D2B1F', cursor: 'pointer',
          fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
          transition: 'background 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = '#F5C842'}
          onMouseLeave={e => e.currentTarget.style.background = '#FFD966'}
        >
          Connect Wallet
        </button>
      ) : !token ? (
        <button disabled style={{
          width: '100%', padding: '14px', fontSize: 14, fontWeight: 800,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', color: 'var(--text-muted)', cursor: 'not-allowed',
        }}>
          Select a Token
        </button>
      ) : executing ? (
        <button disabled style={{
          width: '100%', padding: '14px', fontSize: 14, fontWeight: 800,
          background: 'var(--yellow)', border: 'none', borderRadius: 'var(--radius)',
          color: '#3D2B1F', cursor: 'wait',
        }}>
          Executing...
        </button>
      ) : side === 'buy' ? (
        <button onClick={handleTrade}
          disabled={!quote || !readiness.ready || amountNum <= 0}
          style={{
            width: '100%', padding: '14px', fontSize: 15, fontWeight: 800,
            background: (!quote || !readiness.ready || amountNum <= 0) ? 'var(--bg-elevated)' : '#E8547C',
            border: 'none', borderRadius: 'var(--radius)',
            color: (!quote || !readiness.ready || amountNum <= 0) ? 'var(--text-muted)' : '#fff',
            cursor: (!quote || !readiness.ready || amountNum <= 0) ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
            textTransform: 'uppercase', transition: 'background 0.15s',
            boxShadow: (!quote || !readiness.ready || amountNum <= 0) ? 'none' : '0 4px 16px rgba(232,84,124,0.25)',
          }}
        >
          {amountNum > 0 ? `Buy ${token.symbol} — ${formatUsd(amountNum)}` : 'Enter Amount'}
        </button>
      ) : (
        <button onClick={handleTrade}
          disabled={!quote || !readiness.ready || amountNum <= 0}
          style={{
            width: '100%', padding: '14px', fontSize: 15, fontWeight: 800,
            background: (!quote || !readiness.ready || amountNum <= 0) ? 'var(--bg-elevated)' : 'var(--red)',
            border: 'none', borderRadius: 'var(--radius)',
            color: (!quote || !readiness.ready || amountNum <= 0) ? 'var(--text-muted)' : '#fff',
            cursor: (!quote || !readiness.ready || amountNum <= 0) ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
            textTransform: 'uppercase', transition: 'background 0.15s',
            boxShadow: (!quote || !readiness.ready || amountNum <= 0) ? 'none' : '0 4px 16px rgba(239,83,80,0.25)',
          }}
        >
          {amountNum > 0 ? `Sell ${token.symbol} — ${formatUsd(amountNum)}` : 'Enter Amount'}
        </button>
      )}
    </div>
  );
}