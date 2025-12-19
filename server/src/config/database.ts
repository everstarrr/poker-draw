import { Pool } from 'pg';
import { Client } from 'ssh2';
import net from 'net';
import dotenv from 'dotenv';

dotenv.config();

let sshClient: Client | null = null;
let localServer: net.Server | null = null;
let pool: Pool | null = null;

const createSSHTunnel = (): Promise<number> => {
  return new Promise((resolve, reject) => {
    sshClient = new Client();

    sshClient.on('ready', () => {
      console.log('SSH connection established');

      // Create local server that forwards to remote database through SSH
      localServer = net.createServer((socket) => {
        sshClient!.forwardOut(
          '127.0.0.1',
          0,
          process.env.DB_HOST || 'helios.cs.ifmo.ru',
          parseInt(process.env.DB_PORT || '5432'),
          (err, stream) => {
            if (err) {
              console.error('SSH forward error:', err);
              socket.end();
              return;
            }
            socket.pipe(stream).pipe(socket);
          }
        );
      });

      // Listen on random available port
      localServer.listen(0, '127.0.0.1', () => {
        const address = localServer!.address();
        if (address && typeof address === 'object') {
          console.log(`SSH tunnel established on local port ${address.port}`);
          resolve(address.port);
        } else {
          reject(new Error('Failed to get local server address'));
        }
      });

      localServer.on('error', (err) => {
        console.error('Local server error:', err);
        reject(err);
      });
    });

    sshClient.on('error', (err) => {
      console.error('SSH connection error:', err);
      reject(err);
    });

    // Connect to SSH server
    sshClient.connect({
      host: process.env.SSH_HOST || 'se.ifmo.ru',
      port: parseInt(process.env.SSH_PORT || '2222'),
      username: process.env.SSH_USER || 's368909',
      password: process.env.SSH_PASSWORD,
      tryKeyboard: true,
      algorithms: {
        kex: [
          'ecdh-sha2-nistp256',
          'ecdh-sha2-nistp384',
          'ecdh-sha2-nistp521',
          'diffie-hellman-group-exchange-sha256',
          'diffie-hellman-group14-sha256',
          'diffie-hellman-group14-sha1',
        ],
      },
    });

    // Handle keyboard-interactive authentication
    sshClient.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
      finish([process.env.SSH_PASSWORD || '']);
    });
  });
};

export const initializeDatabase = async (): Promise<void> => {
  try {
    // Create SSH tunnel first
    const localPort = await createSSHTunnel();

    // Create PostgreSQL connection pool
    pool = new Pool({
      host: '127.0.0.1',
      port: localPort,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'poker_draw',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test connection
    const client = await pool.connect();
    client.release();
    console.log('Database connection established');
  } catch (error) {
    console.error('Error during database initialization:', error);
    throw error;
  }
};

// Cleanup function for graceful shutdown
export const closeDatabaseConnection = async (): Promise<void> => {
  if (pool) {
    await pool.end();
  }
  if (localServer) {
    localServer.close();
  }
  if (sshClient) {
    sshClient.end();
  }
};

// Database query wrapper compatible with old API
export const db = {
  async query(text: string, params?: any[]): Promise<any[]> {
    if (!pool) {
      throw new Error('Database not initialized');
    }

    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
      console.log('query:', text, params ? `-- PARAMETERS: ${JSON.stringify(params)}` : '');
    }

    try {
      const result = await pool.query(text, params);
      return result.rows;
    } catch (error: any) {
      if (isDev) {
        console.log('query failed:', text, params ? `-- PARAMETERS: ${JSON.stringify(params)}` : '');
        console.log('error:', error.message);
      }
      throw error;
    }
  }
};
