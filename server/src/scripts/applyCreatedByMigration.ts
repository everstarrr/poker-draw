import { db, initializeDatabase } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyCreatedByMigration() {
  try {
    console.log('Connecting to database...');
    await initializeDatabase();

    console.log('Reading migration file...');
    const migrationPath = path.join(__dirname, '../../add_created_by.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    const statements: string[] = [];
    let currentStatement = '';
    let inFunction = false;

    const lines = migrationSQL.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('--') || trimmedLine.length === 0) continue;

      currentStatement += line + '\n';

      if (trimmedLine.toUpperCase().includes('CREATE OR REPLACE FUNCTION') ||
          trimmedLine.toUpperCase().includes('ALTER TABLE')) {
        inFunction = true;
      }

      if (trimmedLine.endsWith(';')) {
        if (!inFunction || trimmedLine.includes('$$;')) {
          statements.push(currentStatement.trim());
          currentStatement = '';
          inFunction = false;
        }
      }
    }

    if (currentStatement.trim().length > 0) statements.push(currentStatement.trim());

    console.log(`\nFound ${statements.length} migration blocks to execute...\n`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      let commandType = 'SQL command';
      if (statement.includes('ALTER TABLE')) commandType = 'ALTER TABLE';
      else if (statement.includes('CREATE OR REPLACE FUNCTION')) {
        const match = statement.match(/FUNCTION\s+(\w+)/i);
        commandType = match ? `Function: ${match[1]}` : 'CREATE FUNCTION';
      }

      console.log(`[${i + 1}/${statements.length}] Executing ${commandType}...`);

      try {
        await db.query(statement);
        console.log('  ✓ Success\n');
      } catch (error: any) {
        if (error.message?.includes('already exists') ||
            error.message?.includes('duplicate column')) {
          console.log('  ⚠ Already exists, skipping...\n');
        } else {
          console.error('  ✗ Error:', error.message);
          console.error('  Statement preview:', statement.substring(0, 100) + '...\n');
          throw error;
        }
      }
    }

    console.log('✅ CreatedBy migration applied successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

applyCreatedByMigration();
