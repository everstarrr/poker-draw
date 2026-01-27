# 🚀 Развертывание Poker-Draw на Ubuntu сервере

## Обзор проекта

Проект представляет собой **pnpm monorepo** с двумя компонентами:
- **Client** — React + Vite + TypeScript + TailwindCSS
- **Server** — Express.js + TypeScript + WebSocket + PostgreSQL

---

## 📋 Часть 1: Подготовка сервера Ubuntu

### 1.1 Начальная настройка сервера

```bash
# Обновляем систему
sudo apt update && sudo apt upgrade -y

# Устанавливаем необходимые пакеты
sudo apt install -y curl git nginx ufw
```

### 1.2 Настройка файрвола

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### 1.3 Установка Node.js (v20+)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 1.4 Установка pnpm

```bash
corepack enable
corepack prepare pnpm@10.19.0 --activate

# Проверка
pnpm --version
```

---

## 📋 Часть 2: Интеграция с GitHub

### 2.1 Генерация SSH ключа на сервере

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
cat ~/.ssh/id_ed25519.pub
```

Скопируйте публичный ключ и добавьте его в GitHub:
1. Перейдите в **GitHub → Settings → SSH and GPG keys → New SSH key**
2. Вставьте ключ и сохраните

### 2.2 Клонирование репозитория

```bash
cd /var/www
sudo mkdir -p poker-draw
sudo chown $USER:$USER poker-draw
git clone git@github.com:ВАШ_ПОЛЬЗОВАТЕЛЬ/poker-draw.git poker-draw
cd poker-draw
```

### 2.3 Скрипт автоматического деплоя

Создайте файл `/var/www/poker-draw/deploy.sh`:

```bash
#!/bin/bash
cd /var/www/poker-draw
git pull origin main
pnpm install
pnpm build
sudo systemctl restart poker-server
echo "Deploy completed at $(date)"
```

Сделайте его исполняемым:
```bash
chmod +x deploy.sh
```

---

## 📋 Часть 3: Настройка приложения

### 3.1 Установка зависимостей

```bash
cd /var/www/poker-draw
pnpm install
```

### 3.2 Создание файла окружения для сервера

```bash
nano /var/www/poker-draw/server/.env
```

Содержимое:
```env
PORT=3000
NODE_ENV=production

# PostgreSQL через SSH туннель
DB_HOST=helios.cs.ifmo.ru
DB_PORT=5432
DB_NAME=ваша_база
DB_USER=ваш_пользователь
DB_PASSWORD=ваш_пароль

# SSH туннель
SSH_HOST=se.cs.ifmo.ru
SSH_PORT=22
SSH_USER=ваш_ssh_пользователь
SSH_PRIVATE_KEY_PATH=/home/ubuntu/.ssh/db_key
```

### 3.3 Создание файла окружения для клиента

```bash
nano /var/www/poker-draw/client/.env.production
```

Содержимое:
```env
VITE_API_BASE_URL=https://ваш-домен.com
```

### 3.4 Сборка проекта

```bash
pnpm build
```

---

## 📋 Часть 4: Настройка systemd для сервера

### 4.1 Создание systemd сервиса

```bash
sudo nano /etc/systemd/system/poker-server.service
```

Содержимое:
```ini
[Unit]
Description=Poker Draw API Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/poker-draw/server
ExecStart=/usr/bin/npx tsx src/app.ts
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

### 4.2 Запуск сервиса

```bash
sudo systemctl daemon-reload
sudo systemctl enable poker-server
sudo systemctl start poker-server

# Проверка статуса
sudo systemctl status poker-server

# Просмотр логов
sudo journalctl -u poker-server -f
```

---

## 📋 Часть 5: Настройка Nginx

### 5.1 Конфигурация Nginx для Cloudflare

> ⚠️ **Важно:** При использовании Cloudflare SSL терминируется на их стороне, поэтому Nginx работает на порту 80.

```bash
sudo nano /etc/nginx/sites-available/poker-draw
```

Содержимое:
```nginx
# Доверенные IP адреса Cloudflare
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 131.0.72.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2c0f:f248::/32;
set_real_ip_from 2a06:98c0::/29;

real_ip_header CF-Connecting-IP;

server {
    listen 80;
    server_name ваш-домен.com www.ваш-домен.com;

    # Клиентская часть (статика)
    root /var/www/poker-draw/client/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API прокси
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
    }

    # WebSocket прокси
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

### 5.2 Активация конфигурации

```bash
sudo ln -s /etc/nginx/sites-available/poker-draw /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

---

## 📋 Часть 6: Настройка Cloudflare

### 6.1 DNS настройки

В панели Cloudflare для вашего домена:

1. Перейдите в **DNS → Records**
2. Добавьте записи:

