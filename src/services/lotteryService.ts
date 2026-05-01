// ============================================
// src/services/lotteryService.ts - CON PORCENTAJE CONFIGURABLE
// ============================================
import { query, pool } from '../database/connection';
import { Lottery, WinnerResult } from '../types';
import { DBMapper, LotteryDB } from '../utils/mappers';
import { logger } from '../utils/logger';

export class LotteryService {
  async getActiveLottery(): Promise<Lottery | null> {
    try {
      const result = await query(
        "SELECT * FROM lotteries WHERE status IN ('active', 'frozen') ORDER BY created_at DESC LIMIT 1"
      );

      if (result.rows.length === 0) return null;
      return DBMapper.lotteryFromDB(result.rows[0] as LotteryDB);
    } catch (error) {
      logger.error('Error getting active lottery', { error });
      throw error;
    }
  }

  async freezeLottery(lotteryId: number): Promise<void> {
    try {
      await query(
        "UPDATE lotteries SET status = 'frozen' WHERE id = $1 AND status = 'active'",
        [lotteryId]
      );
      logger.info('Lottery frozen', { lotteryId });
    } catch (error) {
      logger.error('Error freezing lottery', { error, lotteryId });
      throw error;
    }
  }

  async createLottery(
    name: string,
    description: string | undefined,
    ticketPrice: number,
    drawDate: Date,
    drawTime: string,
    adminFeePercentage: number,  // ← NUEVO PARÁMETRO
    createdBy: number
  ): Promise<Lottery> {
    const client = await pool.connect();
    
    try {
      // Validar porcentaje
      if (adminFeePercentage < 0 || adminFeePercentage > 100) {
        throw new Error('El porcentaje debe estar entre 0 y 100');
      }

      // Obtener fondos acumulados
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
        adminFeePercentage,  // ← Log del porcentaje
        createdBy,
        accumulatedFunds
      });

      await client.query('BEGIN');

      await client.query(
        "UPDATE lotteries SET status = 'closed' WHERE status = 'active'"
      );

      // ← INSERT con admin_fee_percentage
      const lotteryResult = await client.query(
        `INSERT INTO lotteries (name, description, ticket_price, draw_date, draw_time, admin_fee_percentage, status, created_by, accumulated_funds)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8) RETURNING *`,
        [name, description, ticketPrice, drawDate, drawTime, adminFeePercentage, createdBy, accumulatedFunds]
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

      logger.info('Lottery created with admin fee percentage', { 
        lotteryId: lottery.id, 
        name,
        adminFeePercentage,
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

      const lotteryResult = await client.query(
        'SELECT * FROM lotteries WHERE id = $1',
        [lotteryId]
      );

      const lottery = DBMapper.lotteryFromDB(lotteryResult.rows[0] as LotteryDB);

      // Calcular total
      const revenueResult = await client.query(
        `SELECT COALESCE(SUM(amount_sats), 0) as total 
         FROM purchases WHERE lottery_id = $1 AND status = 'paid'`,
        [lotteryId]
      );

      const currentRevenue = parseInt(revenueResult.rows[0].total);
      const totalAmount = currentRevenue + (lottery.accumulatedFunds || 0);

      // Obtener porcentaje de comisión (default 10% si no existe)
      const adminFeePercentage = lottery.adminFeePercentage || 10;
      
      // Calcular comisión
      const adminFee = Math.floor(totalAmount * (adminFeePercentage / 100));

      // Buscar ganador
      const winnerResult = await client.query(
        `SELECT telegram_user_id, telegram_username, lightning_address 
         FROM purchases 
         WHERE lottery_id = $1 AND ticket_number = $2 AND status = 'paid'`,
        [lotteryId, winningNumber]
      );

      const hasWinner = winnerResult.rows.length > 0;

      if (hasWinner) {
        // ========================================
        // HAY GANADOR: totalAmount - comisión
        // ========================================
        const winner = winnerResult.rows[0];
        const winnerPrize = totalAmount - adminFee;

        await client.query(
          `UPDATE lotteries 
           SET winning_number = $1, 
               selection_method = $2, 
               winner_telegram_id = $3,
               winner_notified_at = NOW(),
               admin_fee = $4,
               status = 'completed'
           WHERE id = $5`,
          [winningNumber, method, winner.telegram_user_id, adminFee, lotteryId]
        );

        await client.query('COMMIT');

        logger.info('Winner selected', { 
          lotteryId, 
          winningNumber, 
          method, 
          hasWinner: true,
          totalAmount,
          winnerPrize,
          adminFee,
          adminFeePercentage
        });

        return {
          winningNumber,
          hasWinner: true,
          winner: {
            telegramUserId: winner.telegram_user_id,
            telegramUsername: winner.telegram_username,
            lightningAddress: winner.lightning_address,
          },
          totalAmount,
          winnerPrize,
          adminFee,
          adminFeePercentage,
        };
      } else {
        // ========================================
        // NO HAY GANADOR: totalAmount - comisión → acumulado
        // ========================================
        const accumulatedForNext = totalAmount - adminFee;

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
          totalAmount,
          accumulatedForNext,
          adminFee,
          adminFeePercentage
        });

        return {
          winningNumber,
          hasWinner: false,
          totalAmount,
          accumulatedForNext,
          adminFee,
          adminFeePercentage,
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

  async deleteLottery(lotteryId: number): Promise<void> {
    try {
      await query('DELETE FROM lottery_history WHERE lottery_id = $1', [lotteryId]);
      await query('DELETE FROM purchases WHERE lottery_id = $1', [lotteryId]);
      await query('DELETE FROM tickets WHERE lottery_id = $1', [lotteryId]);
      await query('DELETE FROM lotteries WHERE id = $1', [lotteryId]);
      logger.info('Lottery deleted', { lotteryId });
    } catch (error) {
      logger.error('Error deleting lottery', { error, lotteryId });
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