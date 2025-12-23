import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { connectGameSocket } from "../../api/ws";
import { getUserInfo } from "../../api/users";
import { leaveGame, leaveGameByEmail, getGameState, foldPlayer, checkPlayer, callPlayer, raisePlayer, replaceCards } from "../../api/games";

interface CardType {
  suit: string;
  rank: string;
}

interface PlayerType {
  id: string;
  email?: string;
  name: string;
  chips: number;
  bet: number;
  angle: number;
  isActive: boolean;
  isYou: boolean;
  isFolded: boolean;
  cardsCount?: number;
  cards?: CardType[];
}

type GamePhase = "betting1" | "exchange" | "betting2" | "showdown";

const PokerTable: React.FC = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [pot, setPot] = useState<number>(0);
  const [gamePhase, setGamePhase] = useState<GamePhase>("betting1");
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [showRaise, setShowRaise] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState(100);
  const [bigBlind, setBigBlind] = useState<number>(100);
  const [lastActions, setLastActions] = useState<Record<string, string>>({});
  const [prevActorEmail, setPrevActorEmail] = useState<string | null>(null);
  const [prevBets, setPrevBets] = useState<Record<string, number>>({});
  const [prevMaxBet, setPrevMaxBet] = useState<number>(0);
  const [currentActorEmail, setCurrentActorEmail] = useState<string | null>(null);
  const [turnRemaining, setTurnRemaining] = useState<number | null>(null);
  const [turnStartTs, setTurnStartTs] = useState<number | null>(null);
  const [maxTurnTimeSec, setMaxTurnTimeSec] = useState<number | null>(null);
  const [hasServerTimer, setHasServerTimer] = useState<boolean>(false);
  const [players, setPlayers] = useState<PlayerType[]>([]);
  const [myCards, setMyCards] = useState<CardType[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [winnerEmail, setWinnerEmail] = useState<string | null>(null);
  const [winnerUntil, setWinnerUntil] = useState<number | null>(null);
  const [everHadTwoPlayers, setEverHadTwoPlayers] = useState<boolean>(false);
  const [winnerId, setWinnerId] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;
    const email = localStorage.getItem('email') || '';
    const ws = connectGameSocket(roomId, email);

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as any);
        if (msg.type === 'timer') {
          const r = Number(msg.remaining ?? 0);
          setTurnRemaining(Number.isFinite(r) ? Math.max(0, r) : null);
          // If server is authoritative, prefer 30s cap when unknown
          if (!maxTurnTimeSec && Number.isFinite(r) && r > 0) setMaxTurnTimeSec(Math.max(30, r));
          if (!hasServerTimer) setHasServerTimer(true);
          return;
        }
        if (msg.type === 'winner') {
          const email = msg.winner?.email || msg.winner_email || null;
          // Always accept winner announcements from server; mark that table had >=2 players
          // This avoids missing the label if 'winner' arrives slightly before phase/state updates.
          if (!everHadTwoPlayers) {
            setEverHadTwoPlayers(true);
          }
          setWinnerEmail(email);
          setWinnerUntil(Date.now() + 7000);
          const idRaw = msg.winner?.id ?? msg.winner_id ?? null;
          setWinnerId(idRaw != null ? String(idRaw) : null);
          // Refresh my balance after round ends
          const myEmail = (localStorage.getItem('email') || '').toLowerCase();
          if (myEmail) {
            getUserInfo(myEmail).then((info) => {
              if (info && typeof info.balance === 'number') {
                localStorage.setItem('balance', String(info.balance));
              }
            }).catch(() => {});
          }
        }
        // Ignore timer broadcast; we'll compute locally for stability
        if (msg.type === 'state') {
          const full = msg.state || {};
          const state = full.game || full; // game-level fields
          const list = full.players || [];
          // Phase
          const phase: string | undefined = state?.stage || state?.phase || state?.round;
          let phaseLocal: GamePhase = 'betting1';
          if (phase) {
            const m = phase.toLowerCase();
            if (m.includes('exchange')) { setGamePhase('exchange'); phaseLocal = 'exchange'; }
            else if (m.includes('showdown')) { setGamePhase('showdown'); phaseLocal = 'showdown'; }
            else if (m.includes('betting2') || m.includes('round2')) { setGamePhase('betting2'); phaseLocal = 'betting2'; }
            else { setGamePhase('betting1'); phaseLocal = 'betting1'; }
          }
          // Do not aggressively clear winner overlay on non-showdown states.
          // Let the 7s winnerUntil timer control visibility, or clear only if expired.
          if (phaseLocal !== 'showdown' && winnerUntil && Date.now() >= winnerUntil) {
            setWinnerEmail(null);
            setWinnerUntil(null);
            setWinnerId(null);
          }
          // Actor
          let actorEmail = state?.current_player?.email || state?.current_player_email || null;
          const cpid = state?.current_player_id;
          if (!actorEmail && cpid && Array.isArray(list)) {
            const found = list.find((p: any) => String(p.id ?? p.player_id) === String(cpid));
            actorEmail = found?.email || null;
          }
          // Compute max bet and previous actions if actor changed
          const newMaxBet = Math.max(0, ...((Array.isArray(list) ? list : []).map((p: any) => Number(p.bet ?? 0))));
          if (prevActorEmail && prevActorEmail !== actorEmail) {
            const prevPlayer = (Array.isArray(list) ? list : []).find((p: any) => p.email && String(p.email).toLowerCase() === String(prevActorEmail).toLowerCase());
            const prevEmailKey = String(prevActorEmail).toLowerCase();
            const beforeBet = prevBets[prevEmailKey] ?? 0;
            const afterBet = Number(prevPlayer?.bet ?? 0);
            const prevAction = String(prevPlayer?.status || '').toUpperCase() === 'FOLD'
              ? 'Фолд'
              : (afterBet > beforeBet
                  ? (afterBet > prevMaxBet ? `Рейз ${afterBet}` : `Колл ${afterBet}`)
                  : 'Чек');
            setLastActions((la) => ({ ...la, [prevEmailKey]: prevAction }));
          }
          // Update prev maps
          const newPrevBets: Record<string, number> = { ...prevBets };
          (Array.isArray(list) ? list : []).forEach((p: any) => {
            const emailKey = String(p.email || '').toLowerCase();
            if (emailKey) newPrevBets[emailKey] = Number(p.bet ?? 0);
          });
          setPrevBets(newPrevBets);
          setPrevMaxBet(newMaxBet);
          setPrevActorEmail(actorEmail || null);
          setCurrentActorEmail(actorEmail);
          // Pot
          const newPot = state?.pot ?? state?.total_pot ?? 0;
          setPot(Number(newPot) || 0);
          // Turn timing
          const maxT = Number(state?.max_turn_time ?? 0) || null;
          const startIso: string | null = state?.turn_start_time || null;
          setMaxTurnTimeSec(maxT);
          if (startIso) {
            const startMs = Date.parse(startIso);
            setTurnStartTs(Number.isFinite(startMs) ? startMs : null);
            if (maxT && startMs) {
              const elapsed = Math.floor((Date.now() - startMs) / 1000);
              const remain = Math.max(0, maxT - elapsed);
              setTurnRemaining(remain);
            }
          } else {
            setTurnStartTs(null);
          }
          // Big blind
          setBigBlind(Number(state?.big_blind ?? bigBlind) || bigBlind);
          // Players
          const myEmail = (localStorage.getItem('email') || '').toLowerCase();
          const rawPlayers: any[] = Array.isArray(list) ? list : [];
          const base: PlayerType[] = rawPlayers.map((p: any, idx: number) => {
            const name = p.username || p.nickname || p.name || (p.email ? String(p.email).split('@')[0] : `Игрок ${idx+1}`);
            const chips = Number(p.stack ?? p.chips ?? 0);
            const bet = Number(p.bet ?? 0);
            const pid = String(p.id ?? p.player_id ?? p.email ?? idx);
            const email = p.email ? String(p.email) : undefined;
            const isYou = !!(email && email.toLowerCase() === myEmail);
            const isActive = !!(actorEmail && email && email.toLowerCase() === String(actorEmail).toLowerCase());
            const statusRaw = String(p.status || '').toUpperCase();
            const isFolded = statusRaw === 'FOLD';
            const cardsCount = Number(p.cards_count ?? Array.isArray(p.cards) ? p.cards.length : 5) || 5;
            let cards: CardType[] | undefined = undefined;
            if (phaseLocal === 'showdown' && Array.isArray(p.cards)) {
              const toSuit = (s: any): string => {
                const m = String(s).toUpperCase();
                if (m === 'S' || m.includes('SPADE') || s === '♠') return '♠';
                if (m === 'H' || m.includes('HEART') || s === '♥') return '♥';
                if (m === 'D' || m.includes('DIAM') || s === '♦') return '♦';
                if (m === 'C' || m.includes('CLUB') || s === '♣') return '♣';
                return '♠';
              };
              cards = (p.cards as any[]).map((c: any) => {
                let rank = c.rank || c.value || c.r || c.number || '';
                if (String(rank).toUpperCase() === 'T') rank = '10';
                const suit = toSuit(c.suit || c.s || 'S');
                return { rank: String(rank), suit } as CardType;
              });
            }
            return { id: pid, email, name, chips, bet, angle: 0, isActive, isYou, isFolded, cardsCount, cards };
          });

          // Reorder so that 'you' is always at bottom (angle 180)
          const meIndex = base.findIndex(p => p.isYou);
          const ordered: PlayerType[] = meIndex >= 0 ? [
            base[meIndex],
            ...base.slice(0, meIndex),
            ...base.slice(meIndex + 1)
          ] : base;

          const count = ordered.length;
          const withAngles = ordered.map((p, idx) => {
            if (idx === 0) return { ...p, angle: 180 };
            if (count <= 1) return { ...p, angle: 180 };
            const i = idx - 1; // others distributed around
            const angle = -145 + (290 / Math.max(1, (count - 1))) * i;
            return { ...p, angle };
          });

          setPlayers(withAngles);
          // Track if the table has ever had at least two players
          if (!everHadTwoPlayers && withAngles.length >= 2) {
            setEverHadTwoPlayers(true);
          }
          const mePlayer = withAngles.find(p => p.isYou);
          setMyPlayerId(mePlayer ? mePlayer.id : null);
          // My cards
          const me = rawPlayers.find((p: any) => p.email && String(p.email).toLowerCase() === myEmail);
          const cardsRaw: any[] = me?.hand || me?.cards || state?.hands?.[myEmail] || [];
          const toSuit = (s: any): string => {
            const m = String(s).toUpperCase();
            if (m === 'S' || m.includes('SPADE') || s === '♠') return '♠';
            if (m === 'H' || m.includes('HEART') || s === '♥') return '♥';
            if (m === 'D' || m.includes('DIAM') || s === '♦') return '♦';
            if (m === 'C' || m.includes('CLUB') || s === '♣') return '♣';
            return '♠';
          };
          const my = (Array.isArray(cardsRaw) ? cardsRaw.slice(0, 5) : []).map((c: any) => {
            let rank = c.rank || c.value || c.r || c.number || '';
            // Normalize ten as '10'
            if (String(rank).toUpperCase() === 'T') rank = '10';
            const suit = toSuit(c.suit || c.s || 'S');
            return { rank: String(rank), suit } as CardType;
          });
          setMyCards(my);

          // Fallback: if only one active (non-fold) player remains during a live round,
          // show the winner banner when the round is actually in progress.
          try {
            if (phaseLocal !== 'showdown') {
              const activeNonFolded = withAngles.filter(p => !p.isFolded);
              // Consider the round started if there is a current actor, a running timer,
              // any posted bets (incl. blinds), or a non-zero pot.
              const anyBet = withAngles.some(p => (Number(p.bet || 0) > 0));
              const roundStarted = !!(currentActorEmail || turnStartTs || anyBet || Number(pot) > 0);
              if (activeNonFolded.length === 1 && (everHadTwoPlayers || roundStarted)) {
                const w = activeNonFolded[0];
                if (!winnerUntil || Date.now() >= winnerUntil) {
                  setWinnerEmail(w.email || null);
                  setWinnerId(String(w.id));
                  setWinnerUntil(Date.now() + 7000);
                  // Refresh my balance since chips may have been awarded
                  const myEmail = (localStorage.getItem('email') || '').toLowerCase();
                  if (myEmail) {
                    getUserInfo(myEmail).then((info) => {
                      if (info && typeof info.balance === 'number') {
                        localStorage.setItem('balance', String(info.balance));
                      }
                    }).catch(() => {});
                  }
                }
              }
            }
          } catch {}
        }
      } catch {}
    };

    return () => {
      try { ws.close(); } catch {}
    };
  }, [roomId]);

  // Local stable countdown based on server turn_start_time and max_turn_time
  // Only compute locally when we don't have a server timer AND we have the necessary data
  useEffect(() => {
    // Prefer server-sent timer; only fallback to local calculation
    if (hasServerTimer || !turnStartTs || !maxTurnTimeSec) {
      return;
    }
    
    // Synchronize local timer with current server-provided remaining time
    const tick = setInterval(() => {
      const elapsed = Math.floor((Date.now() - turnStartTs) / 1000);
      const remain = Math.max(0, maxTurnTimeSec - elapsed);
      // Only update if the value actually changed to avoid unnecessary re-renders
      setTurnRemaining((prev) => {
        const newVal = remain;
        return prev !== newVal ? newVal : prev;
      });
    }, 100); // Check every 100ms for smoother updates instead of 1s jumps
    return () => clearInterval(tick);
  }, [turnStartTs, maxTurnTimeSec, hasServerTimer]);

  const Card: React.FC<{
    suit: string;
    rank: string;
    isSelected?: boolean;
    onClick?: () => void;
    small?: boolean;
  }> = ({ suit, rank, isSelected = false, onClick, small = false }) => {
    const isRed = suit === "♥" || suit === "♦";

    if (small) {
      return (
        <div className="w-8 h-12 bg-white rounded shadow-md flex flex-col items-center justify-center border border-gray-300">
          <span
            className={`text-xs font-bold ${
              isRed ? "text-red-600" : "text-black"
            }`}
          >
            {rank}
          </span>
          <span className={`text-sm ${isRed ? "text-red-600" : "text-black"}`}>
            {suit}
          </span>
        </div>
      );
    }

    return (
      <div
        onClick={onClick}
        className={`w-20 h-28 bg-white rounded-lg shadow-lg flex flex-col items-center justify-center border-2 cursor-pointer transition-all transform ${
          isSelected
            ? "border-yellow-400 -translate-y-4 border-4"
            : "border-gray-300 hover:-translate-y-2"
        }`}
      >
        <span
          className={`text-3xl font-bold ${
            isRed ? "text-red-600" : "text-black"
          }`}
        >
          {rank}
        </span>
        <span className={`text-4xl ${isRed ? "text-red-600" : "text-black"}`}>
          {suit}
        </span>
      </div>
    );
  };

  const CardBack: React.FC<{ small?: boolean }> = ({ small = false }) => {
    if (small) {
      return (
        <div className="w-8 h-12 bg-linear-to-br from-gray-700 to-gray-900 rounded shadow-md flex items-center justify-center border border-gray-600">
          <div className="w-6 h-10 border-2 border-gray-400 rounded"></div>
        </div>
      );
    }

    return (
      <div className="w-16 h-24 bg-linear-to-br from-gray-700 to-gray-900 rounded-lg shadow-lg flex items-center justify-center border-2 border-gray-600">
        <div className="w-12 h-20 border-4 border-gray-400 rounded"></div>
      </div>
    );
  };

  const Player: React.FC<{ player: PlayerType }> = ({ player }) => {
    const radius = player.isYou ? 46 : 42;
    const angleRad = (player.angle * Math.PI) / 180;
    const x = 50 + radius * Math.sin(angleRad);
    const y = 50 - radius * Math.cos(angleRad);

    const containerCls =
      player.isYou
        ? "bg-gray-300 text-black border-gray-400"
        : player.isActive
        ? "bg-linear-to-br from-gray-800 to-black text-white border-white"
        : "bg-linear-to-br from-gray-600 to-gray-800 text-white border-gray-500";

    return (
      <div
        className="absolute transform -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${x}%`, top: `${y}%` }}
      >
        <div className={`px-3 py-2 rounded-xl shadow-xl border-2 ${containerCls}`}>
          <div className="text-center mb-2">
            <div className="font-bold text-xs flex items-center justify-center gap-2">
              <span>{player.name}</span>
              {player.isFolded && (
                <span className="px-2 py-0.5 rounded bg-red-700 text-white text-[10px] font-bold">FOLD</span>
              )}
            </div>
            <div className="text-xs opacity-80">Фишки: {player.chips}</div>

            {player.bet > 0 && (
              <div className="text-yellow-500 font-bold text-xs mt-1">
                Ставка: {player.bet}
              </div>
            )}
            {winnerUntil && Date.now() < winnerUntil && (gamePhase === 'showdown' || everHadTwoPlayers) && (
              (winnerId && String(player.id) === String(winnerId)) ||
              (winnerEmail && player.email && player.email.toLowerCase() === winnerEmail.toLowerCase())
            ) && (
              <div className="text-green-400 font-bold text-xs mt-1">Победитель ✨</div>
            )}
          </div>

          {!player.isYou && (
            <div className="flex gap-1 justify-center">
              {gamePhase === 'showdown' && player.cards && player.cards.length > 0 ? (
                player.cards.slice(0, 5).map((c, idx) => (
                  <Card key={idx} suit={c.suit} rank={c.rank} small />
                ))
              ) : (
                Array.from({ length: Math.min(Math.max(player.cardsCount ?? 5, 0), 5) }).map((_, idx) => (
                  <CardBack key={idx} small />
                ))
              )}
            </div>
          )}
          {gamePhase !== 'showdown' && currentActorEmail && player.email && currentActorEmail.toLowerCase() === player.email.toLowerCase() && (
            <div className="mt-2 text-center">
              <span className="text-xs font-bold text-red-400">
                Ход: {turnRemaining ?? '-'}s
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Route guard: require auth and joined room
  useEffect(() => {
    const email = localStorage.getItem('email');
    const currentRoomId = localStorage.getItem('currentRoomId');
    if (!email) {
      navigate('/login');
      return;
    }
    if (!roomId || !currentRoomId || currentRoomId !== roomId) {
      navigate('/rooms');
      return;
    }
  }, [roomId, navigate]);

  const handleExchange = async (): Promise<void> => {
    try {
      if (!myPlayerId) return;
      await replaceCards(myPlayerId, selectedCards);
    } catch {}
    setSelectedCards([]);
    // Phase will be updated via WS state; avoid forcing client phase
  };

  const getPhaseText = (): string => {
    switch (gamePhase) {
      case "betting1":
        return "Раунд ставок 1";
      case "exchange":
        return "Обмен карт";
      case "betting2":
        return "Раунд ставок 2";
      case "showdown":
        return "Вскрытие";
      default:
        return "";
    }
  };

  return (
    <div className="w-screen h-screen bg-linear-to-br from-gray-900 via-black to-gray-800 flex items-center justify-center p-4">
      {/* Кнопка выхода */}
      <div className="absolute top-4 left-4 bg-black bg-opacity-80 p-3 rounded-xl border-2 border-gray-600 flex gap-2">
        <button
          onClick={async () => {
            try {
              const myEmail = (localStorage.getItem('email') || '').toLowerCase();
              if (roomId && myEmail) {
                // Prefer leaving by email + game for reliability
                await leaveGameByEmail(roomId, myEmail);
              } else {
                let pid = myPlayerId;
                if (!pid && roomId) {
                  // Fallback: fetch state to resolve my player id
                  const st = await getGameState(roomId);
                  const state = st?.game || st;
                  const list = state?.players || state?.seats || [];
                  const me = (Array.isArray(list) ? list : []).find((p: any) => p.email && String(p.email).toLowerCase() === myEmail);
                  pid = me ? String(me.id ?? me.player_id ?? '') : null;
                }
                if (pid) await leaveGame(pid);
              }
            } catch (e) {
              // Ignore server errors on leave; still clear client state
            } finally {
              localStorage.removeItem('currentRoomId');
              localStorage.removeItem('currentBuyIn');
              navigate('/rooms');
            }
          }}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold"
        >
          Выйти из комнаты
        </button>
      </div>

      {/* Индикатор фазы игры */}
      <div className="absolute top-4 right-4 bg-black bg-opacity-80 px-6 py-3 rounded-xl border-2 border-gray-600">
        <div className="text-white font-bold text-lg">{getPhaseText()}</div>
      </div>

      {/* Игровой стол */}
      <div
        className="relative w-full max-w-5xl aspect-video bg-linear-to-br from-gray-700 to-gray-800 rounded-[50%] shadow-2xl border-8 border-black"
        style={{ marginTop: "-8vh", maxHeight: "55vh" }}
      >
        {/* Внутренняя граница стола */}
        <div className="absolute inset-8 border-4 border-gray-900 rounded-[50%]"></div>

        {/* Игроки */}
        {players.map((player) => (
          <Player key={player.id} player={player} />
        ))}

        {/* Центр стола - банк */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="bg-black bg-opacity-70 text-white px-8 py-4 rounded-full border-4 border-yellow-500 shadow-xl">
            <div className="text-center">
              <div className="text-sm text-gray-300">БАНК</div>
              <div className="text-3xl font-bold text-yellow-400">{pot}</div>
            </div>
          </div>
        </div>

        {/* Кнопки действий */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2"></div>
      </div>

      {/* Кнопки действий игрока */}
      {(() => {
        const me = players.find(p => p.isYou);
        const hasStarted = !!currentActorEmail;
        const isBetting = gamePhase === "betting1" || gamePhase === "betting2";
        const isExchange = gamePhase === "exchange";
        const isMyTurn = !!(currentActorEmail && me?.email && me.email.toLowerCase() === currentActorEmail.toLowerCase());
        const showBettingActions = isBetting && hasStarted && isMyTurn && !me?.isFolded && players.length >= 2;
        const showExchangeAction = isExchange && hasStarted && isMyTurn && !me?.isFolded && players.length >= 2;
        if (!showBettingActions && !showExchangeAction) return null;
        const maxBet = Math.max(0, ...players.map(p => p.bet || 0));
        const myBet = me?.bet || 0;
        const myChips = me?.chips || 0;
        const cannotAct = !isMyTurn || myChips <= 0;
        const cannotCheck = cannotAct || (maxBet > myBet);
        const cannotCall = cannotAct || (maxBet <= myBet);
        const cls = (enabled: boolean, on: string, off: string) => (enabled ? on : off);
        return (
          <div className="absolute right-6 bottom-24 flex flex-col gap-3 bg-black bg-opacity-80 p-4 rounded-xl border-2 border-gray-600">
            {showBettingActions && (
              <>
                <button
                  disabled={cannotAct || !myPlayerId}
                  onClick={async () => { if (!myPlayerId || cannotAct) return; try { await foldPlayer(myPlayerId); } catch {} }}
                  className={`px-6 py-2 rounded-lg font-bold ${cls(!cannotAct && !!myPlayerId, 'bg-red-600 text-white', 'bg-red-900 text-red-300 cursor-not-allowed')}`}
                >
                  Фолд
                </button>
                <button
                  disabled={cannotCheck || !myPlayerId}
                  onClick={async () => { if (!myPlayerId || cannotCheck) return; try { await checkPlayer(myPlayerId); } catch {} }}
                  className={`px-6 py-2 rounded-lg font-bold ${cls(!cannotCheck && !!myPlayerId, 'bg-gray-700 text-white', 'bg-gray-800 text-gray-400 cursor-not-allowed')}`}
                >
                  Чек
                </button>
                <button
                  disabled={cannotCall || !myPlayerId}
                  onClick={async () => { if (!myPlayerId || cannotCall) return; try { await callPlayer(myPlayerId); } catch {} }}
                  className={`px-6 py-2 rounded-lg font-bold ${cls(!cannotCall && !!myPlayerId, 'bg-gray-700 text-white', 'bg-gray-800 text-gray-400 cursor-not-allowed')}`}
                >
                  Колл
                </button>
                <button
                  disabled={cannotAct || !myPlayerId}
                  onClick={() => { if (!cannotAct && myPlayerId) setShowRaise((prev) => !prev); }}
                  className={`px-6 py-2 rounded-lg font-bold ${cls(!cannotAct && !!myPlayerId, 'bg-green-600 text-white', 'bg-green-900 text-green-300 cursor-not-allowed')}`}
                >
                  Рейз
                </button>
              </>
            )}
            {showExchangeAction && (
              <button
                onClick={handleExchange}
                className="px-6 py-2 bg-yellow-500 text-black rounded-lg font-bold"
              >
                Обменять ({selectedCards.length})
              </button>
            )}
          </div>
        );
      })()}

      {showRaise && (
        <div className="absolute right-6 bottom-80 bg-black bg-opacity-90 p-4 rounded-xl border-2 border-green-500 w-56">
          {(() => {
            const me = players.find(p => p.isYou);
            const maxBet = Math.max(0, ...players.map(p => p.bet || 0));
            const hasAnyBet = maxBet > 0;
            const minRaise = hasAnyBet ? (maxBet + bigBlind) : (bigBlind * 2);
            const step = Math.max(1, bigBlind);
            const myChips = me?.chips || 0;
            const safeMin = Math.min(minRaise, myChips);
            const safeMax = myChips;
            if (raiseAmount < safeMin) setRaiseAmount(safeMin);
            return (
              <>
                <div className="text-white font-bold mb-2">Рейз: {raiseAmount}</div>
                <input
                  type="range"
                  min={safeMin}
                  max={safeMax}
                  step={step}
                  value={raiseAmount}
                  onChange={(e) => setRaiseAmount(Number(e.target.value))}
                  className="w-full"
                />
                <button
                  disabled={!myPlayerId || raiseAmount < minRaise}
                  onClick={async () => {
                    if (!myPlayerId || raiseAmount < minRaise) return;
                    try {
                      await raisePlayer(myPlayerId, raiseAmount);
                      setLastActions((la) => ({ ...la, [String(me?.email || '').toLowerCase()]: `Рейз ${raiseAmount}` }));
                    } catch {}
                    setShowRaise(false);
                  }}
                  className={`mt-3 w-full px-4 py-2 rounded-lg font-bold ${(!myPlayerId || raiseAmount < minRaise) ? 'bg-green-900 text-green-300 cursor-not-allowed' : 'bg-green-600 text-white'}`}
                >
                  Подтвердить
                </button>
              </>
            );
          })()}
        </div>
      )}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4">
        {myCards.map((card, idx) => {
          const isSelected = selectedCards.includes(idx);

          return (
            <div key={idx} className="relative">
              <Card
                suit={card.suit}
                rank={card.rank}
                isSelected={isSelected}
                onClick={() => {
                  if (gamePhase !== "exchange") return;

                  setSelectedCards((prev) => {
                    if (prev.includes(idx)) {
                      return prev.filter((i) => i !== idx);
                    }
                    // Разрешить выбрать до 5 карт (0–5)
                    if (prev.length >= 5) return prev;
                    return [...prev, idx];
                  });
                }}
              />

              {gamePhase === "exchange" && isSelected && (
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-yellow-400 font-bold">
                  ОБМЕН
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* Last actions labels under each player */}
      {players.map((p) => (
        <div key={p.id} className="hidden">{lastActions[String(p.email || '').toLowerCase()]}</div>
      ))}
    </div>
  );
};

export default PokerTable;
