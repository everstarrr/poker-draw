import { Router } from 'express';
import { UserController } from '../controllers/userController.js';

const router = Router();

// POST /api/users/login - Вход пользователя
router.post('/login', UserController.loginUser);

// POST /api/users/register - Регистрация пользователя
router.post('/register', UserController.registerUser);

// GET /api/users - Получение списка всех пользователей
router.get('/', UserController.getAllUsers);

// POST /api/users/:email/balance - Начисление баланса пользователю
router.post('/:email/balance', UserController.addBalance);

// GET /api/users/:email - Получение информации о пользователе
router.get('/:email', UserController.getPlayerInfo);

export { router as userRoutes };

