import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp, type ConfirmState } from '../lib/context';
import { CHAINS, formatUsd, formatPrice, explorerTxUrl } from '../lib/config';
import { getQuote, executeTrade, submitSignedTx, isQuoteValid, getQuoteRemainingSeconds, type TradeQuote, type TradeSide, type QuoteParams } from '../lib/trading';
import { checkTokenSafety, type SafetyReport } from '../lib/engine/token-safety';
import { checkTradeReadiness, type TradeReadinessResult } from '../lib/engine/security-engine';
import { logSecurityEvent } from '../lib/engine/security-log';
import { getReferrerForWallet } from '../lib/referral';
import { PixelDivider } from './PixelUI';
import TradeReceipt from './TradeReceipt';
import SecurityChecklist from './SecurityChecklist';
import TxLifecycle from './TxLifecycle';

interface Props {
  tokenAddress: string;
  tokenSymbol: string;
  tokenPrice: number | null;
}

const PCT_BUTTONS = [25, 50, 75, 100];
const QUICK_PRESETS = [10, 50, 100, 500]; // USD
const SLIPPAGE_OPTIONS = [0.1, 0.5, 1, 3];
const HIGH_IMPACT_THRESHOLD = 5; // percent

export default function TradePanel({ tokenAddress, tokenSymbol, tokenPrice }: Props) {
  const { wallet, activeChain, connect, confirmState, setConfirmState, addNotification, setWalletModal } = useApp();
  const [side, setSide] = useState<TradeSide>('buy');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(0.5);
  const [customSlippage, setCustomSlippage] = useState('');
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'confirmed' | 'failed' | 'approving'>('idle');
  const [txHash, setTxHash] = useState('');
  const [txError, setTxError] = useState('');
  const [tradeId, setTradeId] = useState<string | null>(null);
  const [quoteRemaining, setQuoteRemaining] = useState(0);
  const [safetyReport, setSafetyReport] = useState<SafetyReport | null>(null);
  const [showHighImpact, setShowHighImpact] = useState(false);
  const [highImpactConfirmed, setHighImpactConfirmed] = useState(false);
  const [isCustomSlippage, setIsCustomSlippage] = useState(false);
  const [showRouteDetails, setShowRouteDetails] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [txDeadline, setTxDeadline] = useState(20); // minutes
  const [showReceipt, setShowReceipt] = useState(false);
  const [doubleSubmitGuard, setDoubleSubmitGuard] = useState(false);
  const [quoteRemainingRefresh, setQuoteRemainingRefresh] = useState(0);

  const chain = CHAINS[activeChain];
  const effectiveSlippage = isCustomSlippage ? (parseFloat(customSlippage) || 0.5) : slippage;
  const amountNum = parseFloat(amount) || 0;

  // Trade readiness check
  const nativePrice = activeChain === 'solana' ? 180 : activeChain === 'base' ? 3500 : activeChain === 'robinhood' ? 3500 : 600;
  const gasReserve = activeChain === 'solana' ? 0.005 : 0.001;

  const readiness: TradeReadinessResult = useMemo(() => checkTradeReadiness({
    wallet: { connected: wallet.connected, address: wallet.address },
    walletChain: wallet.chainId,
    requiredChain: activeChain,
    balance: wallet.balance ? parseFloat(wallet.balance) : null,
    tradeAmount: amountNum,
    networkFeeReserve: gasReserve,
    nativePrice,
    quote: quote ? { available: quote.available, quoteId: quote.quoteId, remainingSeconds: quoteRemaining } : null,
    priceImpact: quote?.priceImpact ?? 0,
    slippage: effectiveSlippage,
    route: quote?.route ?? [],
    dex: quote?.dex,
    spender: quote?.spender,
    platformFeePct: 0.40,
  }), [wallet.connected, wallet.address, wallet.chainId, wallet.balance, activeChain, amountNum, quote, quoteRemaining, effectiveSlippage]);

  // Token safety check on mount / token change
  useEffect(() => {
    if (tokenAddress) {
      checkTokenSafety(activeChain, tokenAddress).then(setSafetyReport).catch(() => {});
    }
  }, [activeChain, tokenAddress]);

  // Quote expiry countdown
  useEffect(() => {
    if (!quote?.quoteId) { setQuoteRemaining(0); return; }
    const iv = setInterval(() => {
      const remaining = getQuoteRemainingSeconds(quote.quoteId);
      setQuoteRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(iv);
        logSecurityEvent({ type: 'quote_expired', severity: 'info', message: `Quote expired for ${tokenSymbol}`, chain: activeChain, token: tokenSymbol });
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [quote?.quoteId, tokenSymbol, activeChain]);

  // Invalidate quote on wallet/network change
  useEffect(() => {
    if (quote) {
      setQuote(null);
      setAmount(amount); // trigger re-quote
      if (wallet.connected) {
        logSecurityEvent({
          type: 'account_changed', severity: 'medium',
          message: 'Wallet/account changed — quote invalidated',
          chain: activeChain, wallet: wallet.address?.slice(0, 8),
        });
      }
    }
  }, [wallet.address, wallet.chainId]);

  // Get quote when amount changes
  useEffect(() => {
    if (amountNum <= 0) { setQuote(null); return; }
    setQuoting(true);
    setShowHighImpact(false);
    setHighImpactConfirmed(false);
    const timer = window.setTimeout(async () => {
      const params: QuoteParams = {
        chainId: activeChain, side, tokenAddress, tokenSymbol,
        amountUsd: amountNum, slippagePct: effectiveSlippage, walletAddress: wallet.address,
      };
      const q = await getQuote(params);
      setQuote(q);
      setQuoting(false);
      logSecurityEvent({
        type: 'quote_created', severity: 'info',
        message: `${side} ${tokenSymbol} ${amountNum} → ${q.estimatedOutput} (impact: ${q.priceImpact.toFixed(2)}%)`,
        chain: activeChain, token: tokenSymbol, wallet: wallet.address?.slice(0, 8),
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [amountNum, side, activeChain, tokenAddress, tokenSymbol, effectiveSlippage, wallet.address]);

  // Gas-safe MAX: reserve estimated gas for native asset
  const handlePct = (pct: number) => {
    if (!wallet.connected) return;
    const bal = parseFloat(wallet.balance || '0');
    const nativePrice = activeChain === 'solana' ? 180 : activeChain === 'base' ? 3500 : activeChain === 'robinhood' ? 3500 : 600;
    let usableBalance = bal * nativePrice;
    if (pct === 100) {
      // Reserve gas: ~0.001 BNB / 0.005 SOL / 0.001 ETH for network fees
      const gasReserve = activeChain === 'solana' ? 0.005 : 0.001;
      usableBalance = Math.max(0, (bal - gasReserve) * nativePrice);
    }
    setAmount(String((usableBalance * pct / 100).toFixed(2)));
  };

  // Open confirmation modal (with safety checks)
  const handleTradeClick = () => {
    if (!quote?.available || !isQuoteValid(quote.quoteId)) return;

    // Check high price impact
    if (quote.priceImpact >= HIGH_IMPACT_THRESHOLD && !highImpactConfirmed) {
      setShowHighImpact(true);
      return;
    }

    const estimatedOutput = tokenPrice ? (amountNum / tokenPrice).toFixed(2) : quote.estimatedOutput;
    const confirm: ConfirmState = {
      side, tokenSymbol, amountUsd: amountNum,
      estimatedOutput,
      platformFee: quote.platformFee,
      dexFee: quote.dexFeeUsd.toFixed(4),
      networkFee: quote.networkFeeUsd.toFixed(4),
      priceImpact: quote.priceImpact,
      slippage: effectiveSlippage, minReceived: quote.minReceived,
      route: quote.route,
    };
    setConfirmState(confirm);
  };

  // Execute trade after confirmation
  const performTrade = useCallback(async () => {
    if (!wallet.connected || !wallet.address || !quote?.available) return;

    // Double-submission protection
    if (doubleSubmitGuard) {
      logSecurityEvent({ type: 'double_submit_blocked', severity: 'medium', message: `Double submit blocked for ${tokenSymbol}`, chain: activeChain });
      addNotification({ type: 'pending', title: 'ALREADY SUBMITTED', message: 'Transaction already in progress' });
      return;
    }
    setDoubleSubmitGuard(true);

    // Check quote still valid
    if (!isQuoteValid(quote.quoteId)) {
      logSecurityEvent({ type: 'quote_expired', severity: 'high', message: 'Quote expired at execution time', chain: activeChain, token: tokenSymbol });
      setTxStatus('failed');
      setTxError('QUOTE EXPIRED — Please refresh and try again');
      setDoubleSubmitGuard(false);
      return;
    }

    // Check network match
    if (wallet.chainId && wallet.chainId !== activeChain) {
      logSecurityEvent({ type: 'wrong_network', severity: 'high', message: `Wrong network: ${wallet.chainId} vs ${activeChain}`, chain: activeChain, wallet: wallet.address?.slice(0, 8) });
      setTxStatus('failed');
      setTxError('WRONG NETWORK — Switch your wallet to the correct chain');
      setDoubleSubmitGuard(false);
      return;
    }

    // Check trade readiness — block if any critical check fails
    if (!readiness.ready) {
      const blockers = readiness.blockingChecks.map(c => c.message).join('; ');
      logSecurityEvent({ type: 'trade_readiness_failed', severity: 'high', message: blockers, chain: activeChain, token: tokenSymbol });
      setTxStatus('failed');
      setTxError(`TRADE NOT READY: ${blockers}`);
      setDoubleSubmitGuard(false);
      return;
    }

    logSecurityEvent({ type: 'tx_submitting', severity: 'info', message: `${side} ${tokenSymbol} ${amountNum}`, chain: activeChain, token: tokenSymbol, wallet: wallet.address?.slice(0, 8) });

    setExecuting(true);
    setTxStatus('pending');
    setTxError('');

    addNotification({ type: 'pending', title: `${side.toUpperCase()} ${tokenSymbol}`, message: 'Transaction submitted, waiting for wallet...' });

    try {
      const referrerUsername = await getReferrerForWallet(wallet.address);
      const params: QuoteParams = {
        chainId: activeChain, side, tokenAddress, tokenSymbol,
        amountUsd: amountNum, slippagePct: effectiveSlippage, walletAddress: wallet.address,
      };

      const result = await executeTrade(params, quote, wallet.address, referrerUsername);

      if (!result.success) {
        logSecurityEvent({ type: 'tx_failed', severity: 'high', message: result.error || 'Trade failed', chain: activeChain, token: tokenSymbol });
        setTxStatus('failed');
        setTxError(result.error || 'TRADE FAILED');
        addNotification({ type: 'failed', title: `${side.toUpperCase()} FAILED`, message: result.error || 'Trade failed' });
        setExecuting(false);
        setDoubleSubmitGuard(false);
        return;
      }

      if (result.tradeId) setTradeId(result.tradeId);

      // Token approval needed
      if (result.status === 'awaiting_approval' && result.txData) {
        logSecurityEvent({ type: 'approval_requested', severity: 'medium', message: `Approval required for ${tokenSymbol}`, chain: activeChain, token: tokenSymbol });
        setTxStatus('approving');
        setTxError('APPROVAL REQUIRED — Please approve the token in your wallet');
        addNotification({ type: 'approval', title: 'APPROVAL REQUIRED', message: `Approve ${tokenSymbol} for trading` });

        if (wallet.provider === 'evm' && window.ethereum) {
          try {
            const approvalHash = await window.ethereum.request({
              method: 'eth_sendTransaction',
              params: [{
                from: wallet.address,
                to: result.txData.to,
                data: result.txData.data,
                value: result.txData.value || '0x0',
              }],
            });
            setTxStatus('pending');
            setTxError('Approval confirmed. Re-executing trade...');
            addNotification({ type: 'confirmed', title: 'APPROVAL CONFIRMED', message: 'Re-executing trade...' });

            const newQuote = await getQuote(params);
            if (newQuote.available) {
              const newResult = await executeTrade(params, newQuote, wallet.address, referrerUsername);
              if (newResult.success && newResult.txData) {
                await sendWalletTx(newResult.txData, newResult.tradeId || '');
              } else {
                setTxStatus('failed');
                setTxError(newResult.error || 'RE-EXECUTION FAILED');
                addNotification({ type: 'failed', title: 'TRADE FAILED', message: newResult.error || 'Re-execution failed' });
              }
            }
          } catch (e: any) {
            const isRejection = e.message?.includes('rejected') || e.message?.includes('denied') || e.code === 4001;
            setTxStatus('failed');
            setTxError(isRejection ? 'TRANSACTION REJECTED BY USER' : 'APPROVAL FAILED');
            addNotification({ type: 'failed', title: isRejection ? 'REJECTED' : 'APPROVAL FAILED', message: isRejection ? 'You rejected the approval in your wallet' : e.message });
          }
        }
        setExecuting(false);
        return;
      }

      // Send swap tx through wallet
      if (result.txData) {
        await sendWalletTx(result.txData, result.tradeId || '');
      } else {
        setTxStatus('failed');
        setTxError('NO TRANSACTION DATA');
        addNotification({ type: 'failed', title: 'TRADE FAILED', message: 'No transaction data available' });
        setExecuting(false);
      }

    } catch (e: any) {
      setTxStatus('failed');
      setTxError(e.message || 'TRADE FAILED');
      addNotification({ type: 'failed', title: 'TRADE FAILED', message: e.message || 'Unknown error' });
      setExecuting(false);
    }
  }, [wallet, quote, activeChain, side, tokenAddress, tokenSymbol, amountNum, effectiveSlippage, addNotification]);

  /** Send unsigned tx through the wallet provider. */
  const sendWalletTx = async (txData: any, tid: string) => {
    if (!wallet.address) return;

    try {
      let hash: string;

      if (wallet.provider === 'evm' && window.ethereum) {
        hash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{
            from: wallet.address,
            to: txData.to,
            data: txData.data,
            value: txData.value || '0x0',
            gas: txData.gasLimit ? `0x${parseInt(txData.gasLimit).toString(16)}` : undefined,
          }],
        });
      } else if (wallet.provider === 'solana' && window.solana) {
        if (txData.serializedMessage) {
          const raw = atob(txData.serializedMessage);
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
          const { signature } = await window.solana.signAndSendTransaction(bytes);
          hash = signature;
        } else {
          throw new Error('NO SERIALIZED TRANSACTION');
        }
      } else {
        throw new Error('WALLET NOT SUPPORTED FOR EXECUTION');
      }

      logSecurityEvent({ type: 'tx_submitted', severity: 'info', message: `TX submitted: ${hash.slice(0, 10)}...`, chain: activeChain, token: tokenSymbol, txHash: hash });
      setTxHash(hash);
      setTxStatus('pending');
      addNotification({ type: 'pending', title: 'TX SUBMITTED', message: `${hash.slice(0, 12)}...`, txHash: hash, chainId: activeChain });

      const referrerUsername = await getReferrerForWallet(wallet.address);
      const confirmResult = await submitSignedTx(tid, hash, referrerUsername);

      if (confirmResult.success) {
        logSecurityEvent({ type: 'tx_confirmed', severity: 'info', message: `${side} ${tokenSymbol} confirmed`, chain: activeChain, token: tokenSymbol, txHash: confirmResult.txHash || hash });
        setTxStatus('confirmed');
        setTxHash(confirmResult.txHash || hash);
        addNotification({ type: 'confirmed', title: `${side.toUpperCase()} CONFIRMED`, message: `${tokenSymbol} — View on explorer`, txHash: confirmResult.txHash || hash, chainId: activeChain });
      } else {
        setTxStatus('failed');
        setTxError(confirmResult.error || 'CONFIRMATION TIMEOUT');
        addNotification({ type: 'failed', title: 'TX FAILED', message: confirmResult.error || 'Confirmation timeout', txHash: hash, chainId: activeChain });
      }

    } catch (e: any) {
      const msg = e.message || '';
      const isRejection = msg.includes('rejected') || msg.includes('denied') || msg.includes('4001') || e.code === 4001;
      logSecurityEvent({
        type: isRejection ? 'tx_rejected' : 'tx_failed', severity: isRejection ? 'medium' : 'high',
        message: isRejection ? 'User rejected transaction' : msg, chain: activeChain, token: tokenSymbol, wallet: wallet.address?.slice(0, 8),
      });
      setTxStatus('failed');
      setTxError(isRejection ? 'TRANSACTION REJECTED BY USER' : msg || 'TRANSACTION FAILED');
      addNotification({ type: 'failed', title: isRejection ? 'REJECTED' : 'TX FAILED', message: isRejection ? 'You rejected the transaction in your wallet' : msg });
    }
    setExecuting(false);
  };

  // Listen for confirm event from modal
  useEffect(() => {
    const handler = () => performTrade();
    window.addEventListener('bstonkex-confirm-trade', handler);
    return () => window.removeEventListener('bstonkex-confirm-trade', handler);
  }, [performTrade]);

  const estimatedTokens = quote?.available && tokenPrice
    ? (amountNum / tokenPrice).toFixed(2) : null;

  const gasSymbol = chain.nativeSymbol;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-panel)', minWidth: 0, overflow: 'hidden' }}>
      <div className="panel-header">
        <span className="led" />
        TRADE {tokenSymbol}
        <div style={{ flex: 1 }} />
        {wallet.connected && (
          <span className="text-xs" style={{ color: 'var(--text-dim)', fontWeight: 600 }}>
            {chain.nativeSymbol} {wallet.balance ? parseFloat(wallet.balance).toFixed(4) : '—'}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: 10 }}>
        {/* Buy / Sell */}
        <div className="tabs">
          <button className="tab" onClick={() => setSide('buy')}
            style={side === 'buy' ? { borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-bg)', zIndex: 1 } : undefined}>
            BUY
          </button>
          <button className="tab" onClick={() => setSide('sell')}
            style={side === 'sell' ? { borderColor: 'var(--red)', color: 'var(--red)', background: 'var(--red-bg)', zIndex: 1 } : undefined}>
            SELL
          </button>
        </div>

        {/* Token Safety Warnings */}
        {safetyReport && safetyReport.warnings.length > 0 && (
          <div style={{
            padding: 6, fontSize: 8, fontWeight: 700, lineHeight: 1.5,
            border: '1px solid var(--amber)', background: 'rgba(255,170,0,0.04)',
            color: 'var(--amber)', letterSpacing: '0.05em',
          }}>
            {safetyReport.warnings.map((w, i) => (
              <div key={i}>⚠ {w.label}: {w.detail}</div>
            ))}
          </div>
        )}

        {/* Wallet not connected */}
        {!wallet.connected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', padding: 20 }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.05em' }}>
              Connect your wallet to trade
            </div>
            <button className="btn btn-lg btn-cyan" onClick={() => setWalletModal(activeChain === 'solana' ? 'solana' : 'evm')}>
              CONNECT WALLET
            </button>
          </div>
        ) : (
          <>
            {/* Wrong network check */}
            {wallet.chainId && wallet.chainId !== activeChain && (
              <div style={{
                padding: 8, textAlign: 'center',
                border: '1px solid var(--amber)', background: 'rgba(255,170,0,0.04)',
              }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--amber)', marginBottom: 4 }}>
                  WRONG NETWORK
                </div>
                <div style={{ fontSize: 8, color: 'var(--text-dim)', marginBottom: 6 }}>
                  Switch to {chain.name} to trade
                </div>
              </div>
            )}

            {/* Amount */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span className="text-xs text-dim">AMOUNT (USD)</span>
                <span className="text-xs text-dim">
                  BAL: {wallet.balance ? `${parseFloat(wallet.balance).toFixed(4)} ${chain.nativeSymbol}` : '...'}
                </span>
              </div>
              <input className="input" type="number" placeholder="0.00" value={amount}
                onChange={e => setAmount(e.target.value)}
                style={{ fontSize: 16, fontWeight: 800, textAlign: 'right', letterSpacing: '-0.02em' }} />
            </div>

            <div className="quick-amounts">
              {PCT_BUTTONS.map(pct => (
                <button key={pct} className="quick-amount-btn" onClick={() => handlePct(pct)}>
                  {pct === 100 ? `MAX` : `${pct}%`}
                </button>
              ))}
            </div>
            {/* Quick USD presets */}
            <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
              {QUICK_PRESETS.map(usd => (
                <button key={usd} className="btn btn-sm" style={{ flex: 1, fontSize: 8, padding: '2px 0', minWidth: 0 }}
                  onClick={() => setAmount(String(usd))}>
                  ${usd}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 7, color: 'var(--text-muted)' }}>
              MAX reserves ~{gasReserve} {gasSymbol} for network fees
            </div>

            {/* Slippage */}
            <div>
              <span className="text-xs text-dim" style={{ display: 'block', marginBottom: 3 }}>SLIPPAGE TOLERANCE</span>
              <div className="slippage-options">
                {SLIPPAGE_OPTIONS.map(s => (
                  <button key={s} className={`slippage-btn ${!isCustomSlippage && slippage === s ? 'active' : ''}`}
                    onClick={() => { setSlippage(s); setIsCustomSlippage(false); }}>
                    {s}%
                  </button>
                ))}
                <input className="input" type="number" placeholder="Custom" value={customSlippage}
                  onChange={e => { setCustomSlippage(e.target.value); setIsCustomSlippage(true); }}
                  style={{ width: 'min(60px, 100%)', fontSize: 9, textAlign: 'center', minWidth: 0 }} />
              </div>
            </div>

            <PixelDivider />

            {/* Security checklist — compact mode when all pass, full when warnings/blocks exist */}
            {amountNum > 0 && wallet.connected && (
              <SecurityChecklist checks={readiness.checks} compact={readiness.allPassed} showPassed={false} />
            )}

            {quoting && <div className="text-center text-xs text-dim loading" style={{ padding: 6 }}>FETCHING ROUTE...</div>}

            {quote?.available && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11 }}>
                  <span className="text-dim" style={{ fontSize: 9 }}>{side === 'buy' ? 'YOU PAY' : 'YOU SELL'}</span>
                  <span className="font-bold" style={{ color: 'var(--text-bright)' }}>${amountNum.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11 }}>
                  <span className="text-dim" style={{ fontSize: 9 }}>YOU RECEIVE</span>
                  <span className="font-bold" style={{ color: 'var(--green)' }}>
                    ≈ {estimatedTokens ? `${estimatedTokens} ${tokenSymbol}` : formatPrice(parseFloat(quote.estimatedOutput))}
                  </span>
                </div>
                <PixelDivider />
                <div className="info-row"><span className="info-label">BSTONKEX 0.40%</span><span className="info-value">${quote.platformFee}</span></div>
                <div className="info-row"><span className="info-label">DEX FEE</span><span className="info-value">${quote.dexFeeUsd.toFixed(4)}</span></div>
                <div className="info-row"><span className="info-label">NETWORK</span><span className="info-value">~${quote.networkFeeUsd.toFixed(4)}</span></div>
                <div className="info-row">
                  <span className="info-label">IMPACT</span>
                  <span className="info-value" style={{ color: quote.priceImpact > 3 ? 'var(--red)' : quote.priceImpact > 1 ? 'var(--amber)' : 'var(--green)' }}>
                    {quote.priceImpact.toFixed(2)}%
                  </span>
                </div>
                <div className="info-row"><span className="info-label">SLIPPAGE</span><span className="info-value">{effectiveSlippage}%</span></div>
                <div className="info-row"><span className="info-label">MIN REC.</span><span className="info-value">{quote.minReceived}</span></div>
                {/* Execution price */}
                {tokenPrice && amountNum > 0 && (
                  <div className="info-row">
                    <span className="info-label">EXEC PRICE</span>
                    <span className="info-value" style={{ fontWeight: 800 }}>
                      ${tokenPrice < 0.01 ? tokenPrice.toExponential(4) : tokenPrice.toFixed(6)}
                    </span>
                  </div>
                )}
                {quote.route.length > 0 && (
                  <div className="info-row" style={{ cursor: 'pointer' }}
                    onClick={() => setShowRouteDetails(v => !v)}>
                    <span className="info-label">ROUTE</span>
                    <span className="info-value text-xs">
                      {quote.route.join(' → ')} {showRouteDetails ? '▴' : '▾'}
                    </span>
                  </div>
                )}
                {/* Expandable route details */}
                {showRouteDetails && quote.route.length > 0 && (
                  <div style={{ padding: '4px 6px', fontSize: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', marginBottom: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ color: 'var(--text-dim)' }}>DEX</span>
                      <span>{quote.dex || 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ color: 'var(--text-dim)' }}>PATH</span>
                      <span>{quote.route.join(' → ')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-dim)' }}>GAS EST.</span>
                      <span>~${quote.networkFeeUsd.toFixed(4)}</span>
                    </div>
                  </div>
                )}
                <div className="info-row">
                  <span className="info-label">QUOTE</span>
                  <span className="info-value" style={{ color: quoteRemaining > 3 ? 'var(--green)' : quoteRemaining > 0 ? 'var(--amber)' : 'var(--red)' }}>
                    {quoteRemaining > 0 ? `VALID ${quoteRemaining}s` : 'EXPIRED'}
                  </span>
                </div>
                {/* Advanced settings */}
                <div style={{ marginTop: 4 }}>
                  <button className="btn btn-sm" style={{ fontSize: 7, padding: '2px 5px', width: '100%' }}
                    onClick={() => setShowAdvanced(v => !v)}>
                    ⚙ ADVANCED {showAdvanced ? '▴' : '▾'}
                  </button>
                  {showAdvanced && (
                    <div style={{ padding: '6px', fontSize: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', marginTop: 2 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-dim)' }}>TX DEADLINE</span>
                        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                          <input className="input" type="number" value={txDeadline}
                            onChange={e => setTxDeadline(Math.max(1, parseInt(e.target.value) || 20))}
                            style={{ width: 40, fontSize: 9, textAlign: 'center' }} />
                          <span style={{ color: 'var(--text-dim)' }}>min</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ color: 'var(--text-dim)' }}>PRIORITY FEE</span>
                        <span style={{ color: 'var(--text-muted)' }}>NOT CONFIGURED</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-dim)' }}>MEV PROTECTION</span>
                        <span style={{ color: 'var(--text-muted)' }}>NOT SUPPORTED</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Quote failure */}
            {quote && !quote.available && quote.error && (
              <div style={{
                padding: 8, fontSize: 9, fontWeight: 700,
                border: '1px solid var(--amber-dim)', background: 'rgba(255,170,0,0.04)',
                color: 'var(--amber)', letterSpacing: '0.05em',
              }}>
                {quote.error}
                <div style={{ fontSize: 7, marginTop: 4, color: 'var(--text-dim)' }}>
                  No executable route found. Try a different amount or retry.
                </div>
              </div>
            )}

            {/* High price impact warning */}
            {showHighImpact && quote?.available && (
              <div style={{
                padding: 8, border: '1px solid var(--red)',
                background: 'rgba(255,48,96,0.06)', color: 'var(--red)',
              }}>
                <div style={{ fontSize: 10, fontWeight: 800, marginBottom: 4 }}>⚠ HIGH PRICE IMPACT</div>
                <div style={{ fontSize: 8, lineHeight: 1.5, color: 'var(--text-dim)' }}>
                  This trade may receive significantly less value because of available liquidity.
                  Price impact: {quote.priceImpact.toFixed(2)}%
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button className="btn btn-sm" onClick={() => setShowHighImpact(false)}>CANCEL</button>
                  <button className="btn btn-sm btn-red" onClick={() => { setShowHighImpact(false); setHighImpactConfirmed(true); handleTradeClick(); }}>
                    CONTINUE
                  </button>
                </div>
              </div>
            )}

            {/* Trade Receipt (after confirmation) */}
            {txStatus === 'confirmed' && showReceipt && quote && (
              <TradeReceipt
                side={side} tokenSymbol={tokenSymbol} chainId={activeChain}
                amountUsd={amountNum}
                tokenAmount={estimatedTokens || quote.estimatedOutput}
                executionPrice={tokenPrice || 0}
                txHash={txHash}
                platformFee={quote.platformFee} dexFee={quote.dexFee}
                networkFee={quote.networkFee} priceImpact={quote.priceImpact}
                slippage={effectiveSlippage} route={quote.route}
                onClose={() => { setTxStatus('idle'); setTxHash(''); setTxError(''); setShowReceipt(false); setQuote(null); setAmount(''); }}
                onTradeAgain={() => { setTxStatus('idle'); setTxHash(''); setTxError(''); setShowReceipt(false); setQuote(null); setAmount(''); }}
                onViewPosition={() => { setTxStatus('idle'); setShowReceipt(false); }}
              />
            )}

            {/* Transaction lifecycle */}
            {txStatus !== 'idle' && !showReceipt && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <TxLifecycle status={txStatus} txHash={txHash} error={txError} chainId={activeChain} />
                <div style={{ display: 'flex', gap: 4 }}>
                  {txStatus === 'confirmed' && (
                    <>
                      <a href={explorerTxUrl(activeChain, txHash)} target="_blank" rel="noopener"
                        className="btn btn-sm btn-full" style={{ fontSize: 7, textAlign: 'center', textDecoration: 'none' }}>
                        VIEW ON {chain.explorerName.toUpperCase()} ↗
                      </a>
                      <button className="btn btn-sm btn-full btn-cyan" style={{ fontSize: 7 }}
                        onClick={() => setShowReceipt(true)}>RECEIPT</button>
                    </>
                  )}
                  {(txStatus === 'confirmed' || txStatus === 'failed') && (
                    <button className="btn btn-sm btn-full" style={{ fontSize: 7 }}
                      onClick={() => { setTxStatus('idle'); setTxHash(''); setTxError(''); setShowReceipt(false); setDoubleSubmitGuard(false); }}>
                      {txStatus === 'failed' ? 'TRY AGAIN' : 'CLOSE'}
                    </button>
                  )}
                </div>
              </div>
            )}

            <div style={{ flex: 1 }} />

            {/* Main action button */}
            {quote?.available && quoteRemaining <= 0 ? (
              <button className="btn btn-lg btn-full" onClick={() => { setQuote(null); /* triggers re-fetch */ }}>
                QUOTE EXPIRED — GET NEW QUOTE
              </button>
            ) : (
              <button className={`btn btn-lg btn-full ${side === 'buy' ? 'btn-green' : 'btn-red'}`}
                disabled={!quote?.available || executing || doubleSubmitGuard || amountNum <= 0 || !readiness.ready || (wallet.chainId !== null && wallet.chainId !== activeChain)}
                onClick={handleTradeClick}>
                {executing || doubleSubmitGuard ? 'SIGNING...' :
                 !readiness.ready && readiness.blockingChecks.length > 0 ? readiness.blockingChecks[0].check :
                 wallet.chainId && wallet.chainId !== activeChain ? 'WRONG NETWORK' :
                 `${side === 'buy' ? 'BUY' : 'SELL'} ${tokenSymbol}`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}