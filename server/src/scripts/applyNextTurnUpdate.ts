import { db, initializeDatabase } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyNextTurnUpdate() {
  try {
    console.log('Connecting to database...');
    await initializeDatabase();

    console.log('Reading update file...');
    const sqlPath = path.join(__dirname, '../../update_next_turn.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    console.log('Applying next_turn update...');
    await db.query(sql);

    console.log('✅ next_turn update applied successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Update failed:', error);
    process.exit(1);
  }
}

applyNextTurnUpdate();
