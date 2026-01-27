import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAvailableGames, createGame, joinGame, deleteGame } from "../../api/games";
import type { AvailableGame } from "../../api/types";
import { getUserInfo } from "../../api/users";

interface RoomUI {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
  bigBlind: number;
  minStack: number;
  maxStack: number;
  status: "waiting" | "full" | "playing";
  createdBy?: string | null;
}

interface UserInfo {
  email: string;
  username: string;
  balance: number;
}

const RoomsList: React.FC = () => {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomUI[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [user, setUser] = useState<UserInfo>({ email: "", username: "", balance: 0 });
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [bigBlind, setBigBlind] = useState(100);
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [joinRoom, setJoinRoom] = useState<RoomUI | null>(null);
  const [buyIn, setBuyIn] = useState<number>(0);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  useEffect(() => {
    // Проверяем авторизацию
    const email = localStorage.getItem("email");
    if (!email) {
      navigate("/login");
      return;
    }

    const username = localStorage.getItem("username") || "Игрок";
    const balanceStr = localStorage.getItem("balance") || "0";
    const balance = parseInt(balanceStr, 10) || 0;

    setUser({ email, username, balance });
    setCurrentRoomId(localStorage.getItem("currentRoomId"));

    // Обновим баланс из сервера, чтобы отразить последние изменения
    const refreshBalance = () => {
      getUserInfo(email)
        .then((info) => {
          if (info && typeof info.balance === 'number') {
            setUser((u) => ({ email: info.email || u.email, username: info.username || u.username, balance: info.balance }));
            localStorage.setItem("balance", String(info.balance));
          }
        })
        .catch(() => {
          // игнорируем ошибки, оставим локальный баланс
        });
    };
    refreshBalance();
    // Также обновляем баланс при возврате фокуса на страницу комнат
    const onFocus = () => refreshBalance();
    window.addEventListener('focus', onFocus);

    // Загружаем список комнат один раз
    loadRooms();

    // Очистка
    return () => window.removeEventListener('focus', onFocus);
  }, [navigate]);

  const loadRooms = async () => {
    setIsLoading(true);
    try {
      // Попутно обновим баланс пользователя
      if (user.email) {
        try {
          const info = await getUserInfo(user.email);
          if (info && typeof info.balance === 'number') {
            setUser((u) => ({ email: info.email || u.email, username: info.username || u.username, balance: info.balance }));
            localStorage.setItem("balance", String(info.balance));
          }
        } catch {}
      }
      const games: AvailableGame[] = await getAvailableGames();
      const mapped: RoomUI[] = games.map((g) => ({
        id: g.game_id,
        name: g.name,
        players: g.current_players ?? 0,
        maxPlayers: g.max_players,
        bigBlind: g.big_blind,
        minStack: g.min_stack,
        maxStack: g.max_stack,
        status: g.is_full ? "full" : "waiting",
        // Prefer any available creator field from API
        createdBy: (g.created_by || g.creator_email || g.owner_email || null) as string | null,
      }));
      setRooms(mapped);
    } catch (err) {
      console.error("Ошибка загрузки комнат:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const openJoinModal = (room: RoomUI) => {
    // If already in this room, just navigate to it
    const joinedId = localStorage.getItem('currentRoomId');
    if (joinedId && joinedId === room.id) {
      navigate(`/table/${room.id}`);
      return;
    }
    setJoinError("");
    setJoinRoom(room);
    const maxAllowed = Math.min(room.maxStack, user.balance);
    const initial = Math.max(room.minStack, Math.min(maxAllowed, room.minStack));
    setBuyIn(initial);
  };

  const handleConfirmJoin = async () => {
    if (!joinRoom) return;
    setJoinError("");

    const min = joinRoom.minStack;
    const max = Math.min(joinRoom.maxStack, user.balance);
    if (user.balance < min) {
      setJoinError("Недостаточно средств для входа в эту комнату");
      return;
    }
    if (buyIn < min || buyIn > max) {
      setJoinError(`Выберите бай-ин от ${min} до ${max} ₽`);
      return;
    }
    if (joinRoom.status === 'full') {
      setJoinError("Комната заполнена");
      return;
    }

    setIsJoining(true);
    try {
      await joinGame(joinRoom.id, { buy_in: buyIn });
      localStorage.setItem('currentRoomId', joinRoom.id);
      localStorage.setItem('currentBuyIn', String(buyIn));
      setCurrentRoomId(joinRoom.id);
      setJoinRoom(null);
      navigate(`/table/${joinRoom.id}`);
    } catch (err) {
      console.error('Ошибка подключения к комнате:', err);
      const msg = (err as any)?.response?.data?.error || (err as any)?.message || '';
      if (/already|уже/i.test(msg)) {
        // If backend reports already in room, just navigate
        localStorage.setItem('currentRoomId', joinRoom.id);
        setCurrentRoomId(joinRoom.id);
        setJoinRoom(null);
        navigate(`/table/${joinRoom.id}`);
        return;
      }
      setJoinError('Не удалось подключиться. Попробуйте позже.');
    } finally {
      setIsJoining(false);
    }
  };

  const getMaxBigBlind = (): number => Math.floor(user.balance / 20);

  const getValidBigBlinds = (): number[] => {
    const max = getMaxBigBlind();
    const blinds: number[] = [];
    for (let i = 20; i <= max; i += 20) blinds.push(i);
    return blinds;
  };

  const handleCreateRoom = async () => {
    setCreateError("");

    if (!roomName.trim()) {
      setCreateError("Введите название комнаты");
      return;
    }
    if (maxPlayers < 2 || maxPlayers > 6) {
      setCreateError("Количество игроков должно быть от 2 до 6");
      return;
    }
    if (bigBlind % 20 !== 0) {
      setCreateError("Блайнд должен быть кратен 20");
      return;
    }
    if (bigBlind > getMaxBigBlind()) {
      setCreateError(`Блайнд не может превышать ${getMaxBigBlind() * 20} ₽ (ваш баланс)`);
      return;
    }

    setIsCreating(true);
    try {
      const res = await createGame({
        name: roomName,
        max_players: maxPlayers,
        big_blind: bigBlind,
        min_stack: bigBlind * 20,
        max_stack: bigBlind * 200,
      });
      const newId = (res as any)?.game_id || (res as any)?.gameId || '';
      if (newId) {
        localStorage.setItem('currentRoomId', newId);
        // Creator is auto-joined server-side with min_stack; navigate into table
        navigate(`/table/${newId}`);
      } else {
        await loadRooms();
      }
      setShowCreateModal(false);
      setRoomName("");
      setMaxPlayers(6);
      setBigBlind(100);
    } catch (err) {
      console.error("Ошибка создания комнаты:", err);
      setCreateError("Не удалось создать комнату. Попробуйте снова.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("email");
    localStorage.removeItem("username");
    localStorage.removeItem("balance");
    navigate("/login");
  };

  const getStatusBadge = (status: RoomUI["status"]) => {
    switch (status) {
      case "waiting":
        return (
          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-[#14532d] text-[#86efac] border border-[#166534]">
            Ожидание
          </span>
        );
      case "playing":
        return (
          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-[#713f12] text-[#fde047] border border-[#a16207]">
            В игре
          </span>
        );
      case "full":
        return (
          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-[#7f1d1d] text-[#fca5a5] border border-[#991b1b]">
            Заполнена
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen w-screen bg-[#070707] p-6">
      <div className="max-w-7xl mx-auto">
        {/* Хедер с информацией о пользователе */}
        <div className="bg-[#1a1a1a] rounded-lg shadow-xl p-6 mb-6 border border-gray-700">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold text-[#ffffff] mb-1">♠ Покер Дро ♠</h1>
              <p className="text-[#9ca3af]">Добро пожаловать, {user.username}!</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/rules')}
                className="bg-blue-600 hover:bg-blue-700 text-[#ffffff] font-medium py-2 px-6 rounded-lg transition duration-200"
              >
                📖 Правила
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-green-600 hover:bg-green-700 text-[#ffffff] font-medium py-2 px-6 rounded-lg transition duration-200"
              >
                + Создать комнату
              </button>
              <button
                onClick={handleLogout}
                className="bg-[#374151] hover:bg-[#4b5563] text-[#ffffff] font-medium py-2 px-6 rounded-lg transition duration-200"
              >
                Выйти
              </button>
            </div>
          </div>

          <div className="bg-[#2d2d2d] rounded p-4 border border-gray-600">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-[#9ca3af] mb-1">Email</p>
                <p className="text-[#ffffff] font-medium break-all">{user.email}</p>
              </div>
              <div>
                <p className="text-[#9ca3af] mb-1">Ник</p>
                <p className="text-[#ffffff] font-medium">{user.username}</p>
              </div>
              <div>
                <p className="text-[#9ca3af] mb-1">Баланс</p>
                <p className="text-green-400 font-medium">{user.balance.toLocaleString()} ₽</p>
              </div>
            </div>
          </div>
        </div>

        {/* Список комнат */}
        <div className="bg-[#1a1a1a] rounded-lg shadow-xl p-6 border border-gray-700">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-[#ffffff]">Игровые комнаты</h2>
            <button
              onClick={() => loadRooms()}
              disabled={isLoading}
              className={`py-2 px-4 rounded-lg font-medium transition duration-200 ${
                isLoading ? 'bg-[#374151] text-[#9ca3af] cursor-not-allowed' : 'bg-[#374151] hover:bg-[#4b5563] text-[#ffffff]'
              }`}
            >
              {isLoading ? 'Обновляем...' : 'Обновить список'}
            </button>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-[#374151] border-t-blue-500"></div>
              <p className="text-[#9ca3af] mt-4">Загрузка комнат...</p>
            </div>
          ) : rooms.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[#9ca3af] text-lg">Нет доступных комнат</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 bg-green-600 hover:bg-green-700 text-[#ffffff] font-medium py-2 px-6 rounded-lg transition duration-200"
              >
                Создать первую комнату
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="bg-[#2d2d2d] rounded-lg p-5 border border-gray-600 hover:border-blue-500 transition duration-200"
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xl font-bold text-[#ffffff]">{room.name}</h3>
                    {getStatusBadge(room.status)}
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#9ca3af]">Игроки:</span>
                      <span className="text-[#ffffff] font-medium">
                        {room.players} / {room.maxPlayers}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#9ca3af]">Блайнд / Стэк:</span>
                      <span className="text-[#ffffff] font-medium">
                        BB {room.bigBlind} • {room.minStack} - {room.maxStack} ₽
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (currentRoomId && currentRoomId === room.id) {
                        navigate(`/table/${room.id}`);
                      } else {
                        openJoinModal(room);
                      }
                    }}
                    disabled={room.status === "full"}
                    className={`w-full py-2 px-4 rounded-lg font-medium transition duration-200 ${
                      room.status === "full"
                        ? "bg-[#374151] text-[#6b7280] cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700 text-[#ffffff]"
                    }`}
                  >
                    {room.status === "full" ? "Комната заполнена" : currentRoomId === room.id ? "Перейти" : "Войти в комнату"}
                  </button>
                  <div className="flex gap-2 mt-3">
                    {!!room.createdBy && room.createdBy.toLowerCase() === user.email.toLowerCase() && (room.players === 0 || room.players === 1) && (
                      <button
                        onClick={async () => {
                          try {
                            await deleteGame(room.id);
                            // после удаления комнаты обновим баланс и список комнат
                            if (user.email) {
                              try {
                                const info = await getUserInfo(user.email);
                                if (info && typeof info.balance === 'number') {
                                  setUser((u) => ({ email: info.email || u.email, username: info.username || u.username, balance: info.balance }));
                                  localStorage.setItem("balance", String(info.balance));
                                }
                              } catch {}
                            }
                            await loadRooms();
                          } catch (e) {
                            alert('Не удалось удалить комнату');
                          }
                        }}
                        className="px-4 py-2 bg-red-600! hover:bg-red-700! text-[#ffffff] rounded-lg font-medium"
                        title="Удалить комнату"
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Модальное окно создания комнаты с настройками */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#1a1a1a] rounded-lg shadow-xl p-6 w-full max-w-md border border-gray-700 max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold text-[#ffffff] mb-6">Создать комнату</h3>

            <div className="mb-6">
              <label htmlFor="roomName" className="block text-sm font-medium text-[#d1d5db] mb-2">
                Название комнаты
              </label>
              <input
                type="text"
                id="roomName"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="w-full px-4 py-3 bg-[#2d2d2d] border border-gray-600 rounded-lg text-[#ffffff] placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                placeholder="Введите название комнаты"
                autoFocus
              />
            </div>

            <div className="mb-6">
              <label htmlFor="maxPlayers" className="block text-sm font-medium text-[#d1d5db] mb-2">
                Количество игроков: <span className="text-blue-400 font-bold">{maxPlayers}</span>
              </label>
              <input
                type="range"
                id="maxPlayers"
                min={2}
                max={6}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-[#374151] rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-[#9ca3af] mt-1">
                <span>2</span>
                <span>6</span>
              </div>
            </div>

            <div className="mb-6">
              <label htmlFor="bigBlind" className="block text-sm font-medium text-[#d1d5db] mb-2">
                Большой блайнд (кратно 20)
              </label>
              <select
                id="bigBlind"
                value={bigBlind}
                onChange={(e) => setBigBlind(parseInt(e.target.value, 10))}
                className="w-full px-4 py-3 bg-[#2d2d2d] border border-gray-600 rounded-lg text-[#ffffff] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
              >
                {getValidBigBlinds().map((blind) => (
                  <option key={blind} value={blind}>
                    {blind} ₽ (стэк: {blind * 20} - {blind * 200} ₽)
                  </option>
                ))}
              </select>
              <p className="text-xs text-[#9ca3af] mt-2">
                Макс. блайнд для вас: {getMaxBigBlind() * 20} ₽ (баланс / 20)
              </p>
            </div>

            {createError && (
              <div className="mb-6 bg-[#7f1d1d] border border-[#991b1b] text-[#fca5a5] px-4 py-3 rounded-lg text-sm">
                {createError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleCreateRoom}
                disabled={isCreating || !roomName.trim() || getValidBigBlinds().length === 0}
                className="flex-1 bg-green-600 hover:bg-green-700 text-[#ffffff] font-medium py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? "Создание..." : "Создать"}
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setRoomName("");
                  setMaxPlayers(6);
                  setBigBlind(100);
                  setCreateError("");
                }}
                className="flex-1 bg-[#374151] hover:bg-[#4b5563] text-[#ffffff] font-medium py-3 px-4 rounded-lg transition duration-200"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно выбора бай-ина перед входом */}
      {joinRoom && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#1a1a1a] rounded-lg shadow-xl p-6 w-full max-w-md border border-gray-700">
            <h3 className="text-2xl font-bold text-[#ffffff] mb-4">Вход в комнату</h3>
            <p className="text-[#d1d5db] mb-4">{joinRoom.name}</p>

            <div className="mb-4">
              <div className="text-sm text-[#9ca3af] mb-2">Бай-ин (стэк на входе)</div>
              <input
                type="range"
                min={joinRoom.minStack}
                max={Math.min(joinRoom.maxStack, user.balance)}
                step={20}
                value={buyIn}
                onChange={(e) => setBuyIn(parseInt(e.target.value, 10))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-[#9ca3af] mt-1">
                <span>Мин: {joinRoom.minStack} ₽</span>
                <span>Макс: {Math.min(joinRoom.maxStack, user.balance)} ₽</span>
              </div>
              <div className="mt-2">
                <input
                  type="number"
                  min={joinRoom.minStack}
                  max={Math.min(joinRoom.maxStack, user.balance)}
                  step={20}
                  value={buyIn}
                  onChange={(e) => setBuyIn(parseInt(e.target.value, 10) || joinRoom.minStack)}
                  className="w-full px-4 py-2 bg-[#2d2d2d] border border-gray-600 rounded-lg text-[#ffffff]"
                />
              </div>
              <p className="text-xs text-[#9ca3af] mt-2">Ваш баланс: {user.balance.toLocaleString()} ₽</p>
            </div>

            {joinError && (
              <div className="mb-4 bg-[#7f1d1d] border border-[#991b1b] text-[#fca5a5] px-4 py-3 rounded-lg text-sm">
                {joinError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleConfirmJoin}
                disabled={isJoining || user.balance < joinRoom.minStack}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-[#ffffff] font-medium py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isJoining ? "Входим..." : "Войти"}
              </button>
              <button
                onClick={() => { setJoinRoom(null); setJoinError(""); }}
                className="flex-1 bg-[#374151] hover:bg-[#4b5563] text-[#ffffff] font-medium py-3 px-4 rounded-lg transition duration-200"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomsList;
