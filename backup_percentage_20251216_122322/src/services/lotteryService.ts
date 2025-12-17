// ============================================
// src/services/lotteryService.ts - SISTEMA HÍBRIDO COMPLETO
// ============================================
import { query, pool } from '../database/connection';
import { Lottery, WinnerResult } from '../types';
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
    description: string | undefined,
    ticketPrice: number,
    drawDate: Date,
    drawTime: string,
    createdBy: number
  ): Promise<Lottery> {
    const client = await pool.connect();
    
    try {
      // Obtener fondos acumulados de la última lotería sin ganador
      const lastLotteryResult = await client.query(
        `SELECT accumulated_funds FROM lotteries 
         WHERE status = 'completed' AND winning_number IS NOT NULL 
         AND winner_telegram_id IS NULL
         ORDER BY created_at DESC LIMIT 1`
      );

      const accumulatedFunds = lastLotteryResult.rows[0]?.accumulated_funds || 0;

      logger.info('Starting lottery creation', { 
        name,
        description,
        ticketPrice, 
        drawDate: drawDate.toISOString(), 
        drawTime, 
        createdBy,
        accumulatedFunds
      });

      await client.query('BEGIN');

      await client.query(
        "UPDATE lotteries SET status = 'closed' WHERE status = 'active'"
      );

      const lotteryResult = await client.query(
        `INSERT INTO lotteries (name, description, ticket_price, draw_date, draw_time, status, created_by, accumulated_funds)
         VALUES ($1, $2, $3, $4, $5, 'active', $6, $7) RETURNING *`,
        [name, description, ticketPrice, drawDate, drawTime, createdBy, accumulatedFunds]
      );

      const lotteryDB = lotteryResult.rows[0] as LotteryDB;
      const lottery = DBMapper.lotteryFromDB(lotteryDB);

      const ticketValues = Array.from({ length: 100 }, (_, i) => 
        `(${lottery.id}, ${i}, 'available')`
      ).join(',');

      await client.query(
        `INSERT INTO tickets (lottery_id, number, status) VALUES ${ticketValues}`
      );

      await client.query('COMMIT');

      logger.info('Lottery created with accumulated funds', { 
        lotteryId: lottery.id, 
        name,
        accumulatedFunds 
      });
      
      return lottery;
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('Error creating lottery', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  async selectWinnerRandom(lotteryId: number): Promise<WinnerResult> {
    try {
      // Selección aleatoria del número
      const result = await query(
        `SELECT ticket_number FROM purchases 
         WHERE lottery_id = $1 AND status = 'paid'
         ORDER BY RANDOM() LIMIT 1`,
        [lotteryId]
      );
      
      const winningNumber = result.rows[0]?.ticket_number;
      
      if (winningNumber === undefined) {
        throw new Error('No hay números vendidos para seleccionar un ganador');
      }

      return await this.processWinner(lotteryId, winningNumber, 'random');
    } catch (error) {
      logger.error('Error selecting random winner', { error, lotteryId });
      throw error;
    }
  }

  async selectWinnerManual(lotteryId: number, winningNumber: number): Promise<WinnerResult> {
    try {
      // Validar que el número esté en rango
      if (winningNumber < 0 || winningNumber > 99) {
        throw new Error('El número debe estar entre 00 y 99');
      }

      return await this.processWinner(lotteryId, winningNumber, 'manual');
    } catch (error) {
      logger.error('Error selecting manual winner', { error, lotteryId, winningNumber });
      throw error;
    }
  }

  private async processWinner(
    lotteryId: number, 
    winningNumber: number, 
    method: 'random' | 'manual'
  ): Promise<WinnerResult> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Obtener información de la lotería y calcular premio total
      const lotteryResult = await client.query(
        'SELECT * FROM lotteries WHERE id = $1',
        [lotteryId]
      );

      const lottery = DBMapper.lotteryFromDB(lotteryResult.rows[0] as LotteryDB);

      // Calcular ingresos de esta lotería
      const revenueResult = await client.query(
        `SELECT COALESCE(SUM(amount_sats), 0) as total 
         FROM purchases WHERE lottery_id = $1 AND status = 'paid'`,
        [lotteryId]
      );

      const currentRevenue = parseInt(revenueResult.rows[0].total);
      const totalPrize = currentRevenue + (lottery.accumulatedFunds || 0);

      // Buscar si el número fue vendido
      const winnerResult = await client.query(
        `SELECT telegram_user_id, telegram_username, lightning_address 
         FROM purchases 
         WHERE lottery_id = $1 AND ticket_number = $2 AND status = 'paid'`,
        [lotteryId, winningNumber]
      );

      const hasWinner = winnerResult.rows.length > 0;

      if (hasWinner) {
        // HAY GANADOR
        const winner = winnerResult.rows[0];

        await client.query(
          `UPDATE lotteries 
           SET winning_number = $1, 
               selection_method = $2, 
               winner_telegram_id = $3,
               winner_notified_at = NOW(),
               status = 'completed'
           WHERE id = $4`,
          [winningNumber, method, winner.telegram_user_id, lotteryId]
        );

        await client.query('COMMIT');

        logger.info('Winner selected', { 
          lotteryId, 
          winningNumber, 
          method, 
          hasWinner: true,
          totalPrize 
        });

        return {
          winningNumber,
          hasWinner: true,
          winner: {
            telegramUserId: winner.telegram_user_id,
            telegramUsername: winner.telegram_username,
            lightningAddress: winner.lightning_address,
          },
          totalPrize,
        };
      } else {
        // NO HAY GANADOR - DISTRIBUIR 80/20
        const accumulatedForNext = Math.floor(totalPrize * 0.8);
        const adminFee = totalPrize - accumulatedForNext;

        await client.query(
          `UPDATE lotteries 
           SET winning_number = $1, 
               selection_method = $2, 
               accumulated_funds = $3,
               admin_fee = $4,
               status = 'completed'
           WHERE id = $5`,
          [winningNumber, method, accumulatedForNext, adminFee, lotteryId]
        );

        await client.query('COMMIT');

        logger.info('No winner - funds distributed', { 
          lotteryId, 
          winningNumber, 
          method,
          hasWinner: false,
          totalPrize,
          accumulatedForNext,
          adminFee
        });

        return {
          winningNumber,
          hasWinner: false,
          totalPrize,
          accumulatedForNext,
          adminFee,
        };
      }
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error processing winner', { error, lotteryId, winningNumber });
      throw error;
    } finally {
      client.release();
    }
  }

  async markParticipantsNotified(lotteryId: number): Promise<void> {
    try {
      await query(
        'UPDATE lotteries SET all_participants_notified = TRUE WHERE id = $1',
        [lotteryId]
      );
      logger.info('Participants marked as notified', { lotteryId });
    } catch (error) {
      logger.error('Error marking participants as notified', { error, lotteryId });
      throw error;
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

  async getLotteryById(lotteryId: number): Promise<Lottery | null> {
    try {
      const result = await query(
        'SELECT * FROM lotteries WHERE id = $1',
        [lotteryId]
      );
      
      if (result.rows.length === 0) return null;
      return DBMapper.lotteryFromDB(result.rows[0] as LotteryDB);
    } catch (error) {
      logger.error('Error getting lottery by id', { error, lotteryId });
      throw error;
    }
  }
}