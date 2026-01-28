import { db } from '../config/database.js';
import { gameLog } from '../utils/gameLogger.js';
const rooms = new Map();
function getRoom(gameId) {
    let room = rooms.get(gameId);
    if (!room) {
        room = { clients: new Set(), deadline: null, hadTwoPlayers: false, waiting: new Map() };
        rooms.set(gameId, room);
    }
    return room;
}
function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}
function getWaiting(room) {
    if (!room.waiting)
        room.waiting = new Map();
    return room.waiting;
}
export function queueWaitingPlayer(gameId, email, buyIn) {
    const room = getRoom(gameId);
    const waiting = getWaiting(room);
    const key = normalizeEmail(email);
    waiting.set(key, { email, buyIn: Number(buyIn) || 0 });
    gameLog('WAITING_QUEUE', 'Queued player for next round', { gameId, email: key, buyIn: Number(buyIn) || 0 });
}
export function isWaitingPlayer(gameId, email) {
    const room = rooms.get(gameId);
    if (!room?.waiting)
        return false;
    return room.waiting.has(normalizeEmail(email));
}
async function addWaitingPlayers(gameId) {
    const room = getRoom(gameId);
    const waiting = getWaiting(room);
    if (waiting.size === 0)
        return 0;
    const entries = Array.from(waiting.entries());
    const remaining = new Map();
    let added = 0;
    for (const [key, entry] of entries) {
        const buyIn = Math.max(0, Number(entry.buyIn) || 0);
        try {
            const res = await db.query('SELECT join_game($1, $2, $3) as result', [gameId, entry.email, buyIn]);
            if (res?.[0]?.result?.success) {
                added += 1;
                continue;
            }
        }
        catch (e) {
            // Keep in waiting list if join failed
        }
        remaining.set(key, entry);
    }
    room.waiting = remaining;
    if (added > 0) {
        gameLog('WAITING_JOIN', 'Added waiting players to game', { gameId, added, remaining: remaining.size });
    }
    return added;
}
// Логирование карт после раздачи
async function logDealtCards(gameId) {
    try {
        const dealtCards = await db.query(`
      SELECT p.email, c.number, c.suit 
      FROM Players_Cards pc 
      JOIN Players p ON pc.player_id = p.id 
      JOIN Cards c ON pc.card_id = c.id 
      WHERE p.game_id = $1 
      ORDER BY p.email, c.id
    `, [gameId]);
        gameLog('CARDS_DEALT', 'Cards dealt to players', { gameId, cards: dealtCards });
    }
    catch (e) {
        // Ignore errors in logging
    }
}
async function ensureBlinds(gameId) {
    try {
        const cntRows = await db.query('SELECT COUNT(*)::int AS cnt FROM players WHERE game_id=$1', [gameId]);
        const cnt = Number(cntRows?.[0]?.cnt ?? 0);
        if (cnt < 2)
            return;
        const flagRows = await db.query('SELECT blinds_posted FROM games WHERE id=$1', [gameId]);
        const posted = !!flagRows?.[0]?.blinds_posted;
        if (!posted) {
            await db.query('SELECT apply_blinds($1) as result', [gameId]);
        }
    }
    catch (e) {
        console.error('[WS] ensureBlinds failed', e);
    }
}
// Public wrapper for controllers
export async function ensureBlindsPublic(gameId) {
    await ensureBlinds(gameId);
}
async function broadcastState(gameId) {
    try {
        const room = getRoom(gameId);
        let playersState = [];
        let playerEmailSet = new Set();
        try {
            playersState = await db.query('SELECT id, email, status, stack FROM players WHERE game_id = $1', [gameId]);
            playerEmailSet = new Set(playersState.map((p) => normalizeEmail(p.email || '')));
        }
        catch { }
        for (const ws of room.clients) {
            if (ws.readyState !== ws.OPEN)
                continue;
            const email = ws.email || null;
            let res;
            const emailKey = email ? normalizeEmail(email) : '';
            if (email && playerEmailSet.has(emailKey)) {
                res = await db.query('SELECT get_game_state_for_email($1, $2) as result', [gameId, email]);
            }
            else {
                res = await db.query('SELECT get_game_state_public($1) as result', [gameId]);
            }
            const gameState = res[0]?.result || null;
            const waitingCount = room.waiting ? room.waiting.size : 0;
            const payload = JSON.stringify({
                type: 'state',
                gameId,
                deadline: room.deadline || null,
                waitingCount,
                state: gameState
            });
            ws.send(payload);
        }
        // If phase is showdown and winner not yet announced, announce immediately
        try {
            const playersCount = await getPlayersCount(gameId);
            const phaseRows = await db.query('SELECT phase FROM games WHERE id = $1', [gameId]);
            const phase = phaseRows?.[0]?.phase || null;
            // Получаем состояние игроков для лога
            const playersForLog = playersState.length
                ? playersState
                : await db.query('SELECT id, email, status, stack FROM players WHERE game_id = $1', [gameId]);
            gameLog('BROADCAST', `phase=${phase}, winnerAnnounced=${room.winnerAnnounced}, playersCount=${playersCount}`, {
                players: playersForLog.map((p) => ({ email: p.email, status: p.status, stack: p.stack }))
            });
            console.log('[WS] broadcastState check: phase=', phase, 'winnerAnnounced=', room.winnerAnnounced, 'playersCount=', playersCount);
            if (phase === 'showdown' && !room.winnerAnnounced && playersCount >= 2) {
                // ВАЖНО: Сразу помечаем что победитель объявлен, чтобы избежать race condition
                room.winnerAnnounced = true;
                gameLog('SHOWDOWN', 'Entering showdown winner determination');
                try {
                    const winRes = await db.query('SELECT determine_winner($1) as result', [gameId]);
                    gameLog('WINNER_RESULT', 'determine_winner returned', winRes?.[0]?.result);
                    console.log('[WS] determine_winner result:', JSON.stringify(winRes?.[0]?.result));
                    // Проверяем success
                    if (!winRes?.[0]?.result?.success) {
                        gameLog('WINNER_FAILED', 'determine_winner failed', winRes?.[0]?.result?.error);
                        console.error('[WS] determine_winner failed:', winRes?.[0]?.result?.error);
                        room.winnerAnnounced = false; // Сбрасываем флаг, т.к. победитель не определен
                        return;
                    }
                    let winnerId = winRes?.[0]?.result?.winner_id || null;
                    let winnerEmail = winRes?.[0]?.result?.winner_email || null;
                    if (!winnerEmail && winnerId) {
                        const emailRows = await db.query('SELECT email FROM players WHERE id = $1', [winnerId]);
                        winnerEmail = emailRows?.[0]?.email || null;
                    }
                    // Ensure winnerId refers to players.id so client can match player.id
                    if (!winnerId && winnerEmail) {
                        const pidRows = await db.query('SELECT id FROM players WHERE game_id = $1 AND lower(email) = lower($2) ORDER BY id DESC LIMIT 1', [gameId, winnerEmail]);
                        winnerId = pidRows?.[0]?.id || null;
                    }
                    const handName = winRes?.[0]?.result?.hand_name || null;
                    gameLog('WINNER_ANNOUNCE', `Announcing winner`, { winnerId, winnerEmail, handName });
                    console.log('[WS] Announcing winner:', winnerId, winnerEmail, handName);
                    const winPayload = JSON.stringify({ type: 'winner', gameId, winner: { id: winnerId, email: winnerEmail, hand_name: handName } });
                    for (const ws of room.clients) {
                        if (ws.readyState === ws.OPEN)
                            ws.send(winPayload);
                    }
                    // Keep 7s delay before new round
                    setTimeout(async () => {
                        try {
                            await addWaitingPlayers(gameId);
                            await db.query('SELECT new_round($1) as result', [gameId]);
                            room.winnerAnnounced = false;
                            try {
                                await db.query('SELECT deal_cards($1) as result', [gameId]);
                                await logDealtCards(gameId);
                            }
                            catch { }
                            await ensureBlinds(gameId);
                            await broadcastState(gameId);
                            await startTurnTimer(gameId, 30);
                        }
                        catch (e) {
                            console.error('[WS] new round after showdown (broadcastState) failed', e);
                        }
                    }, 7000);
                }
                catch (err) {
                    gameLog('SHOWDOWN_ERROR', 'Error during showdown', String(err));
                    console.error('[WS] showdown error:', err);
                    room.winnerAnnounced = false;
                }
            }
            // Additionally, if only one active (non-fold) player remains, settle and announce winner
            try {
                const rows = await db.query('SELECT id, status, email FROM players WHERE game_id = $1', [gameId]);
                const active = rows.filter((r) => r.status !== 'FOLD');
                if (active.length === 1 && !room.winnerAnnounced) {
                    // Allow announcing if the round had two players at any point
                    const totalCnt = await getPlayersCount(gameId);
                    if (totalCnt < 2 && !room.hadTwoPlayers) {
                        await maybeStopGame(gameId);
                        return;
                    }
                    // Only settle if there is any money to award (bets or pot)
                    const betSumRows = await db.query('SELECT COALESCE(SUM(b.amount),0) AS s FROM bets b JOIN players p ON p.id=b.player_id WHERE p.game_id=$1', [gameId]);
                    const betSum = Number(betSumRows?.[0]?.s ?? 0);
                    const potRows = await db.query('SELECT COALESCE(pot,0) AS pot FROM games WHERE id=$1', [gameId]);
                    const potVal = Number(potRows?.[0]?.pot ?? 0);
                    room.winnerAnnounced = true;
                    const winnerId = active[0].id;
                    const winnerEmail = active[0].email || null;
                    // Move current bets into pot, award to winner, clear bets and pot
                    try {
                        await db.query('UPDATE games g SET pot = COALESCE(g.pot,0) + (SELECT COALESCE(SUM(b.amount),0) FROM bets b JOIN players p ON p.id=b.player_id WHERE p.game_id=$1) WHERE g.id=$1', [gameId]);
                        await db.query('UPDATE bets SET amount=0 WHERE player_id IN (SELECT id FROM players WHERE game_id=$1)', [gameId]);
                        const potAfterRows = await db.query('SELECT COALESCE(pot,0) AS pot FROM games WHERE id=$1', [gameId]);
                        const potAfter = Number(potAfterRows?.[0]?.pot ?? 0);
                        if (potAfter > 0) {
                            await db.query('UPDATE players SET stack = stack + $2 WHERE id = $1', [winnerId, potAfter]);
                            await db.query('UPDATE games SET pot = 0 WHERE id = $1', [gameId]);
                        }
                    }
                    catch (e) {
                        console.error('[WS] settle last-active player failed', e);
                    }
                    const winPayload = JSON.stringify({ type: 'winner', gameId, winner: { id: winnerId, email: winnerEmail, hand_name: null } });
                    for (const ws of room.clients) {
                        if (ws.readyState === ws.OPEN)
                            ws.send(winPayload);
                    }
                    // Start a new round only if there will be at least two players
                    const cntRows = await db.query('SELECT COUNT(*)::int AS cnt FROM players WHERE game_id=$1', [gameId]);
                    const cnt = Number(cntRows?.[0]?.cnt ?? 0);
                    if (cnt >= 2) {
                        setTimeout(async () => {
                            try {
                                await addWaitingPlayers(gameId);
                                await db.query('SELECT new_round($1) as result', [gameId]);
                                room.winnerAnnounced = false;
                                room.hadTwoPlayers = false;
                                try {
                                    await db.query('SELECT deal_cards($1) as result', [gameId]);
                                    await logDealtCards(gameId);
                                }
                                catch { }
                                await ensureBlinds(gameId);
                                await broadcastState(gameId);
                                await startTurnTimer(gameId, 30);
                            }
                            catch (e) {
                                console.error('[WS] new round after last-fold failed', e);
                            }
                        }, 7000);
                    }
                }
            }
            catch { }
        }
        catch { }
    }
    catch (err) {
        console.error('[WS] broadcastState error', err);
    }
}
function clearTimers(room) {
    if (room.timer) {
        clearTimeout(room.timer);
        room.timer = undefined;
    }
    if (room.tick) {
        clearInterval(room.tick);
        room.tick = undefined;
    }
    room.deadline = null;
}
function broadcastTimer(gameId, remaining) {
    const room = getRoom(gameId);
    const payload = JSON.stringify({ type: 'timer', gameId, remaining });
    for (const ws of room.clients) {
        if (ws.readyState === ws.OPEN)
            ws.send(payload);
    }
}
async function getPlayersCount(gameId) {
    try {
        const rows = await db.query('SELECT COUNT(*)::int AS cnt FROM players WHERE game_id = $1', [gameId]);
        return rows?.[0]?.cnt ?? 0;
    }
    catch {
        return 0;
    }
}
async function maybeStopGame(gameId) {
    try {
        const cnt = await getPlayersCount(gameId);
        const room = getRoom(gameId);
        if (cnt <= 1) {
            // Stop timers and clear active turn
            clearTimers(room);
            room.winnerAnnounced = false;
            try {
                await db.query('UPDATE games SET current_player_id = NULL, turn_start_time = NULL WHERE id = $1', [gameId]);
            }
            catch { }
            await broadcastState(gameId);
        }
    }
    catch (err) {
        console.error('[WS] maybeStopGame error', err);
    }
}
export async function startTurnTimer(gameId, seconds = 30) {
    const room = getRoom(gameId);
    // Increment generation BEFORE any async operations to prevent race condition
    // Any intervals/timeouts from previous generations will self-terminate
    room.timerGeneration = (room.timerGeneration || 0) + 1;
    const currentGeneration = room.timerGeneration;
    clearTimers(room);
    room.winnerAnnounced = false;
    // Do not start timer if players are 0 or 1
    const playersCount = await getPlayersCount(gameId);
    if (playersCount <= 1) {
        await maybeStopGame(gameId);
        return;
    }
    // Check if this timer was superseded during async operations
    if (room.timerGeneration !== currentGeneration) {
        return; // Another startTurnTimer was called, abort this one
    }
    // Mark that this round had at least 2 players
    room.hadTwoPlayers = true;
    // Ensure DB-reported max_turn_time is 30s and set turn_start_time to now so clients display correctly
    try {
        await db.query('UPDATE games SET max_turn_time = 30, turn_start_time = NOW() WHERE id = $1', [gameId]);
    }
    catch { }
    // Prefer DB value for seconds if available
    try {
        const trows = await db.query('SELECT COALESCE(max_turn_time, 30) AS t FROM games WHERE id=$1', [gameId]);
        const t = Number(trows?.[0]?.t ?? 30);
        if (Number.isFinite(t) && t > 0)
            seconds = t;
    }
    catch { }
    // Check again after DB operations
    if (room.timerGeneration !== currentGeneration) {
        return; // Superseded
    }
    const end = Date.now() + (seconds * 1000);
    room.deadline = end;
    broadcastTimer(gameId, seconds);
    room.tick = setInterval(() => {
        // Self-terminate if this interval is from an old generation
        if (room.timerGeneration !== currentGeneration) {
            clearInterval(room.tick);
            return;
        }
        const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
        broadcastTimer(gameId, remaining);
    }, 1000);
    room.timer = setTimeout(async () => {
        // Check generation before executing timeout logic
        if (room.timerGeneration !== currentGeneration) {
            return; // This timeout is stale
        }
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
                        if (pc < 2 && !room.hadTwoPlayers) {
                            await maybeStopGame(gameId);
                            return;
                        }
                        const winRes = await db.query('SELECT determine_winner($1) as result', [gameId]);
                        let winnerId = winRes?.[0]?.result?.winner_id || null;
                        let winnerEmail = winRes?.[0]?.result?.winner_email || null;
                        if (!winnerEmail && winnerId) {
                            const emailRows = await db.query('SELECT email FROM players WHERE id = $1', [winnerId]);
                            winnerEmail = emailRows?.[0]?.email || null;
                        }
                        if (!winnerId && winnerEmail) {
                            const pidRows = await db.query('SELECT id FROM players WHERE game_id = $1 AND lower(email) = lower($2) ORDER BY id DESC LIMIT 1', [gameId, winnerEmail]);
                            winnerId = pidRows?.[0]?.id || null;
                        }
                        const handName = winRes?.[0]?.result?.hand_name || null;
                        const payload = JSON.stringify({ type: 'winner', gameId, winner: { id: winnerId, email: winnerEmail, hand_name: handName } });
                        for (const ws of room.clients) {
                            if (ws.readyState === ws.OPEN)
                                ws.send(payload);
                        }
                        setTimeout(async () => {
                            try {
                                await addWaitingPlayers(gameId);
                                await db.query('SELECT new_round($1) as result', [gameId]);
                                try {
                                    await db.query('SELECT deal_cards($1) as result', [gameId]);
                                    await logDealtCards(gameId);
                                }
                                catch { }
                                await ensureBlinds(gameId);
                                await broadcastState(gameId);
                                await startTurnTimer(gameId, seconds);
                            }
                            catch (e) {
                                console.error('[WS] showdown new round failed', e);
                            }
                        }, 7000);
                        return;
                    }
                }
                catch { }
            }
            catch {
                // If only one active player remains, declare winner and start new round
                try {
                    const rows = await db.query('SELECT id, status FROM players WHERE game_id = $1', [gameId]);
                    const active = rows.filter((r) => r.status !== 'FOLD');
                    if (active.length === 1) {
                        const pc = await getPlayersCount(gameId);
                        if (pc < 2) {
                            await maybeStopGame(gameId);
                            return;
                        }
                        const winRes = await db.query('SELECT determine_winner($1) as result', [gameId]);
                        const winnerId = winRes?.[0]?.result?.winner_id || active[0].id;
                        const emailRows = await db.query('SELECT email FROM players WHERE id = $1', [winnerId]);
                        const winnerEmail = emailRows?.[0]?.email || null;
                        const handName = winRes?.[0]?.result?.hand_name || null;
                        const payload = JSON.stringify({ type: 'winner', gameId, winner: { id: winnerId, email: winnerEmail, hand_name: handName } });
                        const gameRoom = getRoom(gameId);
                        for (const ws of gameRoom.clients) {
                            if (ws.readyState === ws.OPEN)
                                ws.send(payload);
                        }
                        setTimeout(async () => {
                            try {
                                await addWaitingPlayers(gameId);
                                await db.query('SELECT new_round($1) as result', [gameId]);
                                try {
                                    await db.query('SELECT deal_cards($1) as result', [gameId]);
                                    await logDealtCards(gameId);
                                }
                                catch { }
                                await ensureBlinds(gameId);
                                await broadcastState(gameId);
                                await startTurnTimer(gameId, seconds);
                            }
                            catch (e) {
                                console.error('[WS] new round after last-fold failed', e);
                            }
                        }, 7000);
                        return;
                    }
                }
                catch { }
                // Fallback: still progress to next turn if timeout helper is absent
                try {
                    await db.query('SELECT next_turn($1) as result', [gameId]);
                }
                catch { }
            }
        }
        catch (e) {
            console.error('[WS] turn timeout advance failed', e);
        }
        await broadcastState(gameId);
        // Start next player's timer again
        startTurnTimer(gameId, seconds).catch(() => { });
    }, seconds * 1000);
}
async function maybeAutoStart(gameId) {
    const playersCount = await getPlayersCount(gameId);
    if (playersCount < 2) {
        // Not enough players to run the timer; keep room idle
        await maybeStopGame(gameId);
        return;
    }
    // If a round is already in progress, do not restart or re-deal on new connections.
    let currentPlayerId = null;
    let turnStart = null;
    let phase = '';
    try {
        const rows = await db.query('SELECT phase, current_player_id, turn_start_time FROM games WHERE id = $1', [gameId]);
        phase = String(rows?.[0]?.phase ?? '');
        currentPlayerId = rows?.[0]?.current_player_id ?? null;
        turnStart = rows?.[0]?.turn_start_time ?? null;
    }
    catch { }
    const phaseLower = phase.toLowerCase();
    const inProgress = !!currentPlayerId ||
        !!turnStart ||
        phaseLower === 'showdown';
    if (inProgress) {
        await broadcastState(gameId);
        const room = getRoom(gameId);
        if (!room.timer && !room.tick && !room.deadline) {
            await startTurnTimer(gameId, 30);
        }
        return;
    }
    try {
        // Mark two-player presence for this round
        const room = getRoom(gameId);
        room.hadTwoPlayers = true;
        // Attempt to start game; ignore if already started
        try {
            await db.query('SELECT start_game($1) as result', [gameId]);
        }
        catch { }
        // Ensure cards are dealt (idempotent)
        try {
            await db.query('SELECT deal_cards($1) as result', [gameId]);
            await logDealtCards(gameId);
        }
        catch { }
        // Ensure blinds at the beginning of the round (idempotent)
        await ensureBlinds(gameId);
        // Do not immediately new_round; start_game deals cards
        await broadcastState(gameId);
        await startTurnTimer(gameId, 30);
    }
    catch (err) {
        console.error('[WS] maybeAutoStart error', err);
    }
}
export function bindWebSocketServer(wss) {
    wss.on('connection', async (ws, req) => {
        try {
            const url = new URL(req.url || '/ws', 'http://localhost');
            const gameId = url.searchParams.get('game_id') || 'unknown';
            const rawEmail = url.searchParams.get('email') || '';
            // Валидация email - проверяем что пользователь существует в БД
            let validatedEmail = null;
            if (rawEmail && rawEmail !== 'anonymous') {
                try {
                    const userRows = await db.query('SELECT email FROM users WHERE LOWER(email) = LOWER($1)', [rawEmail]);
                    if (userRows.length > 0) {
                        validatedEmail = userRows[0].email;
                    }
                    else {
                        console.warn('[WS] Invalid email attempted:', rawEmail);
                    }
                }
                catch (e) {
                    console.error('[WS] Email validation error:', e);
                }
            }
            ws.gameId = gameId;
            ws.email = validatedEmail || undefined; // Только валидированный email или undefined
            const room = getRoom(gameId);
            room.clients.add(ws);
            console.log('[WS] connected', { gameId, email: validatedEmail || 'anonymous', clients: room.clients.size });
            ws.on('message', (data) => {
                // Placeholder for future action handling
                // Expect messages like { type: 'action', action: 'fold' | 'check' | 'call' | 'raise' | 'replace', ... }
                // For now, ignore.
            });
            ws.on('close', () => {
                const r = getRoom(gameId);
                r.clients.delete(ws);
                if (ws.email) {
                    const key = normalizeEmail(ws.email);
                    if (r.waiting?.has(key)) {
                        r.waiting.delete(key);
                    }
                }
                // НЕ перезапускаем таймер при закрытии соединения - это ломает ход игры
                if (r.clients.size === 0) {
                    clearTimers(r);
                }
                // Stop game if no or single player remains
                maybeStopGame(gameId).catch(() => { });
            });
            ws.on('error', (err) => console.error('[WS] client error', err));
            // Initial state push
            await broadcastState(gameId);
            await maybeAutoStart(gameId);
        }
        catch (err) {
            console.error('[WS] connection handler error', err);
            try {
                ws.close();
            }
            catch { }
        }
    });
}
// External helpers to push updates from HTTP controllers
export async function pushGameState(gameId) {
    await broadcastState(gameId);
}
export async function checkAndHandleWinner(gameId, seconds = 30) {
    try {
        const room = getRoom(gameId);
        // If fewer than 2 players remain and this round never had >=2 players, do not announce
        const totalRows = await db.query('SELECT COUNT(*)::int AS cnt FROM players WHERE game_id = $1', [gameId]);
        const totalCnt = Number(totalRows?.[0]?.cnt ?? 0);
        if (totalCnt < 2 && !room.hadTwoPlayers)
            return;
        const rows = await db.query('SELECT id, status, email FROM players WHERE game_id = $1', [gameId]);
        const active = rows.filter((r) => r.status !== 'FOLD');
        if (active.length === 1) {
            room.winnerAnnounced = true;
            const winnerId = active[0].id;
            const winnerEmail = active[0].email || null;
            // Move current bets into pot, award to winner, clear bets and pot
            try {
                await db.query('UPDATE games g SET pot = COALESCE(g.pot,0) + (SELECT COALESCE(SUM(b.amount),0) FROM bets b JOIN players p ON p.id=b.player_id WHERE p.game_id=$1) WHERE g.id=$1', [gameId]);
                await db.query('UPDATE bets SET amount=0 WHERE player_id IN (SELECT id FROM players WHERE game_id=$1)', [gameId]);
                const potAfterRows = await db.query('SELECT COALESCE(pot,0) AS pot FROM games WHERE id=$1', [gameId]);
                const potAfter = Number(potAfterRows?.[0]?.pot ?? 0);
                if (potAfter > 0) {
                    await db.query('UPDATE players SET stack = stack + $2 WHERE id = $1', [winnerId, potAfter]);
                    await db.query('UPDATE games SET pot = 0 WHERE id = $1', [gameId]);
                }
            }
            catch (e) {
                console.error('[WS] settle last-active player (check) failed', e);
            }
            const payload = JSON.stringify({ type: 'winner', gameId, winner: { id: winnerId, email: winnerEmail, hand_name: null } });
            for (const ws of room.clients) {
                if (ws.readyState === ws.OPEN)
                    ws.send(payload);
            }
            // Start a new round only if there will be at least two players
            const cntRows = await db.query('SELECT COUNT(*)::int AS cnt FROM players WHERE game_id=$1', [gameId]);
            const cnt = Number(cntRows?.[0]?.cnt ?? 0);
            if (cnt >= 2) {
                setTimeout(async () => {
                    try {
                        await addWaitingPlayers(gameId);
                        await db.query('SELECT new_round($1) as result', [gameId]);
                        room.winnerAnnounced = false;
                        room.hadTwoPlayers = false;
                        try {
                            await db.query('SELECT deal_cards($1) as result', [gameId]);
                            await logDealtCards(gameId);
                        }
                        catch { }
                        await ensureBlinds(gameId);
                        await broadcastState(gameId);
                        await startTurnTimer(gameId);
                    }
                    catch (e) {
                        console.error('[WS] winner new round failed', e);
                    }
                }, 7000);
            }
        }
    }
    catch (e) {
        console.error('[WS] checkAndHandleWinner error', e);
    }
}
// Функция для отправки сообщения о победителе всем клиентам
export async function pushWinnerMessage(gameId, winnerId, winnerEmail, handName) {
    const room = getRoom(gameId);
    // Помечаем что победитель объявлен
    room.winnerAnnounced = true;
    gameLog('PUSH_WINNER', `Sending winner message`, { gameId, winnerId, winnerEmail, handName });
    const winPayload = JSON.stringify({
        type: 'winner',
        gameId,
        winner: { id: winnerId, email: winnerEmail, hand_name: handName }
    });
    for (const ws of room.clients) {
        if (ws.readyState === ws.OPEN) {
            ws.send(winPayload);
        }
    }
    // Запускаем таймер на новый раунд
    setTimeout(async () => {
        try {
            const cntRows = await db.query('SELECT COUNT(*)::int AS cnt FROM players WHERE game_id=$1', [gameId]);
            const cnt = Number(cntRows?.[0]?.cnt ?? 0);
            if (cnt >= 2) {
                await addWaitingPlayers(gameId);
                await db.query('SELECT new_round($1) as result', [gameId]);
                room.winnerAnnounced = false;
                room.hadTwoPlayers = false;
                try {
                    await db.query('SELECT deal_cards($1) as result', [gameId]);
                    await logDealtCards(gameId);
                }
                catch { }
                await ensureBlinds(gameId);
                await broadcastState(gameId);
                await startTurnTimer(gameId, 30);
            }
            else {
                room.winnerAnnounced = false;
            }
        }
        catch (e) {
            console.error('[WS] new round after pushWinnerMessage failed', e);
            room.winnerAnnounced = false;
        }
    }, 7000);
}
