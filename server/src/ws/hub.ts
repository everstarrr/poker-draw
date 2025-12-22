import { WebSocketServer, WebSocket } from 'ws';
import { db } from '../config/database.js';

type Client = WebSocket & { email?: string; gameId?: string };

interface GameRoom {
  clients: Set<Client>;
  timer?: NodeJS.Timeout;
  tick?: NodeJS.Timeout;
  deadline?: number | null;
  winnerAnnounced?: boolean;
  hadTwoPlayers?: boolean;
}

const rooms = new Map<string, GameRoom>();

function getRoom(gameId: string): GameRoom {
  let room = rooms.get(gameId);
  if (!room) {
    room = { clients: new Set(), deadline: null, hadTwoPlayers: false };
    rooms.set(gameId, room);
  }
  return room;
}

async function ensureBlinds(gameId: string) {
  try {
    const cntRows = await db.query('SELECT COUNT(*)::int AS cnt FROM players WHERE game_id=$1', [gameId]);
    const cnt: number = Number(cntRows?.[0]?.cnt ?? 0);
    if (cnt < 2) return;
    const flagRows = await db.query('SELECT blinds_posted FROM games WHERE id=$1', [gameId]);
    const posted: boolean = !!flagRows?.[0]?.blinds_posted;
    if (!posted) {
      await db.query('SELECT apply_blinds($1) as result', [gameId]);
    }
  } catch (e) {
    console.error('[WS] ensureBlinds failed', e);
  }
}

// Public wrapper for controllers
export async function ensureBlindsPublic(gameId: string) {
  await ensureBlinds(gameId);
}

