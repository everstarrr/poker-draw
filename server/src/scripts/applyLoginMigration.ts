import { initializeDatabase, db, closeDatabaseConnection } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyLoginMigration() {
  try {
    console.log('Connecting to database...');
    await initializeDatabase();

    console.log('Reading SQL migration file...');
    const sqlFilePath = path.join(__dirname, '../../login_migration.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');

    console.log('Applying login migration...');
    await db.query(sql);

    console.log('✅ Login migration applied successfully!');
  } catch (error) {
    console.error('❌ Error applying login migration:', error);
    process.exit(1);
  } finally {
    await closeDatabaseConnection();
  }
}

applyLoginMigration();
