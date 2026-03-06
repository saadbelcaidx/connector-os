/**
 * useLeaderboard — Fetches operator leaderboard from get_leaderboard() RPC
 *
 * Enriches each row with computeTier() from executionTier.ts.
 * No Realtime — manual refresh via refresh().
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { computeTier, type ExecutionTier } from '../lib/executionTier';

export interface LeaderboardEntry {
  operator_id: string;
  display_name: string;
  total_sent: number;
  first_sent_at: string | null;
  last_sent_at: string | null;
  sent_7d: number;
  sent_30d: number;
  tier: ExecutionTier;
}

export function useLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc('get_leaderboard');

    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    const enriched: LeaderboardEntry[] = (data || []).map((row: any) => ({
      operator_id: row.operator_id,
      display_name: row.display_name,
      total_sent: row.total_sent,
      first_sent_at: row.first_sent_at,
      last_sent_at: row.last_sent_at,
      sent_7d: row.sent_7d,
      sent_30d: row.sent_30d,
      tier: computeTier(row.total_sent, row.first_sent_at),
    }));

    setEntries(enriched);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { entries, loading, error, refresh: fetch };
}
