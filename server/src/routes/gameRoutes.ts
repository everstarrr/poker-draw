import { Router } from 'express';
import { GameController } from '../controllers/gameController.js';

const router = Router();

// POST /api/games - Создание игры
router.post('/', GameController.createGame);

// GET /api/games - Получение списка доступных игр
router.get('/', GameController.getAvailableGames);

// GET /api/games/:game_id - Получение состояния игры
router.get('/:game_id', GameController.getGameState);

// POST /api/games/:game_id/start - Начало игры
router.post('/:game_id/start', GameController.startGame);

// POST /api/games/:game_id/join - Присоединение к игре
router.post('/:game_id/join', GameController.joinGame);

// POST /api/games/players/:player_id/leave - Выход из игры
router.post('/players/:player_id/leave', GameController.leaveGame);

// POST /api/games/:game_id/leave - Выход из игры по email
router.post('/:game_id/leave', GameController.leaveGameByEmail);
// GET /api/games/:game_id/leave?email=... - Выход из игры по email (для простых проверок)
router.get('/:game_id/leave', GameController.leaveGameByEmail);

// POST /api/games/players/:player_id/actions/fold - Сброс карт
router.post('/players/:player_id/actions/fold', GameController.playerFold);

// POST /api/games/players/:player_id/actions/check - Пропуск без ставки
router.post('/players/:player_id/actions/check', GameController.playerCheck);

// POST /api/games/players/:player_id/actions/call - Уравнять ставку
router.post('/players/:player_id/actions/call', GameController.playerCall);

// POST /api/games/players/:player_id/actions/raise - Повышение ставки
router.post('/players/:player_id/actions/raise', GameController.playerRaise);

// POST /api/games/players/:player_id/actions/all-in - Ва-банк
router.post('/players/:player_id/actions/all-in', GameController.playerAllIn);

// POST /api/games/players/:player_id/replace-cards - Замена карт
router.post('/players/:player_id/replace-cards', GameController.replaceCards);

// POST /api/games/:game_id/next-turn - Переход к следующему игроку
router.post('/:game_id/next-turn', GameController.nextTurn);

// POST /api/games/:game_id/check-timeout - Проверка таймаута хода
router.post('/:game_id/check-timeout', GameController.checkTurnTimeout);

// POST /api/games/:game_id/determine-winner - Определение победителя
router.post('/:game_id/determine-winner', GameController.determineWinner);

// POST /api/games/:game_id/new-round - Сброс раунда
router.post('/:game_id/new-round', GameController.newRound);

// DELETE /api/games/:game_id - Удаление игры
router.delete('/:game_id', GameController.deleteGame);

export { router as gameRoutes };

