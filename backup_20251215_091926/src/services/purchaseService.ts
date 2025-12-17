import { query } from '../database/connection';
import { Purchase } from '../types';
import { logger } from '../utils/logger';

export class PurchaseService {
  async createPurchase(
    lotteryId: number,
    ticketId: number,
    ticketNumber: number,
    telegramUserId: number,
    telegramUsername: string,
    lightningAddress: string,
    paymentHash: string,
    invoice: string,
    amountSats: number
  ): Promise<Purchase> {
    const result = await query(
      `INSERT INTO purchases (
        lottery_id, ticket_id, ticket_number, telegram_user_id, 
        telegram_username, lightning_address, payment_hash, invoice, amount_sats
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        lotteryId, ticketId, ticketNumber, telegramUserId,
        telegramUsername, lightningAddress, paymentHash, invoice, amountSats
      ]
    );

    logger.info('Purchase created', { purchaseId: result.rows[0].id, ticketNumber });
    return result.rows[0];
  }

  async markAsPaid(paymentHash: string): Promise<void> {
    await query(
      "UPDATE purchases SET status = 'paid' WHERE payment_hash = $1",
      [paymentHash]
    );
    logger.info('Purchase marked as paid', { paymentHash });
  }

  async getPurchasesByUser(telegramUserId: number): Promise<Purchase[]> {
    const result = await query(
      `SELECT * FROM purchases 
       WHERE telegram_user_id = $1 AND status = 'paid'
       ORDER BY purchased_at DESC`,
      [telegramUserId]
    );
    return result.rows;
  }

  async getPurchasesByLottery(lotteryId: number): Promise<Purchase[]> {
    const result = await query(
      `SELECT * FROM purchases 
       WHERE lottery_id = $1 AND status = 'paid'
       ORDER BY purchased_at DESC`,
      [lotteryId]
    );
    return result.rows;
  }

  async getPendingPurchases(): Promise<Purchase[]> {
    const result = await query(
      "SELECT * FROM purchases WHERE status = 'pending'"
    );
    return result.rows;
  }
}
