import fs from 'fs';
import path from 'path';
import { db, initializeDatabase } from '../config/database.js';

async function run() {
  const sqlPath = path.resolve(__dirname, '../../update_actions_no_pot.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    console.log('Connecting to database...');
    await initializeDatabase();
    console.log('Applying action functions update...');
    await db.query(sql);
    console.log('✅ Action functions updated successfully (no mid-round pot increments).');
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to update action functions:', err);
    process.exit(1);
  }
}

run();
