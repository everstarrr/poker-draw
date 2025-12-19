import { Request, Response } from 'express';
import { db } from '../config/database.js';

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

      if (!name) {
        res.status(400).json({ success: false, error: 'Game name is required' });
        return;
      }

      const result = await db.query(
        'SELECT create_game($1, $2, $3, $4, $5, $6) as result',
        [name, max_players, max_turn_time, big_blind, min_stack, max_stack]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
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

      const result = await db.query(
        'SELECT get_game_state_json($1) as result',
        [game_id]
      );

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
      const { email, buy_in } = req.body;

      if (!email || !buy_in) {
        res.status(400).json({ success: false, error: 'Email and buy_in are required' });
        return;
      }

      const result = await db.query(
        'SELECT join_game($1, $2, $3) as result',
        [game_id, email, buy_in]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
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

      const result = await db.query(
        'SELECT leave_game($1) as result',
        [player_id]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
      } else {
        res.status(400).json(response);
      }
    } catch (error) {
      console.error('Leave game error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // Сброс карт (FOLD)
  static async playerFold(req: Request, res: Response): Promise<void> {
    try {
      const { player_id } = req.params;

      const result = await db.query(
        'SELECT player_fold($1) as result',
        [player_id]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
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

      const result = await db.query(
        'SELECT player_check($1) as result',
        [player_id]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
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

      const result = await db.query(
        'SELECT player_call($1) as result',
        [player_id]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
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

      const result = await db.query(
        'SELECT player_raise($1, $2) as result',
        [player_id, raise_amount]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
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

      const result = await db.query(
        'SELECT player_all_in($1) as result',
        [player_id]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
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

      const result = await db.query(
        'SELECT replace_cards($1, $2) as result',
        [player_id, cardIds]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
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

      const result = await db.query(
        'DELETE FROM games WHERE id = $1 RETURNING id',
        [game_id]
      );

      if (result.length > 0) {
        res.json({ success: true, message: 'Game deleted successfully', game_id });
      } else {
        res.status(404).json({ success: false, error: 'Game not found' });
      }
    } catch (error) {
      console.error('Delete game error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
