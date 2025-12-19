-- ============================================
-- МИГРАЦИЯ: Добавление баланса пользователям
-- ============================================

-- 1. Добавляем колонку balance в таблицу users
ALTER TABLE users ADD COLUMN IF NOT EXISTS balance INTEGER DEFAULT 0;

-- 2. Устанавливаем начальный баланс для существующих пользователей
UPDATE users SET balance = 10000 WHERE balance = 0;

-- ============================================
-- ФУНКЦИЯ: Начисление баланса пользователю
-- ============================================
CREATE OR REPLACE FUNCTION add_balance(
    p_email VARCHAR(255),
    p_amount INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_new_balance INTEGER;
BEGIN
    -- Проверяем, существует ли пользователь
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = p_email) THEN
        RETURN json_build_object('success', false, 'error', 'User not found');
    END IF;

    -- Проверяем корректность суммы
    IF p_amount <= 0 THEN
        RETURN json_build_object('success', false, 'error', 'Amount must be positive');
    END IF;

    -- Начисляем баланс
    UPDATE users
    SET balance = balance + p_amount,
        last_activity = NOW()
    WHERE email = p_email
    RETURNING balance INTO v_new_balance;

    RETURN json_build_object(
        'success', true,
        'email', p_email,
        'amount_added', p_amount,
        'new_balance', v_new_balance,
        'message', 'Balance added successfully'
    );
END;
$$;

-- ============================================
-- ОБНОВЛЕНИЕ: Функция регистрации с балансом
-- ============================================
CREATE OR REPLACE FUNCTION register_user(
    p_email VARCHAR(255),
    p_username VARCHAR(30),
    p_password VARCHAR(255)
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
BEGIN
    -- Проверяем, существует ли email
    IF EXISTS (SELECT 1 FROM users WHERE email = p_email) THEN
        RETURN json_build_object('success', false, 'error', 'Email already registered');
    END IF;

    -- Проверяем, существует ли username
    IF EXISTS (SELECT 1 FROM users WHERE username = p_username) THEN
        RETURN json_build_object('success', false, 'error', 'Username already taken');
    END IF;

    -- Создаем пользователя с начальным балансом 10000
    INSERT INTO users (email, username, password, last_activity, balance)
    VALUES (p_email, p_username, p_password, NOW(), 10000);

    RETURN json_build_object(
        'success', true,
        'email', p_email,
        'username', p_username,
        'balance', 10000,
        'message', 'User registered successfully'
    );
END;
$$;

-- ============================================
-- ОБНОВЛЕНИЕ: Функция join_game с проверкой баланса
-- ============================================
CREATE OR REPLACE FUNCTION join_game(
    p_game_id UUID,
    p_email VARCHAR(255),
    p_buy_in INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_player_count INTEGER;
    v_max_players INTEGER;
    v_min_stack INTEGER;
    v_max_stack INTEGER;
    v_new_player_id UUID;
    v_next_position INTEGER;
    v_user_balance INTEGER;
BEGIN
    -- Проверяем, существует ли пользователь и получаем его баланс
    SELECT balance INTO v_user_balance
    FROM users
    WHERE email = p_email;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'User not found');
    END IF;

    -- Проверяем лимиты игры
    SELECT max_players, min_stack, max_stack
    INTO v_max_players, v_min_stack, v_max_stack
    FROM games
    WHERE id = p_game_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Game not found');
    END IF;

    -- Проверяем количество игроков
    SELECT COUNT(*) INTO v_player_count
    FROM players
    WHERE game_id = p_game_id;

    -- Проверки
    IF v_player_count >= v_max_players THEN
        RETURN json_build_object('success', false, 'error', 'Game is full');
    END IF;

    IF p_buy_in < v_min_stack OR p_buy_in > v_max_stack THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Buy-in must be between ' || v_min_stack || ' and ' || v_max_stack
        );
    END IF;

    -- Проверяем, достаточно ли у пользователя баланса
    IF v_user_balance < p_buy_in THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Insufficient balance. You have ' || v_user_balance || ', but need ' || p_buy_in,
            'balance', v_user_balance,
            'required', p_buy_in
        );
    END IF;

    -- Проверяем, не сидит ли игрок уже за столом
    IF EXISTS (SELECT 1 FROM players WHERE game_id = p_game_id AND email = p_email) THEN
        RETURN json_build_object('success', false, 'error', 'Already at this table');
    END IF;

    -- Определяем следующую позицию
    SELECT COALESCE(MAX(position), 0) + 1 INTO v_next_position
    FROM players
    WHERE game_id = p_game_id;

    -- Списываем баланс с пользователя
    UPDATE users
    SET balance = balance - p_buy_in,
        last_activity = NOW()
    WHERE email = p_email;

    -- Создаем игрока
    INSERT INTO players (id, position, status, email, game_id, stack, has_acted)
    VALUES (gen_random_uuid(), v_next_position, 'CHECK', p_email, p_game_id, p_buy_in, FALSE)
    RETURNING id INTO v_new_player_id;

    RETURN json_build_object(
        'success', true,
        'player_id', v_new_player_id,
        'position', v_next_position,
        'stack', p_buy_in,
        'remaining_balance', v_user_balance - p_buy_in
    );