async function broadcastState(gameId: string) {
  try {
    const room = getRoom(gameId);
    for (const ws of room.clients) {
      if (ws.readyState !== ws.OPEN) continue;
      const email = ws.email || null;
      let res;
      if (email) {
        res = await db.query('SELECT get_game_state_for_email($1, $2) as result', [gameId, email]);
      } else {
        res = await db.query('SELECT get_game_state_public($1) as result', [gameId]);
      }
      const gameState = res[0]?.result || null;
      const payload = JSON.stringify({ type: 'state', gameId, deadline: room.deadline || null, state: gameState });
      ws.send(payload);
    }
    // If phase is showdown and winner not yet announced, announce immediately
    try {
      const playersCount = await getPlayersCount(gameId);
      const phaseRows = await db.query('SELECT phase FROM games WHERE id = $1', [gameId]);
      const phase = phaseRows?.[0]?.phase || null;
      if (phase === 'showdown' && !room.winnerAnnounced && playersCount >= 2) {
        room.winnerAnnounced = true;
        const winRes = await db.query('SELECT determine_winner($1) as result', [gameId]);
        let winnerId: string | null = winRes?.[0]?.result?.winner_id || null;
        let winnerEmail: string | null = winRes?.[0]?.result?.winner_email || null;
        if (!winnerEmail && winnerId) {
          const emailRows = await db.query('SELECT email FROM players WHERE id = $1', [winnerId]);
          winnerEmail = emailRows?.[0]?.email || null;
        }
        // Ensure winnerId refers to players.id so client can match player.id
        if (!winnerId && winnerEmail) {
          const pidRows = await db.query('SELECT id FROM players WHERE game_id = $1 AND lower(email) = lower($2) ORDER BY id DESC LIMIT 1', [gameId, winnerEmail]);
          winnerId = pidRows?.[0]?.id || null;
        }
        const winPayload = JSON.stringify({ type: 'winner', gameId, winner: { id: winnerId, email: winnerEmail } });
        for (const ws of room.clients) { if (ws.readyState === ws.OPEN) ws.send(winPayload); }
        // Keep 7s delay before new round
        setTimeout(async () => {
          try {
            await db.query('SELECT new_round($1) as result', [gameId]);
            room.winnerAnnounced = false;
            try { await db.query('SELECT deal_cards($1) as result', [gameId]); } catch {}
            await ensureBlinds(gameId);
            await broadcastState(gameId);
            await startTurnTimer(gameId, 30);
          } catch (e) { console.error('[WS] new round after showdown (broadcastState) failed', e); }
        }, 7000);
      }
      // Additionally, if only one active (non-fold) player remains, settle and announce winner
      try {
        const rows = await db.query('SELECT id, status, email FROM players WHERE game_id = $1', [gameId]);
        const active = rows.filter((r: any) => r.status !== 'FOLD');
        if (active.length === 1 && !room.winnerAnnounced) {
          // Allow announcing if the round had two players at any point
          const totalCnt = await getPlayersCount(gameId);
          if (totalCnt < 2 && !room.hadTwoPlayers) { await maybeStopGame(gameId); return; }
          // Only settle if there is any money to award (bets or pot)
          const betSumRows = await db.query(
            'SELECT COALESCE(SUM(b.amount),0) AS s FROM bets b JOIN players p ON p.id=b.player_id WHERE p.game_id=$1',
            [gameId]
          );
          const betSum: number = Number(betSumRows?.[0]?.s ?? 0);
          const potRows = await db.query('SELECT COALESCE(pot,0) AS pot FROM games WHERE id=$1', [gameId]);
          const potVal: number = Number(potRows?.[0]?.pot ?? 0);
          room.winnerAnnounced = true;
          const winnerId = active[0].id;
          const winnerEmail = active[0].email || null;
          // Move current bets into pot, award to winner, clear bets and pot
          try {
            await db.query(
              'UPDATE games g SET pot = COALESCE(g.pot,0) + (SELECT COALESCE(SUM(b.amount),0) FROM bets b JOIN players p ON p.id=b.player_id WHERE p.game_id=$1) WHERE g.id=$1',
              [gameId]
            );
            await db.query('UPDATE bets SET amount=0 WHERE player_id IN (SELECT id FROM players WHERE game_id=$1)', [gameId]);
            const potAfterRows = await db.query('SELECT COALESCE(pot,0) AS pot FROM games WHERE id=$1', [gameId]);
            const potAfter: number = Number(potAfterRows?.[0]?.pot ?? 0);
            if (potAfter > 0) {
              await db.query('UPDATE players SET stack = stack + $2 WHERE id = $1', [winnerId, potAfter]);
              await db.query('UPDATE games SET pot = 0 WHERE id = $1', [gameId]);
            }
          } catch (e) {
            console.error('[WS] settle last-active player failed', e);
          }
          const winPayload = JSON.stringify({ type: 'winner', gameId, winner: { id: winnerId, email: winnerEmail } });
          for (const ws of room.clients) { if (ws.readyState === ws.OPEN) ws.send(winPayload); }
          // Start a new round only if there will be at least two players
          const cntRows = await db.query('SELECT COUNT(*)::int AS cnt FROM players WHERE game_id=$1', [gameId]);
          const cnt: number = Number(cntRows?.[0]?.cnt ?? 0);
          if (cnt >= 2) {
            setTimeout(async () => {
              try {
                await db.query('SELECT new_round($1) as result', [gameId]);
                room.winnerAnnounced = false;
                room.hadTwoPlayers = false;
                try { await db.query('SELECT deal_cards($1) as result', [gameId]); } catch {}
                await ensureBlinds(gameId);
                await broadcastState(gameId);
                await startTurnTimer(gameId, 30);
              } catch (e) { console.error('[WS] new round after last-fold failed', e); }
            }, 7000);
          }
        }
      } catch {}
    } catch {}
  } catch (err) {
    console.error('[WS] broadcastState error', err);
  }
}

function clearTimers(room: GameRoom) {
  if (room.timer) { clearTimeout(room.timer); room.timer = undefined; }
  if (room.tick) { clearInterval(room.tick); room.tick = undefined; }
  room.deadline = null;
}

