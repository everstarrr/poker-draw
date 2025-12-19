import { Request, Response } from "express";
import { db } from "../config/database.js";

export class UserController {
  // Регистрация пользователя
  static async registerUser(req: Request, res: Response): Promise<void> {
    try {
      const { email, username, password } = req.body;

      if (!email || !username || !password) {
        res
          .status(400)
          .json({ success: false, error: "Missing required fields" });
        return;
      }

      const result = await db.query(
        "SELECT register_user($1, $2, $3) as result",
        [email, username, password]
      );

      const response = result[0].result;

      if (response.success) {
        res.json(response);
      } else {
        res.status(400).json(response);
      }
    } catch (error) {
      console.error("Register user error:", error);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }

  // Получение информации о пользователе
  static async getPlayerInfo(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.params;

      const result = await db.query("SELECT get_player_info($1) as result", [
        email,
      ]);

      const response = result[0].result;

      if (response.success) {
        res.json(response);
      } else {
        res.status(404).json(response);
      }
    } catch (error) {
      console.error("Get player info error:", error);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }

  // Получение списка всех зарегистрированных пользователей
  static async getAllUsers(_: Request, res: Response): Promise<void> {
    try {
      const result = await db.query(
        "SELECT email, username, last_activity FROM users ORDER BY last_activity DESC"
      );

      res.json({
        success: true,
        users: result,
        count: result.length,
      });
    } catch (error) {
      console.error("Get all users error:", error);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }

  // Начисление баланса пользователю
  static async addBalance(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.params;
      const { amount } = req.body;

      if (!amount || amount <= 0) {
        res
          .status(400)
          .json({ success: false, error: "Amount must be a positive number" });
        return;
      }

      const result = await db.query("SELECT add_balance($1, $2) as result", [
        email,
        amount,
      ]);

      const response = result[0].result;

      if (response.success) {
        res.json(response);
      } else {
        res.status(400).json(response);
      }
    } catch (error) {
      console.error("Add balance error:", error);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
}
