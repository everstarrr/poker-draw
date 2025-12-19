import { db, initializeDatabase, closeDatabaseConnection } from '../config/database.js';

async function cleanupCards() {
  try {
    await initializeDatabase();

    // Проверяем количество карт
    const cardsCount = await db.query('SELECT COUNT(*) as count FROM cards');
    console.log(`Total cards in Cards table: ${cardsCount[0].count}`);

    // Проверяем сколько карт занято в Players_Cards
    const usedCards = await db.query('SELECT COUNT(*) as count FROM players_cards');
    console.log(`Cards in Players_Cards: ${usedCards[0].count}`);

    // Проверяем сколько игроков в Players
    const playersCount = await db.query('SELECT COUNT(*) as count FROM players');
    console.log(`Total players: ${playersCount[0].count}`);

    // Проверяем "осиротевшие" карты (карты в Players_Cards без существующего игрока)
    const orphanedCards = await db.query(`
      SELECT pc.card_id, pc.player_id
      FROM players_cards pc
      LEFT JOIN players p ON pc.player_id = p.id
      WHERE p.id IS NULL
    `);
    console.log(`Orphaned cards (no player): ${orphanedCards.length}`);

    if (orphanedCards.length > 0) {
      console.log('Cleaning orphaned cards...');
      await db.query(`
        DELETE FROM players_cards
        WHERE player_id NOT IN (SELECT id FROM players)
      `);
      console.log('Orphaned cards cleaned!');
    }

    // Очищаем все Players_Cards для свежего старта
    console.log('\nClearing all Players_Cards for fresh start...');
    await db.query('DELETE FROM players_cards');
    console.log('Players_Cards cleared!');

    // Финальная проверка
    const finalUsedCards = await db.query('SELECT COUNT(*) as count FROM players_cards');
    console.log(`\nFinal cards in Players_Cards: ${finalUsedCards[0].count}`);

    await closeDatabaseConnection();
  } catch (error) {
    console.error('Error:', error);
    await closeDatabaseConnection();
    process.exit(1);
  }
}

cleanupCards();
