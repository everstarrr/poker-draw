import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE = path.join(__dirname, '../../game-debug.log');

// Очищаем лог при старте сервера
try {
  fs.writeFileSync(LOG_FILE, `=== Game Debug Log Started at ${new Date().toISOString()} ===\n\n`);
} catch (e) {
  console.error('Failed to initialize log file:', e);
}

export function gameLog(category: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  let logLine = `[${timestamp}] [${category}] ${message}`;
  
  if (data !== undefined) {
    try {
      logLine += ` | DATA: ${JSON.stringify(data)}`;
    } catch {
      logLine += ` | DATA: [circular or non-serializable]`;
    }
  }
  
  logLine += '\n';
  
  // Пишем в консоль
  console.log(logLine.trim());
  
  // Пишем в файл
  try {
    fs.appendFileSync(LOG_FILE, logLine);
  } catch (e) {
    console.error('Failed to write to log file:', e);
  }
}

export function getLogContents(): string {
  try {
    return fs.readFileSync(LOG_FILE, 'utf-8');
  } catch (e) {
    return 'Log file not found or cannot be read';
  }
}

export function clearLog() {
  try {
    fs.writeFileSync(LOG_FILE, `=== Log Cleared at ${new Date().toISOString()} ===\n\n`);
  } catch (e) {
    console.error('Failed to clear log file:', e);
  }
}
