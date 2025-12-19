import { db, initializeDatabase } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyBalanceMigration() {
  try {
    console.log('Connecting to database...');
    await initializeDatabase();

    console.log('Reading migration file...');
    const migrationPath = path.join(__dirname, '../../balance_migration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Разбиваем файл на блоки (по разделителям или функциям)
    const statements: string[] = [];
    let currentStatement = '';
    let inFunction = false;

    const lines = migrationSQL.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Пропускаем комментарии и пустые строки
      if (trimmedLine.startsWith('--') || trimmedLine.length === 0) {
        continue;
      }

      currentStatement += line + '\n';

      // Определяем начало функции
      if (trimmedLine.toUpperCase().includes('CREATE OR REPLACE FUNCTION') ||
          trimmedLine.toUpperCase().includes('ALTER TABLE')) {
        inFunction = true;
      }

      // Определяем конец блока
      if (trimmedLine.endsWith(';')) {
        if (!inFunction || trimmedLine.includes('$$;')) {
          // Это конец обычной команды или конец функции
          statements.push(currentStatement.trim());
          currentStatement = '';
          inFunction = false;
        }
      }
    }

    // Добавляем последний оставшийся блок
    if (currentStatement.trim().length > 0) {
      statements.push(currentStatement.trim());
    }

    console.log(`\nFound ${statements.length} migration blocks to execute...\n`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Определяем тип команды для более понятного вывода
      let commandType = 'SQL command';
      if (statement.includes('ALTER TABLE')) {
        commandType = 'ALTER TABLE';
      } else if (statement.includes('UPDATE')) {
        commandType = 'UPDATE';
      } else if (statement.includes('CREATE OR REPLACE FUNCTION')) {
        const match = statement.match(/FUNCTION\s+(\w+)/i);
        commandType = match ? `Function: ${match[1]}` : 'CREATE FUNCTION';
      }

      console.log(`[${i + 1}/${statements.length}] Executing ${commandType}...`);

      try {
        await db.query(statement);
        console.log('  ✓ Success\n');
      } catch (error: any) {
        // Игнорируем некоторые ошибки
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

    console.log('✅ Migration applied successfully!');
    console.log('\nYou can now use the balance features in your API.');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

applyBalanceMigration();
