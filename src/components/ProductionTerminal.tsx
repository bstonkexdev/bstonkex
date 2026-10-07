// BSTONKEX Production Terminal — Root terminal component
// Initializes pipeline, manages connection state, routes data to child components
import { useEffect, useState } from 'react';
import { startPipeline, stopPipeline, getPipelineState, onPipelineState, type PipelineState } from '../lib/engine/pipeline-orchestrator';
import { startWsGateway, stopWsGateway } from '../lib/engine/ws-gateway';
import TerminalStatusBar from './TerminalStatusBar';

interface Props {
  children: React.ReactNode;
}

export default function ProductionTerminal({ children }: Props) {
  const [pipeline, setPipeline] = useState<PipelineState>(getPipelineState());
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const unsub = onPipelineState(setPipeline);
    return unsub;
  }, []);

  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      startWsGateway();
      startPipeline().catch(console.error);
    }
    return () => {
      stopWsGateway();
      stopPipeline();
    };
  }, [initialized]);

  return (
    <>
      {children}
      <TerminalStatusBar />
    </>
  );
}