function broadcastTimer(gameId: string, remaining: number) {
  const room = getRoom(gameId);
  const payload = JSON.stringify({ type: 'timer', gameId, remaining });
  for (const ws of room.clients) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

async function getPlayersCount(gameId: string): Promise<number> {
  try {
    const rows = await db.query('SELECT COUNT(*)::int AS cnt FROM players WHERE game_id = $1', [gameId]);
    return rows?.[0]?.cnt ?? 0;
  } catch {
    return 0;
  }
}

async function maybeStopGame(gameId: string) {
  try {
    const cnt = await getPlayersCount(gameId);
    const room = getRoom(gameId);
    if (cnt <= 1) {
      // Stop timers and clear active turn
      clearTimers(room);
      room.winnerAnnounced = false;
      try {
        await db.query('UPDATE games SET current_player_id = NULL, turn_start_time = NULL WHERE id = $1', [gameId]);
      } catch {}
      await broadcastState(gameId);
    }
  } catch (err) {
    console.error('[WS] maybeStopGame error', err);
  }
}

export async function startTurnTimer(gameId: string, seconds = 30) {
  const room = getRoom(gameId);
  clearTimers(room);
  room.winnerAnnounced = false;
  // Do not start timer if players are 0 or 1
  const playersCount = await getPlayersCount(gameId);
  if (playersCount <= 1) {
    await maybeStopGame(gameId);
    return;
  }
  // Mark that this round had at least 2 players
  room.hadTwoPlayers = true;
  // Ensure DB-reported max_turn_time is 30s and set turn_start_time to now so clients display correctly
  try { await db.query('UPDATE games SET max_turn_time = 30, turn_start_time = NOW() WHERE id = $1', [gameId]); } catch {}
  // Prefer DB value for seconds if available
  try {
    const trows = await db.query('SELECT COALESCE(max_turn_time, 30) AS t FROM games WHERE id=$1', [gameId]);
    const t: number = Number(trows?.[0]?.t ?? 30);
    if (Number.isFinite(t) && t > 0) seconds = t;
  } catch {}
  const end = Date.now() + (seconds * 1000);
  room.deadline = end;
  broadcastTimer(gameId, seconds);
  room.tick = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    broadcastTimer(gameId, remaining);
  }, 1000);
  room.timer = setTimeout(async () => {
    clearTimers(room);
    // On timeout, auto-handle: prefer server-side timeout logic (should fold)
    try {
      try {
        // Prefer a specific timeout function if present
        await db.query('SELECT check_turn_timeout($1) as result', [gameId]);
        // After advancing, check if phase progressed to showdown
        try {
          const phaseRows = await db.query('SELECT phase FROM games WHERE id = $1', [gameId]);
          const phase = phaseRows?.[0]?.phase || null;
          if (phase === 'showdown') {
            // Require at least two players to announce a showdown winner
            const pc = await getPlayersCount(gameId);
            const room = getRoom(gameId);
            if (pc < 2 && !room.hadTwoPlayers) { await maybeStopGame(gameId); return; }
            const winRes = await db.query('SELECT determine_winner($1) as result', [gameId]);
            let winnerId: string | null = winRes?.[0]?.result?.winner_id || null;
            let winnerEmail: string | null = winRes?.[0]?.result?.winner_email || null;
            if (!winnerEmail && winnerId) {
              const emailRows = await db.query('SELECT email FROM players WHERE id = $1', [winnerId]);
              winnerEmail = emailRows?.[0]?.email || null;
            }
            if (!winnerId && winnerEmail) {
              const pidRows = await db.query('SELECT id FROM players WHERE game_id = $1 AND lower(email) = lower($2) ORDER BY id DESC LIMIT 1', [gameId, winnerEmail]);
              winnerId = pidRows?.[0]?.id || null;
            }
            const payload = JSON.stringify({ type: 'winner', gameId, winner: { id: winnerId, email: winnerEmail } });
            const room = getRoom(gameId);
            for (const ws of room.clients) { if (ws.readyState === ws.OPEN) ws.send(payload); }
            setTimeout(async () => {
              try {
                await db.query('SELECT new_round($1) as result', [gameId]);
                try { await db.query('SELECT deal_cards($1) as result', [gameId]); } catch {}
                await ensureBlinds(gameId);
                await broadcastState(gameId);
                await startTurnTimer(gameId, seconds);
              } catch (e) { console.error('[WS] showdown new round failed', e); }
            }, 7000);
            return;
          }
        } catch {}
      } catch {
        // If only one active player remains, declare winner and start new round
        try {
          const rows = await db.query('SELECT id, status FROM players WHERE game_id = $1', [gameId]);
          const active = rows.filter((r: any) => r.status !== 'FOLD');
          if (active.length === 1) {
            const pc = await getPlayersCount(gameId);
            if (pc < 2) { await maybeStopGame(gameId); return; }
            const winRes = await db.query('SELECT determine_winner($1) as result', [gameId]);
            const winnerId = winRes?.[0]?.result?.winner_id || active[0].id;
            const emailRows = await db.query('SELECT email FROM players WHERE id = $1', [winnerId]);
            const winnerEmail = emailRows?.[0]?.email || null;
            const payload = JSON.stringify({ type: 'winner', gameId, winner: { id: winnerId, email: winnerEmail } });
            const room = getRoom(gameId);
            for (const ws of room.clients) { if (ws.readyState === ws.OPEN) ws.send(payload); }
            setTimeout(async () => {
              try {
                await db.query('SELECT new_round($1) as result', [gameId]);
                try { await db.query('SELECT deal_cards($1) as result', [gameId]); } catch {}
                await ensureBlinds(gameId);
                await broadcastState(gameId);
                await startTurnTimer(gameId, seconds);
              } catch (e) { console.error('[WS] new round after last-fold failed', e); }
            }, 7000);
            return;
          }
        } catch {}
        // Fallback: still progress to next turn if timeout helper is absent
        try { await db.query('SELECT next_turn($1) as result', [gameId]); } catch {}
      }
    } catch (e) {
      console.error('[WS] turn timeout advance failed', e);
    }
    await broadcastState(gameId);
    // Start next player's timer again
    startTurnTimer(gameId, seconds).catch(() => {});
  }, seconds * 1000);
}

