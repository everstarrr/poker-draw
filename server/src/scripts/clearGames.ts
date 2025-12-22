import { initializeDatabase, db, closeDatabaseConnection } from '../config/database.js';

async function clearAllGames() {
  try {
    console.log('Connecting to database...');
    await initializeDatabase();

    const before = await db.query('SELECT COUNT(*)::int as count FROM games');
    const countBefore = Number(before?.[0]?.count ?? 0);
    console.log(`Found ${countBefore} game(s). Deleting...`);

    await db.query('DELETE FROM games');

    const after = await db.query('SELECT COUNT(*)::int as count FROM games');
    const countAfter = Number(after?.[0]?.count ?? 0);
    console.log(`✅ Cleanup complete. Remaining games: ${countAfter}`);
  } catch (err) {
    console.error('❌ Error clearing games:', err);
    process.exit(1);
  } finally {
    await closeDatabaseConnection();
  }
}

clearAllGames();
