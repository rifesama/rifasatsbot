import { query } from '../database/connection';
import { Lottery } from '../types';
import { logger } from '../utils/logger';

export class LotteryService {
  async getActiveLottery(): Promise<Lottery | null> {
    const result = await query(
      "SELECT * FROM lotteries WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
    );
    return result.rows[0] || null;
  }

  async createLottery(
    name: string,
    ticketPrice: number,
    drawDate: Date,
    drawTime: string,
    createdBy: number
  ): Promise<Lottery> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Close any active lottery
      await client.query(
        "UPDATE lotteries SET status = 'closed' WHERE status = 'active'"
      );

      // Create new lottery
      const lotteryResult = await client.query(
        `INSERT INTO lotteries (name, ticket_price, draw_date, draw_time, status, created_by)
         VALUES ($1, $2, $3, $4, 'active', $5) RETURNING *`,
        [name, ticketPrice, drawDate, drawTime, createdBy]
      );

      const lottery = lotteryResult.rows[0];

      // Create 100 tickets (00-99)
      const ticketValues = Array.from({ length: 100 }, (_, i) => 
        `(${lottery.id}, ${i}, 'available')`
      ).join(',');

      await client.query(
        `INSERT INTO tickets (lottery_id, number, status) VALUES ${ticketValues}`
      );

      await client.query('COMMIT');

      logger.info('Lottery created', { lotteryId: lottery.id, name });
      return lottery;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating lottery', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  async closeLottery(lotteryId: number): Promise<void> {
    await query(
      "UPDATE lotteries SET status = 'closed' WHERE id = $1",
      [lotteryId]
    );
    logger.info('Lottery closed', { lotteryId });
  }

  async selectWinner(lotteryId: number): Promise<number | null> {
    const result = await query(
      `SELECT ticket_number FROM purchases 
       WHERE lottery_id = $1 AND status = 'paid'
       ORDER BY RANDOM() LIMIT 1`,
      [lotteryId]
    );
    
    return result.rows[0]?.ticket_number || null;
  }
}