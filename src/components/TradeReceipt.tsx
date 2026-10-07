import { CHAINS, formatUsd, explorerTxUrl, shortenAddress } from '../lib/config';
import type { ChainId } from '../lib/config';
import { PixelDivider } from './PixelUI';
import ChainIcon from './ChainIcon';

interface Props {
  side: 'buy' | 'sell';
  tokenSymbol: string;
  chainId: ChainId;
  amountUsd: number;
  tokenAmount: string;
  executionPrice: number;
  txHash: string;
  platformFee: string;
  dexFee: string;
  networkFee: string;
  priceImpact: number;
  slippage: number;
  route: string[];
  onClose: () => void;
  onTradeAgain: () => void;
  onViewPosition: () => void;
}

export default function TradeReceipt({
  side, tokenSymbol, chainId, amountUsd, tokenAmount, executionPrice,
  txHash, platformFee, dexFee, networkFee, priceImpact, slippage, route,
  onClose, onTradeAgain, onViewPosition,
}: Props) {
  const chain = CHAINS[chainId];
  const isBuy = side === 'buy';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 4 }}>
      {/* Header */}
      <div style={{ textAlign: 'center', padding: '6px 0' }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--green)', letterSpacing: '0.15em', marginBottom: 4 }}>
          TRADE CONFIRMED ✓
        </div>
        <div style={{ fontSize: 16, fontWeight: 900, color: isBuy ? 'var(--green)' : 'var(--red)', letterSpacing: '0.1em' }}>
          {isBuy ? 'BOUGHT' : 'SOLD'} {tokenSymbol}
        </div>
      </div>

      <PixelDivider />

      {/* Summary */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 10 }}>
          <span style={{ color: 'var(--text-dim)' }}>AMOUNT</span>
          <span style={{ fontWeight: 800, color: 'var(--text-bright)' }}>{tokenAmount} {tokenSymbol}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 10 }}>
          <span style={{ color: 'var(--text-dim)' }}>EXECUTION PRICE</span>
          <span style={{ fontWeight: 800, color: 'var(--text-bright)' }}>${executionPrice < 0.01 ? executionPrice.toExponential(4) : executionPrice.toFixed(6)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 10 }}>
          <span style={{ color: 'var(--text-dim)' }}>TOTAL VALUE</span>
          <span style={{ fontWeight: 800, color: 'var(--text-bright)' }}>{formatUsd(amountUsd)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 10 }}>
          <span style={{ color: 'var(--text-dim)' }}>CHAIN</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: chain?.color }}><ChainIcon chainId={chainId} size={12} />{chain?.name}</span>
        </div>
      </div>

      <PixelDivider />

      {/* Fees */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 9 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-dim)' }}>BSTONKEX FEE (0.40%)</span>
          <span>${platformFee}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-dim)' }}>REFERRAL ALLOC</span>
          <span style={{ color: 'var(--text-muted)' }}>${(parseFloat(platformFee || '0') * 0.3).toFixed(4)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-dim)' }}>DEX FEE</span>
          <span>${dexFee}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-dim)' }}>NETWORK FEE</span>
          <span>~${networkFee}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-dim)' }}>PRICE IMPACT</span>
          <span style={{ color: priceImpact > 3 ? 'var(--red)' : 'var(--green)' }}>{priceImpact.toFixed(2)}%</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-dim)' }}>SLIPPAGE</span>
          <span>{slippage}%</span>
        </div>
        {route.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>ROUTE</span>
            <span style={{ fontSize: 8 }}>{route.join(' → ')}</span>
          </div>
        )}
      </div>

      <PixelDivider />

      {/* TX Hash */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 9 }}>
        <span style={{ color: 'var(--text-dim)' }}>TX HASH</span>
        <a href={explorerTxUrl(chainId, txHash)} target="_blank" rel="noopener"
          style={{ color: 'var(--cyan)', textDecoration: 'underline', fontWeight: 700 }}>
          {shortenAddress(txHash, 6)}
        </a>
        <button className="copy-btn" style={{ fontSize: 7 }} onClick={() => navigator.clipboard.writeText(txHash)}>COPY</button>
      </div>
      <a href={explorerTxUrl(chainId, txHash)} target="_blank" rel="noopener"
        style={{ fontSize: 7, color: 'var(--cyan)', padding: '2px 0' }}>
        VIEW ON {chain?.explorerName?.toUpperCase() || 'EXPLORER'} ↗
      </a>
      <div style={{ fontSize: 7, color: 'var(--text-muted)', padding: '2px 0' }}>
        Values shown are actual confirmed results from blockchain execution.
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button className="btn btn-sm btn-full" onClick={onClose} style={{ fontSize: 9 }}>CLOSE</button>
        <button className="btn btn-sm btn-full btn-cyan" onClick={onViewPosition} style={{ fontSize: 9 }}>VIEW POSITION</button>
        <button className={`btn btn-sm btn-full ${isBuy ? 'btn-green' : 'btn-red'}`} onClick={onTradeAgain} style={{ fontSize: 9 }}>
          TRADE AGAIN
        </button>
      </div>
    </div>
  );
}