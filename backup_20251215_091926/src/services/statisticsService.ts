import { query } from '../database/connection';
import { LotteryStats } from '../types';

export class StatisticsService {
  async getLotteryStats(lotteryId: number): Promise<LotteryStats> {
    const ticketsResult = await query(
      `SELECT number, status FROM tickets WHERE lottery_id = $1 ORDER BY number`,
      [lotteryId]
    );

    const revenueResult = await query(
      `SELECT COALESCE(SUM(amount_sats), 0) as total 
       FROM purchases WHERE lottery_id = $1 AND status = 'paid'`,
      [lotteryId]
    );

    const tickets = ticketsResult.rows;
    const soldTickets = tickets.filter(t => t.status === 'sold');
    const availableTickets = tickets.filter(t => t.status === 'available');

    return {
      totalTickets: 100,
      soldTickets: soldTickets.length,
      availableTickets: availableTickets.length,
      totalRevenue: parseInt(revenueResult.rows[0].total),
      percentageSold: (soldTickets.length / 100) * 100,
      soldNumbers: soldTickets.map(t => t.number),
      availableNumbers: availableTickets.map(t => t.number),
    };
  }
}