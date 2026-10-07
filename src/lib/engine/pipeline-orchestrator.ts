// BSTONKEX Pipeline Orchestrator — Central coordinator for all engines
// Manages startup order, data flow, health checks, and graceful shutdown.
// Flow: Blockchain → RPC/WS → Chain Adapter → Normalizer → Cache → EventBus → Terminal

import type { ChainId } from '../config';
import { CONFIGURED_CHAINS } from '../config';
import { reportSuccess, reportError, reportStatus, reportCacheStats, onHealthUpdate, type InfraHealthReport, type ComponentStatus } from './infra-health';
import { startMarketPipeline, stopMarketPipeline, getMarketPipelineStatus } from './market-pipeline';
import { startActivityPolling, stopActivityPolling, getActivityStatus } from './activity-engine';
import { cacheStats } from './cache';

// ── Pipeline State ───────────────────────────────────────────

export type PipelinePhase = 'idle' | 'initializing' | 'running' | 'degraded' | 'shutting_down' | 'error';

export interface PipelineState {
  phase: PipelinePhase;
  startedAt: number | null;
  engines: { name: string; status: ComponentStatus; error?: string }[];
  lastHealthCheck: number;
  uptime: number;
}

let state: PipelineState = {
  phase: 'idle',
  startedAt: null,
  engines: [],
  lastHealthCheck: 0,
  uptime: 0,
};

let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
let stateListeners: ((s: PipelineState) => void)[] = [];

function emitState() {
  stateListeners.forEach(l => l({ ...state }));
}

// ── Engine Registration ──────────────────────────────────────

interface EngineDef {
  name: string;
  start: () => Promise<void> | void;
  stop: () => Promise<void> | void;
  getStatus: () => { status: ComponentStatus; error?: string };
}

const engines: EngineDef[] = [];

export function registerEngine(def: EngineDef) {
  engines.push(def);
}

// ── Startup ──────────────────────────────────────────────────

export async function startPipeline(): Promise<void> {
  if (state.phase === 'running' || state.phase === 'initializing') return;

  state.phase = 'initializing';
  state.startedAt = Date.now();
  state.engines = engines.map(e => ({ name: e.name, status: 'reconnecting' as ComponentStatus }));
  emitState();

  // Start engines in order
  for (let i = 0; i < engines.length; i++) {
    const engine = engines[i];
    try {
      await engine.start();
      state.engines[i] = { name: engine.name, status: 'live' };
      reportStatus(`engine:${engine.name}`, 'live');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      state.engines[i] = { name: engine.name, status: 'error', error: msg };
      reportError(`engine:${engine.name}`, msg);
    }
    emitState();
  }

  // Start market pipeline
  try {
    startMarketPipeline();
    reportStatus('pipeline', 'live');
  } catch (err) {
    reportError('pipeline', err instanceof Error ? err.message : String(err));
  }

  // Start activity polling
  try {
    startActivityPolling();
  } catch { /* non-critical */ }

  // Determine final phase
  const hasError = state.engines.some(e => e.status === 'error');
  state.phase = hasError ? 'degraded' : 'running';
  emitState();

  // Start periodic health checks
  healthCheckTimer = setInterval(runHealthCheck, 30_000);
  runHealthCheck();
}

// ── Shutdown ─────────────────────────────────────────────────

export async function stopPipeline(): Promise<void> {
  if (state.phase === 'idle') return;
  state.phase = 'shutting_down';
  emitState();

  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }

  stopMarketPipeline();
  stopActivityPolling();

  for (let i = engines.length - 1; i >= 0; i--) {
    try { await engines[i].stop(); } catch { /* best-effort */ }
    state.engines[i].status = 'offline';
    emitState();
  }

  state.phase = 'idle';
  state.startedAt = null;
  emitState();
}

// ── Health Check ──────────────────────────────────────────────

function runHealthCheck() {
  state.lastHealthCheck = Date.now();
  if (state.startedAt) state.uptime = Date.now() - state.startedAt;

  // Update engine statuses
  for (let i = 0; i < engines.length; i++) {
    const { status, error } = engines[i].getStatus();
    state.engines[i] = { name: engines[i].name, status, error };
  }

  // Report cache stats
  const stats = cacheStats();
  reportCacheStats(stats.hits, stats.misses, stats.size);

  emitState();
}

// ── Public API ────────────────────────────────────────────────

export function getPipelineState(): PipelineState {
  return { ...state, uptime: state.startedAt ? Date.now() - state.startedAt : 0 };
}

export function onPipelineState(cb: (s: PipelineState) => void): () => void {
  stateListeners.push(cb);
  return () => { stateListeners = stateListeners.filter(l => l !== cb); };
}

export function isPipelineReady(): boolean {
  return state.phase === 'running' || state.phase === 'degraded';
}

// ── Register Default Engines ─────────────────────────────────

registerEngine({
  name: 'market-pipeline',
  start: () => {},  // Started separately above
  stop: () => stopMarketPipeline(),
  getStatus: () => {
    const mpStatus = getMarketPipelineStatus();
    return { status: mpStatus.running ? 'live' : 'offline', error: mpStatus.error };
  },
});

registerEngine({
  name: 'activity-engine',
  start: () => {},
  stop: () => stopActivityPolling(),
  getStatus: () => {
    const aStatus = getActivityStatus();
    return { status: aStatus.running ? 'live' : 'offline' };
  },
});