// React hook for reward data — auth state + backend fetching
import { useState, useEffect, useCallback } from 'react';
import {
  fetchSummary, fetchCashback, fetchReferrals, fetchClaims,
  isAuthenticated, logout as apiLogout,
} from './reward-api';
import type {
  BackendRewardSummary, CashbackRecord, ReferralRecord, ClaimRecord, LoadState,
} from './reward-types';

export interface RewardsState {
  authState: 'unauthenticated' | 'authenticated';
  summary: BackendRewardSummary | null;
  cashback: CashbackRecord[];
  referrals: ReferralRecord[];
  claims: ClaimRecord[];
  summaryState: LoadState;
  cashbackState: LoadState;
  referralsState: LoadState;
  claimsState: LoadState;
  error: string | null;
}

export function useRewards() {
  const [state, setState] = useState<RewardsState>({
    authState: isAuthenticated() ? 'authenticated' : 'unauthenticated',
    summary: null, cashback: [], referrals: [], claims: [],
    summaryState: 'idle', cashbackState: 'idle', referralsState: 'idle', claimsState: 'idle',
    error: null,
  });

  const loadSummary = useCallback(async () => {
    if (!isAuthenticated()) return;
    setState(s => ({ ...s, summaryState: 'loading', error: null }));
    try {
      const summary = await fetchSummary();
      setState(s => ({ ...s, summary, summaryState: 'loaded' }));
    } catch (e: any) {
      setState(s => ({ ...s, summaryState: 'error', error: e.message }));
    }
  }, []);

  const loadCashback = useCallback(async () => {
    if (!isAuthenticated()) return;
    setState(s => ({ ...s, cashbackState: 'loading' }));
    try {
      const cashback = await fetchCashback();
      setState(s => ({ ...s, cashback, cashbackState: 'loaded' }));
    } catch (e: any) {
      setState(s => ({ ...s, cashbackState: 'error', error: e.message }));
    }
  }, []);

  const loadReferrals = useCallback(async () => {
    if (!isAuthenticated()) return;
    setState(s => ({ ...s, referralsState: 'loading' }));
    try {
      const referrals = await fetchReferrals();
      setState(s => ({ ...s, referrals, referralsState: 'loaded' }));
    } catch (e: any) {
      setState(s => ({ ...s, referralsState: 'error', error: e.message }));
    }
  }, []);

  const loadClaims = useCallback(async () => {
    if (!isAuthenticated()) return;
    setState(s => ({ ...s, claimsState: 'loading' }));
    try {
      const claims = await fetchClaims();
      setState(s => ({ ...s, claims, claimsState: 'loaded' }));
    } catch (e: any) {
      setState(s => ({ ...s, claimsState: 'error', error: e.message }));
    }
  }, []);

  const loadAll = useCallback(() => {
    loadSummary(); loadCashback(); loadReferrals(); loadClaims();
  }, [loadSummary, loadCashback, loadReferrals, loadClaims]);

  const logout = useCallback(() => {
    apiLogout();
    setState({
      authState: 'unauthenticated',
      summary: null, cashback: [], referrals: [], claims: [],
      summaryState: 'idle', cashbackState: 'idle', referralsState: 'idle', claimsState: 'idle',
      error: null,
    });
  }, []);

  const onAuthSuccess = useCallback(() => {
    setState(s => ({ ...s, authState: 'authenticated' }));
    loadAll();
  }, [loadAll]);

  // Auto-load if already authenticated
  useEffect(() => {
    if (isAuthenticated()) loadAll();
  }, [loadAll]);

  return { ...state, loadAll, loadSummary, loadCashback, loadReferrals, loadClaims, logout, onAuthSuccess };
}
