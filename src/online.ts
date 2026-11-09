import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { game } from './game.js';

// 1v1 over Supabase Realtime broadcast: one channel per 4-letter room code.
// Each player throws in their own room and sees the other's results (PRD: compare results, not paths).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const ONLINE_THROWS = 5;

export const online = {
  enabled: !!(url && key),
  code: '',
  host: false,
  status: 'off' as 'off' | 'waiting' | 'connected' | 'error',
  oppScore: 0,
  oppThrows: 0,
};

const me = Math.random().toString(36).slice(2, 8); // anonymous per-tab id, no accounts
let client: SupabaseClient | undefined;
let channel: RealtimeChannel | undefined;

const randomCode = () => {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I / O
  return Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
};

/** ?host=1 creates a room; ?room=ABCD joins one. Nothing happens without those (solo play needs no backend). */
export function startOnline() {
  const q = new URLSearchParams(location.search);
  const join = q.get('room')?.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (!online.enabled || (!join && !q.has('host'))) return;
  online.host = !join;
  online.code = join || randomCode();
  online.status = 'waiting';
  game.dirty = true;
  try {
    client = createClient(url!, key!);
    channel = client.channel(`room:${online.code}`, { config: { presence: { key: me } } });
    channel
      .on('presence', { event: 'sync' }, () => {
        const n = Object.keys(channel!.presenceState()).length;
        const was = online.status;
        online.status = n >= 2 ? 'connected' : 'waiting';
        if (online.status === 'connected' && was !== 'connected') game.startOnline(ONLINE_THROWS);
        game.dirty = true;
      })
      .on('broadcast', { event: 'throw' }, ({ payload }) => {
        if (payload.from === me) return;
        online.oppScore = payload.score;
        online.oppThrows = payload.n;
        game.dirty = true;
      })
      .subscribe(async (s) => {
        if (s === 'SUBSCRIBED') await channel!.track({ at: Date.now() });
        if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { online.status = 'error'; game.dirty = true; }
      });
  } catch {
    online.status = 'error';
  }
}

/** Tell the opponent how this throw went (a few bytes, not the whole path). */
export function sendThrow(n: number, points: number, bounces: number, score: number) {
  if (online.status !== 'connected') return;
  void channel?.send({ type: 'broadcast', event: 'throw', payload: { from: me, n, points, bounces, score } });
}

/** Save finished runs: best score + the run as a ghost. Fails quietly; solo play never depends on it. */
export async function saveRun(mode: string, score: number, points: number[]) {
  if (!online.enabled) return;
  try {
    client ??= createClient(url!, key!);
    await client.from('best_scores').insert({ player_name: 'Player', mode, score });
    await client.from('ghost_runs').insert({ player_name: 'Player', layout: mode, throws: points, total_score: score });
  } catch {}
}
