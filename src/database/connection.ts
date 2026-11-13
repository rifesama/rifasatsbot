import { Pool, QueryResult } from 'pg';
import { config } from '../config/bot.config';

export const pool = new Pool({
  connectionString: config.database.url,
});

export async function query(text: string, params?: any[]): Promise<QueryResult> {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  // Solo consultas lentas: registrar todas llenaba el journal (crons cada 30 s)
  // y desplazaba los logs de LNbits, que comparte el tope de 300 MB.
  if (duration > 500) {
    console.log('Slow query', { text: text.slice(0, 200), duration, rows: res.rowCount });
  }
  return res;
}