async function maybeAutoStart(gameId: string) {
  const playersCount = await getPlayersCount(gameId);
  if (playersCount < 2) {
    // Not enough players to run the timer; keep room idle
    await maybeStopGame(gameId);
    return;
  }
  try {
    // Mark two-player presence for this round
    const room = getRoom(gameId);
    room.hadTwoPlayers = true;
    // Attempt to start game; ignore if already started
    try { await db.query('SELECT start_game($1) as result', [gameId]); } catch {}
    // Ensure cards are dealt (idempotent)
    try { await db.query('SELECT deal_cards($1) as result', [gameId]); } catch {}
    // Ensure blinds at the beginning of the round (idempotent)
    await ensureBlinds(gameId);
    // Do not immediately new_round; start_game deals cards
    await broadcastState(gameId);
    await startTurnTimer(gameId, 30);
  } catch (err) {
    console.error('[WS] maybeAutoStart error', err);
  }
}

export function bindWebSocketServer(wss: WebSocketServer) {
  wss.on('connection', async (ws: Client, req) => {
    try {
      const url = new URL(req.url || '/ws', 'http://localhost');
      const gameId = url.searchParams.get('game_id') || 'unknown';
      const email = url.searchParams.get('email') || 'anonymous';
      ws.gameId = gameId;
      ws.email = email;
      const room = getRoom(gameId);
      room.clients.add(ws);
      console.log('[WS] connected', { gameId, email, clients: room.clients.size });

      ws.on('message', (data) => {
        // Placeholder for future action handling
        // Expect messages like { type: 'action', action: 'fold' | 'check' | 'call' | 'raise' | 'replace', ... }
        // For now, ignore.
      });

      ws.on('close', () => {
        const r = getRoom(gameId);
        r.clients.delete(ws);
            startTurnTimer(gameId).catch(() => {});
        if (r.clients.size === 0) {
          clearTimers(r);
        }
        // Stop game if no or single player remains
        maybeStopGame(gameId).catch(() => {});
      });

      ws.on('error', (err) => console.error('[WS] client error', err));

      // Initial state push
      await broadcastState(gameId);
      await maybeAutoStart(gameId);
    } catch (err) {
      console.error('[WS] connection handler error', err);
      try { ws.close(); } catch {}
    }
  });
}
// External helpers to push updates from HTTP controllers
export async function pushGameState(gameId: string) {
  await broadcastState(gameId);
}

