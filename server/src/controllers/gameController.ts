import { Request, Response } from 'express';
import { db } from '../config/database.js';
import { pushGameState, startTurnTimer, checkAndHandleWinner, ensureBlindsPublic } from '../ws/hub.js';
import { gameLog } from '../utils/gameLogger.js';

export class GameController {
  // Создание игры
  static async createGame(req: Request, res: Response): Promise<void> {
    try {
      const {
        name,
        max_players = 6,
        max_turn_time = 30,
        big_blind = 100,
        min_stack = 1000,
        max_stack = 10000,
      } = req.body;

      const creatorEmail = req.userEmail; // Берем из middleware

      if (!creatorEmail) {
        res.status(401).json({ success: false, error: 'Требуется авторизация' });
        return;
      }

      if (!name) {
        res.status(400).json({ success: false, error: 'Название игры обязательно' });
        return;
      }

      const result = await db.query(
        'SELECT create_game_with_creator($1, $2, $3, $4, $5, $6, $7) as result',
        [name, max_players, max_turn_time, big_blind, min_stack, max_stack, creatorEmail]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
        // Auto-join creator into the newly created game with default buy-in (min_stack)
        try {
          const gameId: string | undefined = response?.game_id;
          const buyIn = Number(min_stack) || 0;
          if (gameId && creatorEmail && buyIn > 0) {
            try { await db.query('SELECT join_game($1, $2, $3) as result', [gameId, creatorEmail, buyIn]); } catch {}
            try { await pushGameState(gameId); } catch {}
          }
        } catch {}
      } else {
        res.status(400).json(response);
      }
    } catch (error) {
      console.error('Create game error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // Получение списка доступных игр
  static async getAvailableGames(_: Request, res: Response): Promise<void> {
    try {
      const result = await db.query('SELECT get_available_games() as result');
      const games = result[0].result;

      res.json(games || []);
    } catch (error) {
      console.error('Get available games error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // Получение состояния игры
  static async getGameState(req: Request, res: Response): Promise<void> {
    try {
      const { game_id } = req.params;
      const emailHeader = req.headers['x-user-email'];
      const viewerEmail = typeof emailHeader === 'string' ? emailHeader : undefined;

      let result;
      if (viewerEmail) {
        result = await db.query('SELECT get_game_state_for_email($1, $2) as result', [game_id, viewerEmail]);
      } else {
        result = await db.query('SELECT get_game_state_public($1) as result', [game_id]);
      }

      const gameState = result[0].result;

      if (!gameState || !gameState.game) {
        res.status(404).json({ success: false, error: 'Game not found' });
        return;
      }

      res.json(gameState);
    } catch (error) {
      console.error('Get game state error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // Начало игры
  static async startGame(req: Request, res: Response): Promise<void> {
    try {
      const { game_id } = req.params;

      const result = await db.query(
        'SELECT start_game($1) as result',
        [game_id]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
        try {
          await pushGameState(game_id);
          await ensureBlindsPublic(game_id);
          await startTurnTimer(game_id);
        } catch {}
      } else {
        res.status(400).json(response);
      }
    } catch (error) {
      console.error('Start game error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // Новая раздача
  static async newRound(req: Request, res: Response): Promise<void> {
    try {
      const { game_id } = req.params;

      const result = await db.query(
        'SELECT new_round($1) as result',
        [game_id]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
        try {
          await pushGameState(game_id);
          await ensureBlindsPublic(game_id);
          await startTurnTimer(game_id);
        } catch {}
      } else {
        res.status(400).json(response);
      }
    } catch (error) {
      console.error('New round error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // Присоединение к игре
  static async joinGame(req: Request, res: Response): Promise<void> {
    try {
      const { game_id } = req.params;
      const { buy_in } = req.body;
      const email = req.userEmail; // Берем из middleware

      if (!email) {
        res.status(401).json({ success: false, error: 'Требуется авторизация' });
        return;
      }

      if (!buy_in) {
        res.status(400).json({ success: false, error: 'buy_in обязателен' });
        return;
      }

      const result = await db.query(
        'SELECT join_game($1, $2, $3) as result',
        [game_id, email, buy_in]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
        try {
          await pushGameState(game_id);
          await startTurnTimer(game_id);
        } catch {}
      } else {
        res.status(400).json(response);
      }
    } catch (error) {
      console.error('Join game error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // Выход из игры
  static async leaveGame(req: Request, res: Response): Promise<void> {
    try {
      const { player_id } = req.params;

      // Fetch game_id before deleting
      const gidRows = await db.query('SELECT game_id FROM players WHERE id = $1', [player_id]);
      const game_id: string | undefined = gidRows?.[0]?.game_id;

      const result = await db.query(
        'SELECT leave_game($1) as result',
        [player_id]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
        try {
          if (game_id) {
            await pushGameState(game_id);
            await checkAndHandleWinner(game_id);
            await startTurnTimer(game_id);
          }
        } catch {}
      } else {
        res.status(400).json(response);
      }
    } catch (error) {
      console.error('Leave game error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // Выход из игры по email + game_id (удобно для фронтенда)
  static async leaveGameByEmail(req: Request, res: Response): Promise<void> {
    try {
      const { game_id } = req.params;
      const email = req.userEmail; // Берем из middleware

      if (!game_id || !email) {
        res.status(400).json({ success: false, error: 'game_id и email обязательны' });
        return;
      }

      // Находим player_id по game_id и email
      const rows = await db.query(
        'SELECT id, game_id FROM players WHERE game_id = $1 AND lower(email) = lower($2) ORDER BY id DESC LIMIT 1',
        [game_id, email]
      );

      if (!rows || rows.length === 0) {
        // Игрок уже вышел — считаем успешным выходом
        res.json({ success: true, message: 'Already left or not in game' });
        return;
      }

      const pid = rows[0].id;
      const gid: string | undefined = rows[0].game_id;
      const result = await db.query('SELECT leave_game($1) as result', [pid]);
      const response = result[0].result;

      if (response.success) {
        res.json(response);
        try {
          if (gid) {
            await pushGameState(gid);
            await checkAndHandleWinner(gid);
            await startTurnTimer(gid);
          }
        } catch {}
      } else {
        res.status(400).json(response);
      }
    } catch (error) {
      console.error('Leave game by email error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // Сброс карт (FOLD)
  static async playerFold(req: Request, res: Response): Promise<void> {
    try {
      const { player_id } = req.params;

      // Resolve game_id for broadcasting
      const gidRows = await db.query('SELECT game_id FROM players WHERE id = $1', [player_id]);
      const game_id: string | undefined = gidRows?.[0]?.game_id;

      const result = await db.query(
        'SELECT player_fold($1) as result',
        [player_id]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
        try {
          if (game_id) {
            await pushGameState(game_id);
            await checkAndHandleWinner(game_id);
            await startTurnTimer(game_id);
          }
        } catch {}
      } else {
        res.status(400).json(response);
      }
    } catch (error) {
      console.error('Player fold error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // Пропуск без ставки (CHECK)
  static async playerCheck(req: Request, res: Response): Promise<void> {
    try {
      const { player_id } = req.params;

      const gidRows = await db.query('SELECT game_id FROM players WHERE id = $1', [player_id]);
      const game_id: string | undefined = gidRows?.[0]?.game_id;

      gameLog('ACTION', `CHECK by player ${player_id}`, { game_id });

      const result = await db.query(
        'SELECT player_check($1) as result',
        [player_id]
      );

      const response = result[0].result;
      gameLog('ACTION_RESULT', `CHECK result`, response);

      // Проверяем фазу после действия
      if (game_id) {
        const phaseRows = await db.query('SELECT phase, pot, current_player_id FROM games WHERE id = $1', [game_id]);
        const phase = phaseRows[0]?.phase;
        gameLog('PHASE_AFTER_ACTION', `After CHECK`, phaseRows[0]);
        
        // Если перешли в showdown - СРАЗУ определяем победителя до отправки ответа
        if (phase === 'showdown') {
          gameLog('SHOWDOWN_TRIGGERED', 'Phase changed to showdown, determining winner immediately');
          try {
            // Логируем карты всех игроков перед определением победителя
            const playersCardsLog = await db.query(`
              SELECT p.id, p.email, 
                     array_agg(c.number || ' ' || c.suit ORDER BY c.id) as cards
              FROM Players p
              LEFT JOIN Players_Cards pc ON pc.player_id = p.id
              LEFT JOIN Cards c ON c.id = pc.card_id
              WHERE p.game_id = $1 AND p.status != 'FOLD'
              GROUP BY p.id, p.email
            `, [game_id]);
            gameLog('SHOWDOWN_CARDS', 'Player cards before winner determination', playersCardsLog);

            const winRes = await db.query('SELECT determine_winner($1) as result', [game_id]);
            gameLog('SHOWDOWN_WINNER', 'Winner determined', winRes?.[0]?.result);
            
            if (winRes?.[0]?.result?.success) {
              const winnerId = winRes[0].result.winner_id;
              const winnerEmail = winRes[0].result.winner_email;
              const handName = winRes[0].result.hand_name;
              
              // Отправляем победителя всем клиентам через WebSocket
              const { pushWinnerMessage } = await import('../ws/hub.js');
              await pushWinnerMessage(game_id, winnerId, winnerEmail, handName);
            }
          } catch (err) {
            gameLog('SHOWDOWN_ERROR', 'Failed to determine winner', String(err));
          }
        }
      }

      if (response.success) {
        res.json(response);
        try { if (game_id) { await pushGameState(game_id); await checkAndHandleWinner(game_id); await startTurnTimer(game_id); } } catch {}
      } else {
        res.status(400).json(response);
      }
    } catch (error) {
      console.error('Player check error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // Уравнять ставку (CALL)
  static async playerCall(req: Request, res: Response): Promise<void> {
    try {
      const { player_id } = req.params;

      const gidRows = await db.query('SELECT game_id FROM players WHERE id = $1', [player_id]);
      const game_id: string | undefined = gidRows?.[0]?.game_id;

      gameLog('ACTION', `CALL by player ${player_id}`, { game_id });

      const result = await db.query(
        'SELECT player_call($1) as result',
        [player_id]
      );

      const response = result[0].result;
      gameLog('ACTION_RESULT', `CALL result`, response);

      // Проверяем фазу после действия
      if (game_id) {
        const phaseRows = await db.query('SELECT phase, pot, current_player_id FROM games WHERE id = $1', [game_id]);
        const phase = phaseRows[0]?.phase;
        gameLog('PHASE_AFTER_ACTION', `After CALL`, phaseRows[0]);
        
        // Если перешли в showdown - СРАЗУ определяем победителя до отправки ответа
        if (phase === 'showdown') {
          gameLog('SHOWDOWN_TRIGGERED', 'Phase changed to showdown after CALL, determining winner immediately');
          try {
            const winRes = await db.query('SELECT determine_winner($1) as result', [game_id]);
            gameLog('SHOWDOWN_WINNER', 'Winner determined', winRes?.[0]?.result);
            
            if (winRes?.[0]?.result?.success) {
              const winnerId = winRes[0].result.winner_id;
              const winnerEmail = winRes[0].result.winner_email;
              const handName = winRes[0].result.hand_name;
              
              // Отправляем победителя всем клиентам через WebSocket
              const { pushWinnerMessage } = await import('../ws/hub.js');
              await pushWinnerMessage(game_id, winnerId, winnerEmail, handName);
            }
          } catch (err) {
            gameLog('SHOWDOWN_ERROR', 'Failed to determine winner after CALL', String(err));
          }
        }
      }

      if (response.success) {
        res.json(response);
        try { if (game_id) { await pushGameState(game_id); await checkAndHandleWinner(game_id); await startTurnTimer(game_id); } } catch {}
      } else {
        res.status(400).json(response);
      }
    } catch (error) {
      console.error('Player call error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // Повышение ставки (RAISE)
  static async playerRaise(req: Request, res: Response): Promise<void> {
    try {
      const { player_id } = req.params;
      const { raise_amount } = req.body;

      if (!raise_amount || raise_amount <= 0) {
        res.status(400).json({ success: false, error: 'Raise amount is required' });
        return;
      }

      const gidRows = await db.query('SELECT game_id FROM players WHERE id = $1', [player_id]);
      const game_id: string | undefined = gidRows?.[0]?.game_id;

      const result = await db.query(
        'SELECT player_raise($1, $2) as result',
        [player_id, raise_amount]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
        try { if (game_id) { await pushGameState(game_id); await checkAndHandleWinner(game_id); await startTurnTimer(game_id); } } catch {}
      } else {
        res.status(400).json(response);
      }
    } catch (error) {
      console.error('Player raise error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // Ва-банк (ALL-IN)
  static async playerAllIn(req: Request, res: Response): Promise<void> {
    try {
      const { player_id } = req.params;

      const gidRows = await db.query('SELECT game_id FROM players WHERE id = $1', [player_id]);
      const game_id: string | undefined = gidRows?.[0]?.game_id;

      const result = await db.query(
        'SELECT player_all_in($1) as result',
        [player_id]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
        try { if (game_id) { await pushGameState(game_id); await checkAndHandleWinner(game_id); await startTurnTimer(game_id); } } catch {}
      } else {
        res.status(400).json(response);
      }
    } catch (error) {
      console.error('Player all-in error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // Замена карт
  static async replaceCards(req: Request, res: Response): Promise<void> {
    try {
      const { player_id } = req.params;
      const { card_ids_to_discard } = req.body;

      const cardIds = Array.isArray(card_ids_to_discard) ? card_ids_to_discard : [];

      const gidRows = await db.query('SELECT game_id FROM players WHERE id = $1', [player_id]);
      const game_id: string | undefined = gidRows?.[0]?.game_id;

      // Логируем карты ДО замены
      const cardsBefore = await db.query(`
        SELECT c.number, c.suit 
        FROM Players_Cards pc 
        JOIN Cards c ON pc.card_id = c.id 
        WHERE pc.player_id = $1 
        ORDER BY c.id
      `, [player_id]);
      gameLog('REPLACE_CARDS_BEFORE', 'Cards before replacement', { player_id, cards: cardsBefore, discarding: cardIds });

      const result = await db.query(
        'SELECT replace_cards($1, $2) as result',
        [player_id, cardIds]
      );

      const response = result[0].result;

      // Логируем карты ПОСЛЕ замены
      const cardsAfter = await db.query(`
        SELECT c.number, c.suit 
        FROM Players_Cards pc 
        JOIN Cards c ON pc.card_id = c.id 
        WHERE pc.player_id = $1 
        ORDER BY c.id
      `, [player_id]);
      gameLog('REPLACE_CARDS_AFTER', 'Cards after replacement', { player_id, cards: cardsAfter, response });

      if (response.success) {
        res.json(response);
        try { if (game_id) { await pushGameState(game_id); await checkAndHandleWinner(game_id); await startTurnTimer(game_id); } } catch {}
      } else {
        res.status(400).json(response);
      }
    } catch (error) {
      console.error('Replace cards error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // Переход к следующему игроку
  static async nextTurn(req: Request, res: Response): Promise<void> {
    try {
      const { game_id } = req.params;

      const result = await db.query(
        'SELECT next_turn($1) as result',
        [game_id]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
        try { await pushGameState(game_id); await checkAndHandleWinner(game_id); await startTurnTimer(game_id); } catch {}
      } else {
        res.status(400).json(response);
      }
    } catch (error) {
      console.error('Next turn error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // Проверка таймаута хода
  static async checkTurnTimeout(req: Request, res: Response): Promise<void> {
    try {
      const { game_id } = req.params;

      const result = await db.query(
        'SELECT check_turn_timeout($1) as result',
        [game_id]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
      } else {
        res.status(400).json(response);
      }
    } catch (error) {
      console.error('Check turn timeout error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // Определение победителя
  static async determineWinner(req: Request, res: Response): Promise<void> {
    try {
      const { game_id } = req.params;

      const result = await db.query(
        'SELECT determine_winner($1) as result',
        [game_id]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
      } else {
        res.status(400).json(response);
      }
    } catch (error) {
      console.error('Determine winner error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // Удаление игры
  static async deleteGame(req: Request, res: Response): Promise<void> {
    try {
      const { game_id } = req.params;
      const requesterEmail = req.userEmail; // Берем из middleware

      if (!requesterEmail) {
        res.status(401).json({ success: false, error: 'Требуется авторизация' });
        return;
      }

      // Fetch game creator and players count
      const gameRows = await db.query('SELECT created_by FROM games WHERE id = $1', [game_id]);
      if (!gameRows || gameRows.length === 0) {
        res.status(404).json({ success: false, error: 'Игра не найдена' });
        return;
      }

      const createdBy: string | null = gameRows[0].created_by || null;
      
      // Проверяем, что запрашивающий - создатель игры
      if (!createdBy || createdBy.toLowerCase() !== requesterEmail.toLowerCase()) {
        res.status(403).json({ success: false, error: 'Только создатель может удалить эту игру' });
        return;
      }

      const playersCountRows = await db.query('SELECT COUNT(*)::int AS cnt FROM players WHERE game_id = $1', [game_id]);
      const playersCount: number = playersCountRows?.[0]?.cnt ?? 0;

      // Allow deletion when room is truly empty, or when the only player is the creator
      if (playersCount > 0) {
        const players = await db.query('SELECT id, email FROM players WHERE game_id = $1', [game_id]);
        // If exactly one player and it is the creator, auto-leave them before deleting
        if (playersCount === 1 && players?.[0]?.email && createdBy && players[0].email.toLowerCase() === createdBy.toLowerCase()) {
          try { await db.query('SELECT leave_game($1) as result', [players[0].id]); } catch {}
        } else {
          res.status(400).json({ success: false, error: 'Комната должна быть пустой для удаления' });
          return;
        }
      }

      const result = await db.query('DELETE FROM games WHERE id = $1 RETURNING id', [game_id]);
      if (result.length > 0) {
        res.json({ success: true, message: 'Игра успешно удалена', game_id });
      } else {
        res.status(404).json({ success: false, error: 'Игра не найдена' });
      }
    } catch (error) {
      console.error('Delete game error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
