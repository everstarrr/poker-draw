import { Request, Response, NextFunction } from 'express';
import { db } from '../config/database.js';

// Middleware для проверки email из заголовка
export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const emailHeader = req.headers['x-user-email'];
    const email = typeof emailHeader === 'string' ? emailHeader : undefined;

    if (!email) {
      res.status(401).json({ success: false, error: 'Требуется авторизация. Укажите email в заголовке x-user-email' });
      return;
    }

    // Проверяем, существует ли пользователь с таким email
    const result = await db.query(
      'SELECT email FROM users WHERE email = $1',
      [email]
    );

    if (result.length === 0) {
      res.status(401).json({ success: false, error: 'Пользователь не найден. Пожалуйста, войдите в систему' });
      return;
    }

    // Сохраняем email в req для дальнейшего использования
    req.userEmail = email;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ success: false, error: 'Ошибка аутентификации' });
  }
};

// Middleware для проверки, что игрок имеет доступ к действию с этим player_id
export const requirePlayerOwnership = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { player_id } = req.params;
    const userEmail = req.userEmail;

    if (!userEmail) {
      res.status(401).json({ success: false, error: 'Требуется авторизация' });
      return;
    }

    if (!player_id) {
      res.status(400).json({ success: false, error: 'Не указан player_id' });
      return;
    }

    // Проверяем, принадлежит ли player_id этому пользователю
    const result = await db.query(
      `SELECT p.id FROM players p
       WHERE p.id = $1 AND LOWER(p.email) = LOWER($2)`,
      [player_id, userEmail]
    );

    if (result.length === 0) {
      res.status(403).json({ success: false, error: 'У вас нет прав для выполнения действий от имени этого игрока' });
      return;
    }

    next();
  } catch (error) {
    console.error('Player ownership middleware error:', error);
    res.status(500).json({ success: false, error: 'Ошибка проверки прав доступа' });
  }
};

// Middleware для проверки, что пользователь является участником игры
export const requireGameParticipant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { game_id } = req.params;
    const userEmail = req.userEmail;

    if (!userEmail) {
      res.status(401).json({ success: false, error: 'Требуется авторизация' });
      return;
    }

    if (!game_id) {
      res.status(400).json({ success: false, error: 'Не указан game_id' });
      return;
    }

    // Проверяем, является ли пользователь участником игры
    const result = await db.query(
      `SELECT p.id FROM players p
       WHERE p.game_id = $1 AND LOWER(p.email) = LOWER($2)`,
      [game_id, userEmail]
    );

    if (result.length === 0) {
      res.status(403).json({ success: false, error: 'Вы не являетесь участником этой игры' });
      return;
    }

    next();
  } catch (error) {
    console.error('Game participant middleware error:', error);
    res.status(500).json({ success: false, error: 'Ошибка проверки участия в игре' });
  }
};

// Middleware для проверки, что пользователь является создателем игры
export const requireGameCreator = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { game_id } = req.params;
    const userEmail = req.userEmail;

    if (!userEmail) {
      res.status(401).json({ success: false, error: 'Требуется авторизация' });
      return;
    }

    if (!game_id) {
      res.status(400).json({ success: false, error: 'Не указан game_id' });
      return;
    }

    // Проверяем, является ли пользователь создателем игры
    const result = await db.query(
      `SELECT id FROM games WHERE id = $1 AND LOWER(created_by) = LOWER($2)`,
      [game_id, userEmail]
    );

    if (result.length === 0) {
      res.status(403).json({ success: false, error: 'Только создатель игры может выполнить это действие' });
      return;
    }

    next();
  } catch (error) {
    console.error('Game creator middleware error:', error);
    res.status(500).json({ success: false, error: 'Ошибка проверки прав создателя' });
  }
};

// Расширяем тип Request для TypeScript
declare global {
  namespace Express {
    interface Request {
      userEmail?: string;
    }
  }
}