END;
$$;

-- ============================================
-- ОБНОВЛЕНИЕ: Функция leave_game с возвратом баланса
-- ============================================
CREATE OR REPLACE FUNCTION leave_game(
    p_player_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_stack INTEGER;
    v_game_id UUID;
    v_current_player_id UUID;
    v_player_email VARCHAR(255);
BEGIN
    -- Получаем стек и email игрока
    SELECT stack, game_id, email INTO v_stack, v_game_id, v_player_email
    FROM players
    WHERE id = p_player_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Player not found');
    END IF;

    -- Проверяем, не является ли этот игрок текущим
    SELECT current_player_id INTO v_current_player_id
    FROM games
    WHERE id = v_game_id;

    -- Если это текущий игрок, передаем ход следующему
    IF v_current_player_id = p_player_id THEN
        PERFORM next_turn(v_game_id);
    END IF;

    -- Возвращаем баланс пользователю
    UPDATE users
    SET balance = balance + v_stack
    WHERE email = v_player_email;

    -- Удаляем карты игрока
    DELETE FROM players_cards WHERE player_id = p_player_id;

    -- Удаляем ставки игрока
    DELETE FROM bets WHERE player_id = p_player_id;

    -- Удаляем игрока
    DELETE FROM players WHERE id = p_player_id;

    RETURN json_build_object(
        'success', true,
        'stack_returned', v_stack,
        'message', 'Player left the game and balance returned'
    );
END;
$$;

-- ============================================
-- ОБНОВЛЕНИЕ: Функция get_player_info с балансом
-- ============================================
CREATE OR REPLACE FUNCTION get_player_info(p_email VARCHAR)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_info JSON;
    v_current_games JSON;
BEGIN
    -- Получаем информацию о пользователе
    SELECT json_build_object(
        'email', u.email,
        'username', u.username,
        'balance', u.balance,
        'last_activity', u.last_activity
    ) INTO v_user_info
    FROM users u
    WHERE u.email = p_email;

    IF v_user_info IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'User not found');
    END IF;

    -- Получаем активные игры пользователя
    SELECT json_agg(
        json_build_object(
            'game_id', g.id,
            'game_name', g.name,
            'player_id', p.id,
            'position', p.position,
            'stack', p.stack,
            'status', p.status
        )
    ) INTO v_current_games
    FROM players p
    JOIN games g ON p.game_id = g.id
    WHERE p.email = p_email;

    RETURN json_build_object(
        'success', true,
        'user', v_user_info,
        'active_games', COALESCE(v_current_games, '[]'::json)
    );
END;
$$;
