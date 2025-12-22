import { db, initializeDatabase } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyCardsVisibilityMigration() {
  try {
    console.log('Connecting to database...');
    await initializeDatabase();

    console.log('Reading migration file...');
    const migrationPath = path.join(__dirname, '../../add_cards_visibility.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('Applying cards visibility functions...');
    await db.query(migrationSQL);

    console.log('✅ Cards visibility migration applied successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

applyCardsVisibilityMigration();
