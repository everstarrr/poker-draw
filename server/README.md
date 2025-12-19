# Poker Draw Backend

Бэкенд для игры в покер с использованием PostgreSQL и SQL функций.

## Требования

- Node.js 18+
- PostgreSQL 12+
- pnpm (рекомендуется)

## Установка

1. Установите зависимости из корня проекта:
```bash
pnpm install
```

2. Создайте файл `.env` в папке `server` со следующим содержимым:
```env
# SSH туннель
SSH_HOST=se.ifmo.ru
SSH_PORT=2222
SSH_USER=s368909
SSH_PASSWORD=your_password

# База данных
DB_HOST=helios.cs.ifmo.ru
DB_PORT=5432
DB_USER=s368909
DB_PASSWORD=your_db_password
DB_NAME=studs

# Сервер
PORT=3000
NODE_ENV=development
```

**Важно:** Настройте переменные окружения в соответствии с вашей конфигурацией PostgreSQL.

3. Инициализируйте карты в базе данных:
```bash
pnpm init-cards
```

Эта команда создаст все 52 карты в таблице `Cards`.

## Запуск

### Режим разработки (с hot-reload):
```bash
# Из корня проекта
pnpm server:dev

# Или из папки server
cd server && pnpm dev
```

### Продакшн режим:
```bash
pnpm run build
pnpm start
```

Сервер будет доступен по адресу `http://localhost:3000`

## API Endpoints

### Пользователи

#### `POST /api/users/register`
Регистрация нового пользователя
```bash
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "username": "player1",
    "password": "password123"
  }'
```

#### `GET /api/users`
Получение списка всех зарегистрированных пользователей (без паролей)
```bash
curl http://localhost:3000/api/users
```

#### `GET /api/users/:email`
Получение информации о конкретном пользователе
```bash
curl http://localhost:3000/api/users/user@example.com
```

### Игры

#### `POST /api/games`
Создание новой игры
```bash
curl -X POST http://localhost:3000/api/games 
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Game",
    "max_players": 6,
    "max_turn_time": 30,
    "big_blind": 100,
    "min_stack": 1000,
    "max_stack": 10000
  }'
```

#### `GET /api/games`
Получение списка доступных игр

#### `GET /api/games/:game_id`
Получение состояния игры

#### `POST /api/games/:game_id/start`
Начало игры (раздача карт)

#### `POST /api/games/:game_id/join`
Присоединение к игре
```bash
curl -X POST http://localhost:3000/api/games/{game_id}/join \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "buy_in": 5000
  }'
```

#### `POST /api/games/players/:player_id/leave`
Выход из игры

#### `POST /api/games/:game_id/new-round`
Начать новый раунд (сброс карт, ставок)

#### `DELETE /api/games/:game_id`
Удаление игры

### Действия игроков

#### `POST /api/games/players/:player_id/actions/fold`
Сброс карт (FOLD)

#### `POST /api/games/players/:player_id/actions/check`
Пропуск без ставки (CHECK)

#### `POST /api/games/players/:player_id/actions/call`
Уравнять ставку (CALL)

#### `POST /api/games/players/:player_id/actions/raise`
Повышение ставки (RAISE)
```bash
curl -X POST http://localhost:3000/api/games/players/{player_id}/actions/raise \
  -H "Content-Type: application/json" \
  -d '{"raise_amount": 200}'
```

#### `POST /api/games/players/:player_id/actions/all-in`
Ва-банк (ALL-IN)

#### `POST /api/games/players/:player_id/replace-cards`
Замена карт (передать индексы позиций 0-4)
```bash
curl -X POST http://localhost:3000/api/games/players/{player_id}/replace-cards \
  -H "Content-Type: application/json" \
  -d '{"card_ids_to_discard": [0, 2, 4]}'
```

### Игровой процесс

#### `POST /api/games/:game_id/next-turn`
Переход к следующему игроку

#### `POST /api/games/:game_id/check-timeout`
Проверка таймаута хода (автоматический FOLD при превышении времени)

#### `POST /api/games/:game_id/determine-winner`
Определение победителя и распределение банка

## Структура проекта

```
server/
├── src/
│   ├── app.ts                 # Главный файл приложения
│   ├── config/
│   │   └── database.ts        # Конфигурация SSH туннеля и БД
│   ├── controllers/
│   │   ├── userController.ts  # Контроллер для пользователей
│   │   └── gameController.ts  # Контроллер для игр
│   ├── routes/
│   │   ├── userRoutes.ts      # Роуты для пользователей
│   │   └── gameRoutes.ts      # Роуты для игр
│   └── scripts/
│       └── initCards.ts       # Скрипт инициализации карт
├── models.txt                 # SQL схема базы данных
├── funcs.txt                  # SQL функции
└── package.json
```

## Архитектура

Проект использует **SQL функции** в PostgreSQL вместо ORM моделей. Все бизнес-логика находится в базе данных.

### Основные SQL функции:
- `register_user()` - Регистрация пользователя
- `create_game()` - Создание игры
- `join_game()` - Присоединение к игре
- `start_game()` - Начало игры и раздача карт
- `player_fold()`, `player_check()`, `player_call()`, `player_raise()`, `player_all_in()` - Действия игрока
- `replace_cards()` - Замена карт
- `next_turn()` - Переход хода
- `determine_winner()` - Определение победителя
- `new_round()` - Новый раунд
- `get_game_state_json()` - Получение состояния игры
- `get_available_games()` - Список доступных игр
- `get_player_info()` - Информация об игроке

## База данных

Таблицы:
- `users` - Пользователи
- `games` - Игры
- `players` - Игроки за столом
- `cards` - Карты (52 карты)
- `bets` - Ставки
- `deck` - Колода для игры
- `players_cards` - Карты игроков

## Последовательность игры

1. Регистрация 2+ пользователей (`POST /api/users/register`)
2. Создание игры (`POST /api/games`)
3. Присоединение игроков (`POST /api/games/:game_id/join`)
4. Старт игры (`POST /api/games/:game_id/start`)
5. Раунд ставок (fold/check/call/raise/all-in)
6. Замена карт (`POST /api/games/players/:player_id/replace-cards`)
7. Второй раунд ставок
8. Определение победителя (`POST /api/games/:game_id/determine-winner`)
9. Новый раунд или выход (`POST /api/games/:game_id/new-round`)
