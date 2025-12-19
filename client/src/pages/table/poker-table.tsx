import React, { useState } from "react";

interface CardType {
  suit: string;
  rank: string;
}

interface PlayerType {
  id: number;
  name: string;
  chips: number;
  bet: number;
  angle: number;
  isActive: boolean;
  isYou: boolean;
}

type GamePhase = "betting1" | "exchange" | "betting2" | "showdown";

const PokerTable: React.FC = () => {
  const [numPlayers, setNumPlayers] = useState<number>(6);
  const [pot, setPot] = useState<number>(500);
  const [gamePhase, setGamePhase] = useState<GamePhase>("betting1");
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [showRaise, setShowRaise] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState(100);

  const [playerCards, setPlayerCards] = useState<CardType[]>([
    { suit: "♠", rank: "A" },
    { suit: "♥", rank: "K" },
    { suit: "♦", rank: "Q" },
    { suit: "♣", rank: "J" },
    { suit: "♠", rank: "10" },
  ]);

    const generatePlayers = (count: number): PlayerType[] => {
    const otherPlayersCount = count - 1;

    const otherPlayers = Array.from({ length: otherPlayersCount }).map(
      (_, idx) => {
        // Дуга 290°: от -145° (левый нижний) до +145° (правый нижний)
        const angle = -145 + (290 / (otherPlayersCount - 1)) * idx;

        return {
          id: idx + 1,
          name: `Игрок ${idx + 1}`,
          chips: 1000 + idx * 200,
          bet: idx * 50,
          angle,
          isActive: idx !== 2,
          isYou: false,
        };
      }
    );

    return [
      {
        id: 0,
        name: "Вы",
        chips: 1200,
        bet: 0,
        angle: 180, // низ стола
        isActive: true,
        isYou: true,
      },
      ...otherPlayers,
    ];
  };

  const [players, setPlayers] = useState<PlayerType[]>(
    generatePlayers(numPlayers)
  );

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

    return (
      <div
        className="absolute transform -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${x}%`, top: `${y}%` }}
      >
        <div
          className={`px-3 py-2 rounded-xl shadow-xl border-2
          ${
            player.isYou
              ? "bg-gray-300 text-black border-gray-400"
              : player.isActive
              ? "bg-linear-to-br from-gray-800 to-black text-white border-white"
              : "bg-linear-to-br from-gray-600 to-gray-800 text-white border-gray-500"
          }
        `}
        >
          <div className="text-center mb-2">
            <div className="font-bold text-xs">{player.name}</div>
            <div className="text-xs opacity-80">Фишки: {player.chips}</div>

            {player.bet > 0 && (
              <div className="text-yellow-500 font-bold text-xs mt-1">
                Ставка: {player.bet}
              </div>
            )}
          </div>

          {!player.isYou && (
            <div className="flex gap-1 justify-center">
              {[1, 2, 3, 4, 5].map((_, idx) => (
                <CardBack key={idx} small />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const toggleCardSelection = (idx: number): void => {
    setSelectedCards((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const handlePlayerCountChange = (count: number): void => {
    setNumPlayers(count);
    setPlayers(generatePlayers(count));
  };

  const handleExchange = (): void => {
    setSelectedCards([]);
    setGamePhase("betting2");
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
      {/* Настройки количества игроков */}
      <div className="absolute top-4 left-4 bg-black bg-opacity-80 p-4 rounded-xl border-2 border-gray-600">
        <div className="text-white text-sm mb-2 font-bold">
          Количество игроков
        </div>
        <div className="flex gap-2">
          {[5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handlePlayerCountChange(num)}
              className={`w-10 h-10 rounded-lg font-bold transition-all ${
                numPlayers === num
                  ? "bg-white text-black border-2 border-yellow-400"
                  : "bg-gray-700 text-white hover:bg-gray-600"
              }`}
            >
              {num}
            </button>
          ))}
        </div>
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
      <div className="absolute right-6 bottom-24 flex flex-col gap-3 bg-black bg-opacity-80 p-4 rounded-xl border-2 border-gray-600">
        {(gamePhase === "betting1" || gamePhase === "betting2") && (
          <>
            <button className="px-6 py-2 bg-red-600 text-white rounded-lg font-bold">
              Фолд
            </button>

            <button className="px-6 py-2 bg-gray-700 text-white rounded-lg font-bold">
              Колл
            </button>

            <button
              onClick={() => setShowRaise((prev) => !prev)}
              className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold"
            >
              Рейз
            </button>
          </>
        )}

        {gamePhase === "exchange" && (
          <button
            onClick={handleExchange}
            className="px-6 py-2 bg-yellow-500 text-black rounded-lg font-bold"
          >
            Обменять ({selectedCards.length})
          </button>
        )}
      </div>

      {showRaise && (
        <div className="absolute right-6 bottom-80 bg-black bg-opacity-90 p-4 rounded-xl border-2 border-green-500 w-56">
          <div className="text-white font-bold mb-2">Рейз: {raiseAmount}</div>

          <input
            type="range"
            min={50}
            max={players[0].chips}
            step={50}
            value={raiseAmount}
            onChange={(e) => setRaiseAmount(Number(e.target.value))}
            className="w-full"
          />

          <button
            onClick={() => {
              setShowRaise(false);
              // здесь будет логика ставки
            }}
            className="mt-3 w-full px-4 py-2 bg-green-600 text-white rounded-lg font-bold"
          >
            Подтвердить
          </button>
        </div>
      )}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4">
        {playerCards.map((card, idx) => {
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
                    if (prev.length >= 3) return prev; // максимум 3 карты
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
    </div>
  );
};

export default PokerTable;
