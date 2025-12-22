# Миграция для добавления функции login_user

Этот файл содержит SQL функцию для авторизации пользователей.

## Применение миграции

Из корня проекта или папки server выполните:

```bash
# Из папки server
pnpm migrate-login

# Или из корня проекта
pnpm server:migrate-login
```

## Что делает эта миграция

Создает SQL функцию `login_user(email, password)` которая:
1. Проверяет существование пользователя по email
2. Проверяет корректность пароля
3. Обновляет время последней активности
4. Возвращает данные пользователя (email, username, balance)

## Использование

После применения миграции эндпоинт `POST /api/users/login` будет работать корректно.

Пример запроса:
```bash
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

Пример ответа (успешный):
```json
{
  "success": true,
  "email": "test@example.com",
  "username": "TestUser",
  "balance": 10000,
  "message": "Login successful"
}
```

Пример ответа (ошибка):
```json
{
  "success": false,
  "error": "Неверный email или пароль"
}
```
