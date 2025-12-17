import { Pool, QueryResult } from 'pg';
import { config } from '../config/bot.config';

export const pool = new Pool({
  connectionString: config.database.url,
});

export async function query(text: string, params?: any[]): Promise<QueryResult> {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('Executed query', { text, duration, rows: res.rowCount });
  return res;
}