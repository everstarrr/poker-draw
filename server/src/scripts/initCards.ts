import { db, initializeDatabase, closeDatabaseConnection } from '../config/database.js';

const suits = ['HEART', 'DIAMONDS', 'CLUB', 'SPADE'];
const numbers = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];

async function initCards() {
  try {
    await initializeDatabase();

    // Проверяем, есть ли уже карты
    const existingCards = await db.query('SELECT COUNT(*) as count FROM cards');
    const count = parseInt(existingCards[0].count);

    if (count > 0) {
      console.log(`Cards already exist (${count} cards). Skipping initialization.`);
      await closeDatabaseConnection();
      return;
    }

    // Создаем все 52 карты
    let inserted = 0;
    for (const suit of suits) {
      for (const number of numbers) {
        await db.query(
          'INSERT INTO cards (suit, number) VALUES ($1, $2)',
          [suit, number]
        );
        inserted++;
      }
    }

    console.log(`Successfully initialized ${inserted} cards in the database.`);
    await closeDatabaseConnection();
  } catch (error) {
    console.error('Error initializing cards:', error);
    await closeDatabaseConnection();
    process.exit(1);
  }
}

initCards();
