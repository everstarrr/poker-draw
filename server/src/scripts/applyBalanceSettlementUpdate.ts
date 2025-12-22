import { db, initializeDatabase } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyBalanceSettlementUpdate() {
  try {
    console.log('Connecting to database...');
    await initializeDatabase();

    console.log('Reading balance settlement SQL...');
    const sqlPath = path.join(__dirname, '../../balance_settlement_update.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    console.log('Applying balance settlement update...');
    await db.query(sql);

    console.log('✅ Balance settlement update applied successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Balance settlement update failed:', error);
    process.exit(1);
  }
}

applyBalanceSettlementUpdate();
