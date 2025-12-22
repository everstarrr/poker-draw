import { db, initializeDatabase } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyNewRoundUpdate() {
  try {
    console.log('Connecting to database...');
    await initializeDatabase();

    console.log('Reading new_round SQL...');
    const sqlPath = path.join(__dirname, '../../update_new_round.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    console.log('Applying new_round update...');
    await db.query(sql);

    console.log('✅ new_round update applied successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ new_round update failed:', error);
    process.exit(1);
  }
}

applyNewRoundUpdate();