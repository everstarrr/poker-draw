import { Router } from 'express';
import { GameController } from '../controllers/gameController.js';
import { requireAuth, requirePlayerOwnership, requireGameParticipant } from '../middleware/auth.js';
import { getLogContents, clearLog } from '../utils/gameLogger.js';
const router = Router();
// POST /api/games - Создание игры (требует авторизации)
router.post('/', requireAuth, GameController.createGame);
// GET /api/games - Получение списка доступных игр (публичный)
router.get('/', GameController.getAvailableGames);
// GET /api/games/:game_id - Получение состояния игры (публичный)
router.get('/:game_id', GameController.getGameState);
// POST /api/games/:game_id/start - Начало игры (требует авторизации и участия в игре)
router.post('/:game_id/start', requireAuth, requireGameParticipant, GameController.startGame);
// POST /api/games/:game_id/join - Присоединение к игре (требует авторизации)
router.post('/:game_id/join', requireAuth, GameController.joinGame);
// POST /api/games/players/:player_id/leave - Выход из игры (требует авторизации и владения игроком)
router.post('/players/:player_id/leave', requireAuth, requirePlayerOwnership, GameController.leaveGame);
// POST /api/games/:game_id/leave - Выход из игры по email (требует авторизации)
router.post('/:game_id/leave', requireAuth, GameController.leaveGameByEmail);
// GET /api/games/:game_id/leave?email=... - Выход из игры по email (для простых проверок) (требует авторизации)
router.get('/:game_id/leave', requireAuth, GameController.leaveGameByEmail);
// POST /api/games/players/:player_id/actions/fold - Сброс карт (требует авторизации и владения игроком)
router.post('/players/:player_id/actions/fold', requireAuth, requirePlayerOwnership, GameController.playerFold);
// POST /api/games/players/:player_id/actions/check - Пропуск без ставки (требует авторизации и владения игроком)
router.post('/players/:player_id/actions/check', requireAuth, requirePlayerOwnership, GameController.playerCheck);
// POST /api/games/players/:player_id/actions/call - Уравнять ставку (требует авторизации и владения игроком)
router.post('/players/:player_id/actions/call', requireAuth, requirePlayerOwnership, GameController.playerCall);
// POST /api/games/players/:player_id/actions/raise - Повышение ставки (требует авторизации и владения игроком)
router.post('/players/:player_id/actions/raise', requireAuth, requirePlayerOwnership, GameController.playerRaise);
// POST /api/games/players/:player_id/actions/all-in - Ва-банк (требует авторизации и владения игроком)
router.post('/players/:player_id/actions/all-in', requireAuth, requirePlayerOwnership, GameController.playerAllIn);
// POST /api/games/players/:player_id/replace-cards - Замена карт (требует авторизации и владения игроком)
router.post('/players/:player_id/replace-cards', requireAuth, requirePlayerOwnership, GameController.replaceCards);
// POST /api/games/:game_id/next-turn - Переход к следующему игроку (внутренний, требует участия в игре)
router.post('/:game_id/next-turn', requireAuth, requireGameParticipant, GameController.nextTurn);
// POST /api/games/:game_id/check-timeout - Проверка таймаута хода (внутренний, требует участия в игре)
router.post('/:game_id/check-timeout', requireAuth, requireGameParticipant, GameController.checkTurnTimeout);
// POST /api/games/:game_id/determine-winner - Определение победителя (внутренний, требует участия в игре)
router.post('/:game_id/determine-winner', requireAuth, requireGameParticipant, GameController.determineWinner);
// POST /api/games/:game_id/new-round - Сброс раунда (внутренний, требует участия в игре)
router.post('/:game_id/new-round', requireAuth, requireGameParticipant, GameController.newRound);
// DELETE /api/games/:game_id - Удаление игры (требует авторизации)
router.delete('/:game_id', requireAuth, GameController.deleteGame);
// GET /api/games/debug/logs - Получение отладочных логов игры (только для разработки, требует авторизации)
router.get('/debug/logs', requireAuth, (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
        res.status(403).json({ success: false, error: 'Debug logs are disabled in production' });
        return;
    }
    const logs = getLogContents();
    res.type('text/plain').send(logs);
});
// POST /api/games/debug/clear-logs - Очистка отладочных логов (только для разработки, требует авторизации)
router.post('/debug/clear-logs', requireAuth, (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
        res.status(403).json({ success: false, error: 'Debug logs are disabled in production' });
        return;
    }
    clearLog();
    res.json({ success: true, message: 'Logs cleared' });
});
export { router as gameRoutes };
