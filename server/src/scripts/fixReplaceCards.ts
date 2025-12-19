import { db, initializeDatabase } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fixReplaceCards() {
  try {
    console.log('Connecting to database...');
    await initializeDatabase();

    console.log('Reading fix file...');
    const fixPath = path.join(__dirname, '../../fix_replace_cards.sql');
    const fixSQL = fs.readFileSync(fixPath, 'utf-8');

    console.log('Applying fix for replace_cards function...');
    await db.query(fixSQL);

    console.log('\n✅ Fix applied successfully!');
    console.log('\nThe replace_cards function now:');
    console.log('  - Accepts card positions (0-4) instead of card IDs');
    console.log('  - Properly deletes old cards before adding new ones');
    console.log('  - Returns all player cards after replacement');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fix failed:', error);
    process.exit(1);
  }
}

fixReplaceCards();
