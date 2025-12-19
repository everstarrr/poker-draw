CREATE OR REPLACE FUNCTION replace_cards(
    p_player_id UUID,
    p_card_positions INTEGER[]
) RETURNS JSON LANGUAGE plpgsql AS $$
DECLARE
    v_game_id UUID;
    v_card_id INTEGER;
    v_new_card_id INTEGER;
    v_discarded_count INTEGER;
    v_new_cards JSON;
    v_current_player_id UUID;
    v_player_cards INTEGER[];
    v_position INTEGER;
BEGIN
    -- Проверяем, что игрок существует и получаем game_id
    SELECT game_id INTO v_game_id FROM players WHERE id = p_player_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Player not found');
    END IF;

    -- Проверяем, что это ход игрока
    SELECT current_player_id INTO v_current_player_id FROM games WHERE id = v_game_id;

    IF v_current_player_id != p_player_id THEN
        RETURN json_build_object('success', false, 'error', 'Not your turn');
    END IF;

    v_discarded_count := array_length(p_card_positions, 1);

    -- Если игрок не хочет менять карты
    IF v_discarded_count = 0 OR v_discarded_count IS NULL THEN
        PERFORM next_turn(v_game_id);
        RETURN json_build_object(
            'success', true,
            'message', 'No cards replaced',
            'cards', (
                SELECT json_agg(json_build_object('number', c.number, 'suit', c.suit) ORDER BY pc.id)
                FROM players_cards pc
                JOIN cards c ON pc.card_id = c.id
                WHERE pc.player_id = p_player_id
            )
        );
    END IF;

    -- Проверяем количество карт
    IF v_discarded_count > 5 THEN
        RETURN json_build_object('success', false, 'error', 'Cannot discard more than 5 cards');
    END IF;

    -- Получаем card_id карт игрока В ПОРЯДКЕ ДОБАВЛЕНИЯ (по id записи в players_cards)
    SELECT array_agg(card_id ORDER BY id) INTO v_player_cards
    FROM players_cards
    WHERE player_id = p_player_id;

    -- Проверяем валидность индексов
    FOREACH v_position IN ARRAY p_card_positions LOOP
        IF v_position < 0 OR v_position >= array_length(v_player_cards, 1) THEN
            RETURN json_build_object('success', false, 'error', 'Invalid card position: ' || v_position);
        END IF;
    END LOOP;

    -- Удаляем карты по позициям И ВОЗВРАЩАЕМ ИХ В КОЛОДУ
    FOREACH v_position IN ARRAY p_card_positions LOOP
        v_card_id := v_player_cards[v_position + 1]; -- PostgreSQL массивы начинаются с 1

        -- Возвращаем карту в колоду
        INSERT INTO deck (game_id, card_id) VALUES (v_game_id, v_card_id);

        -- Удаляем карту из руки игрока
        DELETE FROM players_cards WHERE player_id = p_player_id AND card_id = v_card_id;
    END LOOP;

    -- Раздаем новые карты из колоды (НЕ из всех карт!)
    FOR i IN 1..v_discarded_count LOOP
        -- Берём случайную карту ИЗ КОЛОДЫ
        SELECT d.card_id INTO v_new_card_id
        FROM deck d
        WHERE d.game_id = v_game_id
        ORDER BY RANDOM()
        LIMIT 1;

        IF v_new_card_id IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'Not enough cards in deck');
        END IF;

        -- Удаляем карту из колоды
        DELETE FROM deck WHERE game_id = v_game_id AND card_id = v_new_card_id;

        -- Добавляем карту игроку
        INSERT INTO players_cards (card_id, player_id) VALUES (v_new_card_id, p_player_id);
    END LOOP;

    -- Получаем ВСЕ карты игрока для ответа В ПОРЯДКЕ ДОБАВЛЕНИЯ
    SELECT json_agg(json_build_object('number', c.number, 'suit', c.suit) ORDER BY pc.id)
    INTO v_new_cards
    FROM players_cards pc
    JOIN cards c ON pc.card_id = c.id
    WHERE pc.player_id = p_player_id;

    -- Переходим к следующему игроку
    PERFORM next_turn(v_game_id);

    -- Возвращаем результат с информацией о количестве карт
    RETURN json_build_object(
        'success', true,
        'discarded', v_discarded_count,
        'cards', COALESCE(v_new_cards, '[]'::json),
        'total_cards', (SELECT COUNT(*) FROM players_cards WHERE player_id = p_player_id),
        'message', 'Cards replaced successfully'
    );
END;
$$;
