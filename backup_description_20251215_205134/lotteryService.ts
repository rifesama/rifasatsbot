import { query, pool } from '../database/connection';
import { Lottery } from '../types';
import { DBMapper, LotteryDB } from '../utils/mappers';
import { logger } from '../utils/logger';

export class LotteryService {
  async getActiveLottery(): Promise<Lottery | null> {
    try {
      const result = await query(
        "SELECT * FROM lotteries WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
      );
      
      if (result.rows.length === 0) return null;
      return DBMapper.lotteryFromDB(result.rows[0] as LotteryDB);
    } catch (error) {
      logger.error('Error getting active lottery', { error });
      throw error;
    }
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
      logger.info('Starting lottery creation', { 
        name, 
        ticketPrice, 
        drawDate: drawDate.toISOString(), 
        drawTime, 
        createdBy 
      });

      await client.query('BEGIN');
      logger.info('Transaction started');

      // Close any active lottery
      const closeResult = await client.query(
        "UPDATE lotteries SET status = 'closed' WHERE status = 'active'"
      );
      logger.info('Closed active lotteries', { count: closeResult.rowCount });

      // Create new lottery
      logger.info('Inserting new lottery', { name, ticketPrice, drawDate, drawTime, createdBy });
      
      const lotteryResult = await client.query(
        `INSERT INTO lotteries (name, ticket_price, draw_date, draw_time, status, created_by)
         VALUES ($1, $2, $3, $4, 'active', $5) RETURNING *`,
        [name, ticketPrice, drawDate, drawTime, createdBy]
      );

      if (lotteryResult.rows.length === 0) {
        throw new Error('No lottery returned after insert');
      }

      const lotteryDB = lotteryResult.rows[0] as LotteryDB;
      const lottery = DBMapper.lotteryFromDB(lotteryDB);
      logger.info('Lottery created', { lotteryId: lottery.id });

      // Create 100 tickets (00-99)
      logger.info('Creating 100 tickets', { lotteryId: lottery.id });
      
      const ticketValues = Array.from({ length: 100 }, (_, i) => 
        `(${lottery.id}, ${i}, 'available')`
      ).join(',');

      const ticketsResult = await client.query(
        `INSERT INTO tickets (lottery_id, number, status) VALUES ${ticketValues}`
      );
      logger.info('Tickets created', { count: ticketsResult.rowCount });

      await client.query('COMMIT');
      logger.info('Transaction committed successfully', { lotteryId: lottery.id });

      return lottery;
    } catch (error: any) {
      await client.query('ROLLBACK');
      
      // Log detallado del error
      logger.error('Error creating lottery - ROLLBACK executed', { 
        error: error.message,
        stack: error.stack,
        code: error.code,
        detail: error.detail,
        name,
        ticketPrice,
        drawDate,
        drawTime,
        createdBy
      });
      
      // Re-lanzar con mensaje más descriptivo
      if (error.code === '23505') {
        throw new Error('Ya existe una lotería con ese nombre');
      } else if (error.code === '23503') {
        throw new Error('El admin no está registrado en la base de datos');
      } else if (error.code === '22P02') {
        throw new Error('Formato de fecha u hora inválido');
      } else {
        throw new Error(`Error de base de datos: ${error.message}`);
      }
    } finally {
      client.release();
      logger.info('Database client released');
    }
  }

  async closeLottery(lotteryId: number): Promise<void> {
    try {
      await query(
        "UPDATE lotteries SET status = 'closed' WHERE id = $1",
        [lotteryId]
      );
      logger.info('Lottery closed', { lotteryId });
    } catch (error) {
      logger.error('Error closing lottery', { error, lotteryId });
      throw error;
    }
  }

  async selectWinner(lotteryId: number): Promise<number | null> {
    try {
      const result = await query(
        `SELECT ticket_number FROM purchases 
         WHERE lottery_id = $1 AND status = 'paid'
         ORDER BY RANDOM() LIMIT 1`,
        [lotteryId]
      );
      
      const winningNumber = result.rows[0]?.ticket_number || null;
      logger.info('Winner selected', { lotteryId, winningNumber });
      return winningNumber;
    } catch (error) {
      logger.error('Error selecting winner', { error, lotteryId });
      throw error;
    }
  }
}