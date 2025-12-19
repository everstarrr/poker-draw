# Настройка баланса пользователей

## Применение миграции

Выполните SQL скрипт `balance_migration.sql` в вашей базе данных PostgreSQL:

```bash
# Через psql
psql -h helios.cs.ifmo.ru -U s368909 -d studs -f balance_migration.sql

# Или через SSH туннель
psql -h localhost -p 5432 -U s368909 -d studs -f balance_migration.sql
```

## Что делает миграция:

1. **Добавляет колонку `balance`** в таблицу `users` (по умолчанию 0)
2. **Устанавливает начальный баланс 10000** для всех существующих пользователей
3. **Создает функцию `add_balance()`** - начисление баланса пользователю
4. **Обновляет `register_user()`** - теперь создает пользователей с балансом 10000
5. **Обновляет `join_game()`** - проверяет достаточность баланса и списывает buy_in
6. **Обновляет `leave_game()`** - возвращает стек обратно на баланс пользователя
7. **Обновляет `get_player_info()`** - теперь возвращает баланс пользователя

## Новый эндпоинт

### `POST /api/users/:email/balance`
Начисление баланса пользователю

**Пример:**
```bash
curl -X POST http://localhost:3000/api/users/player1@test.com/balance \
  -H "Content-Type: application/json" \
  -d '{"amount": 5000}'
```

**Ответ:**
```json
{
  "success": true,
  "email": "player1@test.com",
  "amount_added": 5000,
  "new_balance": 15000,
  "message": "Balance added successfully"
}
```

## Проверка баланса при входе в игру

Теперь при попытке присоединиться к игре проверяется:

1. **Достаточно ли баланса** - `balance >= buy_in`
2. **Списывается buy_in** с баланса при входе
3. **Возвращается стек** на баланс при выходе

**Пример ошибки при недостаточном балансе:**
```json
{
  "success": false,
  "error": "Insufficient balance. You have 1000, but need 5000",
  "balance": 1000,
  "required": 5000
}
```

## Обновленные API ответы

### GET /api/users
Теперь возвращает баланс:
```json
{
  "success": true,
  "users": [
    {
      "email": "player1@test.com",
      "username": "Player1",
      "balance": 10000,
      "last_activity": "2025-11-25T12:00:00.000Z"
    }
  ],
  "count": 1
}
```

### GET /api/users/:email
Информация о пользователе с балансом:
```json
{
  "success": true,
  "user": {
    "email": "player1@test.com",
    "username": "Player1",
    "balance": 10000,
    "last_activity": "2025-11-25T12:00:00.000Z"
  },
  "active_games": []
}
```

### POST /api/games/:game_id/join
При успешном входе возвращает оставшийся баланс:
```json
{
  "success": true,
  "player_id": "uuid",
  "position": 1,
  "stack": 5000,
  "remaining_balance": 5000
}
```

## Логика баланса

### Регистрация
- Новый пользователь получает **10000** начального баланса

### Вход в игру
- Проверка: `balance >= buy_in`
- Списание: `balance = balance - buy_in`
- Стек игрока: `stack = buy_in`

### Выход из игры
- Возврат: `balance = balance + stack`
- Игрок забирает весь свой текущий стек

### Начисление
- Админ может начислить баланс через API
- `balance = balance + amount`
