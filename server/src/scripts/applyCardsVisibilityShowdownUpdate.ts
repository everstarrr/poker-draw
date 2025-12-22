import { db, initializeDatabase } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyCardsVisibilityShowdownUpdate() {
  try {
    console.log('Connecting to database...');
    await initializeDatabase();

    console.log('Reading update SQL...');
    const sqlPath = path.join(__dirname, '../../update_cards_visibility_showdown.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    console.log('Applying cards visibility showdown update...');
    await db.query(sql);

    console.log('✅ Cards visibility showdown update applied successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Update failed:', error);
    process.exit(1);
  }
}

applyCardsVisibilityShowdownUpdate();