| Type | Name | Content | Proxy status |
|------|------|---------|--------------|
| A | @ | IP_ВАШЕГО_СЕРВЕРА | Proxied (оранжевое облако) |
| A | www | IP_ВАШЕГО_СЕРВЕРА | Proxied (оранжевое облако) |

### 6.2 SSL/TLS настройки

1. Перейдите в **SSL/TLS → Overview**
2. Выберите режим **Full**

> 💡 **Схема работы SSL:**
> ```
> Пользователь ←[HTTPS]→ Cloudflare ←[HTTP]→ Nginx (порт 80) → API
> ```
> Cloudflare терминирует SSL и отправляет запросы на ваш сервер по HTTP.
> Режим **Full** означает, что Cloudflare будет подключаться к серверу по HTTP на порт 80.

### 6.3 Настройка WebSocket

1. Перейдите в **Network**
2. Убедитесь, что **WebSockets** включены (обычно включены по умолчанию)

### 6.4 Рекомендуемые настройки безопасности

**SSL/TLS → Edge Certificates:**
- ✅ Always Use HTTPS — **On**
- ✅ Automatic HTTPS Rewrites — **On**
- ✅ Minimum TLS Version — **TLS 1.2**

**Security → Settings:**
- Security Level — **Medium** или **High**

**Speed → Optimization:**
- ✅ Auto Minify — CSS, JavaScript, HTML
- ✅ Brotli — **On**

### 6.5 Page Rules (опционально)

Для WebSocket соединений создайте правило:

1. **Rules → Page Rules → Create Page Rule**
2. URL: `*ваш-домен.com/ws*`
3. Settings:
   - Cache Level: **Bypass**
   - Disable Security (если возникают проблемы)

---

## 📋 Часть 7: Workflow работы с GitHub

### 8.1 Ручное обновление кода

```bash
cd /var/www/poker-draw
./deploy.sh
```

### 7.2 GitHub Actions для автодеплоя

Создайте файл `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /var/www/poker-draw
            git pull origin main
            pnpm install
            pnpm build
            sudo systemctl restart poker-server
```

**Настройка секретов в GitHub:**
1. Репозиторий → **Settings → Secrets and variables → Actions**
2. Добавьте:
   - `SERVER_HOST` — IP сервера
   - `SERVER_USER` — имя пользователя SSH
   - `SSH_PRIVATE_KEY` — приватный SSH ключ

---

## 📋 Часть 8: Мониторинг и отладка

### 8.1 Полезные команды

```bash
# Логи сервера
sudo journalctl -u poker-server -f

# Логи Nginx
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# Статус сервисов
sudo systemctl status poker-server
sudo systemctl status nginx

# Перезапуск
sudo systemctl restart poker-server
sudo systemctl restart nginx

# Проверка портов
sudo netstat -tlnp | grep -E '80|443|3000'
```

### 8.2 Проверка работоспособности

```bash
# Локальная проверка API
curl http://localhost:3000/health

# Проверка через Cloudflare
curl https://ваш-домен.com/health
```

### 8.3 Отладка Cloudflare

Если сайт не работает:

1. **Временно отключите прокси** (серое облако) в DNS для диагностики
2. Проверьте **SSL/TLS режим** (Full, не Flexible)
3. Проверьте **статус WebSocket** в Network настройках
4. Посмотрите **Cloudflare Logs** в Analytics → Traffic

---

## 📋 Чек-лист деплоя

### Сервер
- [ ] Ubuntu обновлена
- [ ] Node.js и pnpm установлены
- [ ] SSH ключ добавлен в GitHub
- [ ] Репозиторий склонирован в `/var/www/poker-draw`
- [ ] Файлы `.env` созданы
- [ ] Проект собран (`pnpm build`)
- [ ] Systemd сервис настроен и запущен
- [ ] Nginx настроен и перезапущен

### Cloudflare
- [ ] DNS A-записи добавлены (Proxied)
- [ ] SSL/TLS режим установлен в **Full**
- [ ] WebSockets включены
- [ ] Always Use HTTPS включен

### Проверка
- [ ] `curl http://localhost:3000/health` работает
- [ ] `https://ваш-домен.com` открывается
- [ ] WebSocket соединения работают
- [ ] Игра функционирует корректно

---

## 🔧 Решение частых проблем

### Ошибка 522 (Connection timed out)
- Проверьте, что сервер запущен: `sudo systemctl status poker-server`
- Проверьте, что Nginx работает: `sudo systemctl status nginx`
- Проверьте файрвол: `sudo ufw status`

### WebSocket не подключается
- Проверьте, что WebSockets включены в Cloudflare → Network
- Проверьте таймауты в Nginx конфигурации
- Добавьте Page Rule для `/ws*` с Cache Level: Bypass

### Ошибка 502 (Bad Gateway)
- Сервер не запущен или упал
- Проверьте логи: `sudo journalctl -u poker-server -f`
