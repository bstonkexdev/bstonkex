// Cupcak8 Swap — Trade Page (4-pane trading workspace)
import { useState, useEffect } from 'react';
import { useApp } from '../../lib/context';
import { getDiscovery, type MarketToken } from '../../lib/market-discovery';
import GlobalTicker from '../GlobalTicker';
import ActivePairHeader from './ActivePairHeader';
import MarketOverviewPane from './MarketOverviewPane';
import TradingChartPane from './TradingChartPane';
import OrderBookPane from './OrderBookPane';
import ExecutionPane from './ExecutionPane';
import BottomDock from './BottomDock';

export default function TerminalPage() {
  const { tradeToken, setTradeTokenOnly } = useApp();
  const [tokens, setTokens] = useState<MarketToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MarketToken | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    setLoading(true);
    getDiscovery('volume').then(data => {
      setTokens(data);
      if (!selected && data.length > 0) {
        setSelected(data[0]);
        if (!tradeToken) {
          setTradeTokenOnly({
            chainId: data[0].chainId,
            address: data[0].address,
            name: data[0].name,
            symbol: data[0].symbol,
          });
        }
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tradeToken) {
      const match = tokens.find(
        t => t.address === tradeToken.address && t.chainId === tradeToken.chainId
      );
      if (match) setSelected(match);
    }
  }, [tradeToken, tokens]);

  const handleSelect = (t: MarketToken) => {
    setSelected(t);
    setTradeTokenOnly({ chainId: t.chainId, address: t.address, name: t.name, symbol: t.symbol });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <GlobalTicker tokens={tokens} />
      <ActivePairHeader token={selected} />

      <div className="terminal-grid" style={{ flex: 1, minHeight: 0 }}>
        {/* Left: Market Overview */}
        <div className="pane-market terminal-pane">
          <MarketOverviewPane tokens={tokens} loading={loading} onSelect={handleSelect} />
        </div>

        {/* Middle-Left: Chart */}
        <div className="pane-chart terminal-pane">
          <TradingChartPane token={selected} fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen(!fullscreen)} />
        </div>

        {/* Middle-Right: Order Book */}
        <div className="pane-orderbook terminal-pane">
          <OrderBookPane token={selected} />
        </div>

        {/* Far Right: Execution */}
        <ExecutionPane token={selected} />

        {/* Bottom Dock */}
        <BottomDock />
      </div>
    </div>
  );
}