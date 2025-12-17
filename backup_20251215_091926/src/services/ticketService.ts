import { query, pool } from '../database/connection';
import { Ticket } from '../types';
import { logger } from '../utils/logger';

export class TicketService {
  async getTicketsByLottery(lotteryId: number): Promise<Ticket[]> {
    const result = await query(
      'SELECT * FROM tickets WHERE lottery_id = $1 ORDER BY number',
      [lotteryId]
    );
    return result.rows;
  }

  async getAvailableTickets(lotteryId: number): Promise<number[]> {
    // Clear expired reservations
    await query(
      `UPDATE tickets SET status = 'available', reserved_until = NULL 
       WHERE lottery_id = $1 AND status = 'reserved' AND reserved_until < NOW()`,
      [lotteryId]
    );

    const result = await query(
      "SELECT number FROM tickets WHERE lottery_id = $1 AND status = 'available' ORDER BY number",
      [lotteryId]
    );
    return result.rows.map(row => row.number);
  }

  async reserveTicket(lotteryId: number, ticketNumber: number): Promise<boolean> {
    const expiryTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const result = await query(
      `UPDATE tickets 
       SET status = 'reserved', reserved_until = $1
       WHERE lottery_id = $2 AND number = $3 AND status = 'available'
       RETURNING id`,
      [expiryTime, lotteryId, ticketNumber]
    );

    return result.rowCount > 0;
  }

  async markTicketAsSold(lotteryId: number, ticketNumber: number): Promise<void> {
    await query(
      `UPDATE tickets SET status = 'sold', reserved_until = NULL 
       WHERE lottery_id = $1 AND number = $2`,
      [lotteryId, ticketNumber]
    );
    logger.info('Ticket marked as sold', { lotteryId, ticketNumber });
  }
}