export async function checkAndHandleWinner(gameId: string, seconds = 30) {
  try {
    const room = getRoom(gameId);
    // If fewer than 2 players remain and this round never had >=2 players, do not announce
    const totalRows = await db.query('SELECT COUNT(*)::int AS cnt FROM players WHERE game_id = $1', [gameId]);
    const totalCnt: number = Number(totalRows?.[0]?.cnt ?? 0);
    if (totalCnt < 2 && !room.hadTwoPlayers) return;
    const rows = await db.query('SELECT id, status, email FROM players WHERE game_id = $1', [gameId]);
    const active = rows.filter((r: any) => r.status !== 'FOLD');
    if (active.length === 1) {
      room.winnerAnnounced = true;
      const winnerId = active[0].id;
      const winnerEmail = active[0].email || null;
      // Move current bets into pot, award to winner, clear bets and pot
      try {
        await db.query(
          'UPDATE games g SET pot = COALESCE(g.pot,0) + (SELECT COALESCE(SUM(b.amount),0) FROM bets b JOIN players p ON p.id=b.player_id WHERE p.game_id=$1) WHERE g.id=$1',
          [gameId]
        );
        await db.query('UPDATE bets SET amount=0 WHERE player_id IN (SELECT id FROM players WHERE game_id=$1)', [gameId]);
        const potAfterRows = await db.query('SELECT COALESCE(pot,0) AS pot FROM games WHERE id=$1', [gameId]);
        const potAfter: number = Number(potAfterRows?.[0]?.pot ?? 0);
        if (potAfter > 0) {
          await db.query('UPDATE players SET stack = stack + $2 WHERE id = $1', [winnerId, potAfter]);
          await db.query('UPDATE games SET pot = 0 WHERE id = $1', [gameId]);
        }
      } catch (e) {
        console.error('[WS] settle last-active player (check) failed', e);
      }
      const payload = JSON.stringify({ type: 'winner', gameId, winner: { id: winnerId, email: winnerEmail } });
      for (const ws of room.clients) { if (ws.readyState === ws.OPEN) ws.send(payload); }
      // Start a new round only if there will be at least two players
      const cntRows = await db.query('SELECT COUNT(*)::int AS cnt FROM players WHERE game_id=$1', [gameId]);
      const cnt: number = Number(cntRows?.[0]?.cnt ?? 0);
      if (cnt >= 2) {
        setTimeout(async () => {
          try {
            await db.query('SELECT new_round($1) as result', [gameId]);
            room.winnerAnnounced = false;
            room.hadTwoPlayers = false;
            try { await db.query('SELECT deal_cards($1) as result', [gameId]); } catch {}
            await ensureBlinds(gameId);
            await broadcastState(gameId);
            await startTurnTimer(gameId);
          } catch (e) { console.error('[WS] winner new round failed', e); }
        }, 7000);
      }
    }
  } catch (e) {
    console.error('[WS] checkAndHandleWinner error', e);
  }
}
