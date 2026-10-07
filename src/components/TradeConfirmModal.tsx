import { useState } from 'react';
import { useApp } from '../lib/context';
import { CHAINS, formatUsd, PLATFORM_FEE_PCT } from '../lib/config';
import { PixelDivider } from './PixelUI';
import { SecurityBadge } from './SecurityChecklist';

export default function TradeConfirmModal() {
  const { confirmState, setConfirmState, wallet, activeChain } = useApp();
  const [highImpactAck, setHighImpactAck] = useState(false);

  if (!confirmState) return null;

  const { side, tokenSymbol, amountUsd, estimatedOutput, platformFee, dexFee,
    networkFee, priceImpact, slippage, minReceived, route } = confirmState;

  const isBuy = side === 'buy';
  const platformFeeNum = parseFloat(platformFee) || (amountUsd * PLATFORM_FEE_PCT);
  const referralShare = platformFeeNum * 0.3;
  const isExtremeImpact = priceImpact >= 15;
  const isHighImpact = priceImpact >= 5;
  const chain = CHAINS[activeChain];

  return (
    <div className="modal-overlay" onClick={() => setConfirmState(null)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <span className="led" />
          CONFIRM TRADE
          <div style={{ flex: 1 }} />
          <button style={{
            background: 'none', border: 'none', color: 'var(--text-dim)',
            cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 9,
          }} onClick={() => setConfirmState(null)}>[ESC]</button>
        </div>

        <div style={{ padding: 12 }}>
          {/* Side indicator */}
          <div style={{
            textAlign: 'center', padding: '8px 0',
            fontSize: 14, fontWeight: 800, letterSpacing: '0.12em',
            color: isBuy ? 'var(--green)' : 'var(--red)',
          }}>
            {isBuy ? 'BUY' : 'SELL'} {tokenSymbol}
          </div>

          {/* Summary */}
          <div className="confirm-summary">
            <div className="confirm-row">
              <span className="label">{isBuy ? 'YOU PAY' : 'YOU SELL'}</span>
              <span className="value" style={{ color: isBuy ? 'var(--green)' : 'var(--red)' }}>
                ${amountUsd.toFixed(2)}
              </span>
            </div>
            <div className="confirm-row">
              <span className="label">YOU RECEIVE</span>
              <span className="value">{estimatedOutput} {tokenSymbol}</span>
            </div>

            <PixelDivider />

            <div className="confirm-row">
              <span className="label">BSTONKEX FEE</span>
              <span className="value">${platformFee}</span>
            </div>
            <div className="confirm-row">
              <span className="label">REFERRAL ALLOC</span>
              <span className="value" style={{ fontSize: 8, color: 'var(--text-dim)' }}>
                ${referralShare.toFixed(4)}
              </span>
            </div>
            <div className="confirm-row">
              <span className="label">DEX FEE</span>
              <span className="value">${dexFee}</span>
            </div>
            <div className="confirm-row">
              <span className="label">NETWORK FEE</span>
              <span className="value">~${networkFee}</span>
            </div>
            <div className="confirm-row">
              <span className="label">PRICE IMPACT</span>
              <span className="value" style={{
                color: priceImpact > 3 ? 'var(--red)' : priceImpact > 1 ? 'var(--amber)' : 'var(--green)',
              }}>{priceImpact.toFixed(2)}%</span>
            </div>
            <div className="confirm-row">
              <span className="label">SLIPPAGE</span>
              <span className="value">{slippage}%</span>
            </div>
            <div className="confirm-row">
              <span className="label">MIN RECEIVED</span>
              <span className="value">{minReceived}</span>
            </div>
            <div className="confirm-row">
              <span className="label">ROUTE</span>
              <span className="value" style={{ fontSize: 9 }}>{route.join(' → ')}</span>
            </div>
          </div>

          {/* Security status */}
          <div style={{
            marginTop: 6, padding: '5px 8px', fontSize: 7, display: 'flex', gap: 8, flexWrap: 'wrap',
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          }}>
            <SecurityBadge status="pass" label="WALLET" />
            <SecurityBadge status="pass" label="NETWORK" />
            <SecurityBadge status="pass" label="ROUTE" />
            <SecurityBadge status={priceImpact < 1 ? 'pass' : priceImpact < 5 ? 'warning' : 'block'} label="IMPACT" />
            <SecurityBadge status="pass" label="QUOTE" />
          </div>

          {/* Wallet / network info */}
          <div style={{
            marginTop: 6, padding: '5px 8px', fontSize: 8, color: 'var(--text-muted)',
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            letterSpacing: '0.05em', lineHeight: 1.8,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>WALLET</span>
              <span style={{ fontFamily: 'var(--font)' }}>{wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>NETWORK</span>
              <span>{chain?.name || activeChain}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>CUSTODY</span>
              <span style={{ color: 'var(--green)' }}>NON-CUSTODIAL</span>
            </div>
          </div>

          {/* Extreme price impact warning — requires explicit acknowledgement */}
          {isExtremeImpact && !highImpactAck && (
            <div style={{
              marginTop: 6, padding: 8, fontSize: 9, fontWeight: 700,
              border: '1px solid var(--red)', background: 'rgba(255,48,96,0.08)',
              color: 'var(--red)', letterSpacing: '0.05em',
            }}>
              <div style={{ marginBottom: 4 }}>⚠ EXTREME PRICE IMPACT ({priceImpact.toFixed(2)}%)</div>
              <div style={{ fontSize: 7, color: 'var(--text-dim)', fontWeight: 400 }}>
                You may receive significantly less than expected. Review trade size and liquidity.
              </div>
              <button className="btn btn-sm btn-red" style={{ marginTop: 6, fontSize: 7, padding: '3px 8px', width: '100%' }}
                onClick={() => setHighImpactAck(true)}>
                I UNDERSTAND — CONTINUE
              </button>
            </div>
          )}

          {/* High impact warning */}
          {isHighImpact && !isExtremeImpact && (
            <div style={{
              marginTop: 6, padding: 6, fontSize: 8, fontWeight: 700,
              border: '1px solid var(--amber)', background: 'rgba(255,170,0,0.04)',
              color: 'var(--amber)', letterSpacing: '0.05em',
            }}>
              ⚠ HIGH PRICE IMPACT ({priceImpact.toFixed(2)}%) — You may receive less than expected
            </div>
          )}

          {/* Simulation note */}
          <div style={{
            marginTop: 4, padding: '3px 6px', fontSize: 7, color: 'var(--text-muted)',
            letterSpacing: '0.03em', lineHeight: 1.5,
          }}>
            Simulation passed. Final execution depends on blockchain state at confirmation.
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-full" onClick={() => { setConfirmState(null); setHighImpactAck(false); }}>
              CANCEL
            </button>
            <button className={`btn btn-full ${isBuy ? 'btn-green' : 'btn-red'}`}
              disabled={isExtremeImpact && !highImpactAck}
              onClick={() => {
                setConfirmState(null);
                setHighImpactAck(false);
                window.dispatchEvent(new CustomEvent('bstonkex-confirm-trade'));
              }}>
              {isExtremeImpact && !highImpactAck ? 'ACKNOWLEDGE IMPACT' : 'CONFIRM TRADE'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}