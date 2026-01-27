# Защита API от неавторизованного доступа

## Реализованные меры безопасности

### 1. Middleware авторизации

Создан файл `server/src/middleware/auth.ts` с четырьмя middleware:

#### `requireAuth`
- Проверяет наличие заголовка `x-user-email`
- Проверяет существование пользователя в базе данных
- Блокирует запросы от неавторизованных пользователей
- Сохраняет email в `req.userEmail` для использования в контроллерах

#### `requirePlayerOwnership`
- Проверяет, что пользователь может выполнять действия только от имени своего игрока
- Проверяет соответствие `player_id` и email пользователя
- Блокирует попытки походить за других игроков

#### `requireGameParticipant`
- Проверяет, что пользователь является участником конкретной игры
- Блокирует управление чужими играми (start, next-turn, new-round и т.д.)

#### `requireGameCreator`
- Проверяет, что пользователь является создателем игры
- Используется для критических операций (удаление игры)

### 2. WebSocket безопасность

#### Валидация email при подключении
- При подключении к WebSocket проверяется, что email существует в базе данных
- Невалидные email приводят к анонимному подключению (без доступа к картам)
- Каждому игроку отправляется состояние игры через `get_game_state_for_email()` - карты видны только владельцу

### 3. Защищенные эндпоинты

#### Игровые действия (требуют авторизации И владения игроком):
- `POST /api/games/players/:player_id/actions/fold` - Фолд
- `POST /api/games/players/:player_id/actions/check` - Чек
- `POST /api/games/players/:player_id/actions/call` - Колл
- `POST /api/games/players/:player_id/actions/raise` - Рейз
- `POST /api/games/players/:player_id/actions/all-in` - Ва-банк
- `POST /api/games/players/:player_id/replace-cards` - Замена карт
- `POST /api/games/players/:player_id/leave` - Выход из игры

#### Управление играми (требуют авторизации И участия в игре):
- `POST /api/games/:game_id/start` - Начало игры
- `POST /api/games/:game_id/next-turn` - Переход хода
- `POST /api/games/:game_id/check-timeout` - Проверка таймаута
- `POST /api/games/:game_id/determine-winner` - Определение победителя
- `POST /api/games/:game_id/new-round` - Новый раунд

#### Общие операции (требуют авторизации):
- `POST /api/games` - Создание игры
- `POST /api/games/:game_id/join` - Присоединение к игре
- `POST /api/games/:game_id/leave` - Выход из игры по email
- `DELETE /api/games/:game_id` - Удаление игры (дополнительно проверяется, что удаляет создатель)

#### Отладочные эндпоинты (требуют авторизации, отключены в production):
- `GET /api/games/debug/logs` - Получение логов
- `POST /api/games/debug/clear-logs` - Очистка логов

#### Публичные эндпоинты (не требуют авторизации):
- `GET /api/games` - Список доступных игр
- `GET /api/games/:game_id` - Состояние игры (карты скрыты для неавторизованных)

### 3. Изменения в контроллерах

Все методы контроллера теперь используют `req.userEmail` вместо чтения заголовка напрямую:
- `GameController.createGame` - email создателя из middleware
- `GameController.joinGame` - email игрока из middleware
- `GameController.leaveGameByEmail` - email из middleware
- `GameController.deleteGame` - проверка, что удаляет создатель

### 4. Изменения на клиенте

#### HTTP интерцептор
В `client/src/api/http.ts` настроен интерцептор, который автоматически добавляет заголовок `x-user-email` ко всем запросам из localStorage.

#### Обновленные API функции
- `joinGame` - убран параметр email (отправляется через заголовок)
- `leaveGameByEmail` - убран параметр email из тела запроса

## Что защищено

✅ **Неавторизованные пользователи не могут:**
- Создавать игры
- Присоединяться к играм
- Делать ходы
- Выходить из игр
- Удалять игры
- Видеть карты других игроков через WebSocket

✅ **Авторизованные пользователи не могут:**
- Делать ходы за других игроков
- Удалять чужие игры (только свои)
- Выгонять других игроков
- Управлять чужими играми (start, next-turn, new-round и т.д.)
- Видеть карты других игроков (WebSocket проверяет email в БД)
- Просматривать debug-логи в production

✅ **WebSocket безопасность:**
- Email валидируется в базе данных при подключении
- Невалидный email = анонимное подключение без карт
- Каждому игроку отправляется персонализированное состояние

✅ **Публично доступно:**
- Просмотр списка игр
- Просмотр состояния игры (с ограничениями по видимости карт)

## Тестирование

Для проверки защиты:

1. Попытка создать игру без заголовка:
```bash
curl -X POST http://localhost:3000/api/games \
  -H "Content-Type: application/json" \
  -d '{"name": "Test"}'
# Ответ: 401 Unauthorized
```

2. Попытка походить за другого игрока:
```bash
curl -X POST http://localhost:3000/api/games/players/123/actions/fold \
  -H "x-user-email: wrong@user.com"
# Ответ: 403 Forbidden
```

3. Успешный запрос:
```bash
curl -X POST http://localhost:3000/api/games \
  -H "x-user-email: user@example.com" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Game"}'
# Ответ: 200 OK с данными игры
```
