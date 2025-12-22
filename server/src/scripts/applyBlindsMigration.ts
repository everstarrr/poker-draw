import { db, initializeDatabase } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyBlindsMigration() {
  try {
    console.log('Connecting to database...');
    await initializeDatabase();

    console.log('Reading blinds SQL...');
    const sqlPath = path.join(__dirname, '../../add_blinds.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    console.log('Applying blinds migration...');
    await db.query(sql);

    console.log('✅ Blinds migration applied successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Blinds migration failed:', error);
    process.exit(1);
  }
}

applyBlindsMigration();