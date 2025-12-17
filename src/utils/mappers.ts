// ============================================
// src/utils/mappers.ts - CON PORCENTAJE CONFIGURABLE
// ============================================
import { Lottery, Ticket, Purchase } from '../types';

export interface LotteryDB {
  id: number;
  name: string;
  description?: string;
  ticket_price: number;
  draw_date: Date;
  draw_time: string;
  status: 'active' | 'closed' | 'completed';
  created_at: Date;
  created_by?: number;
  winning_number?: number;
  selection_method?: 'random' | 'manual';
  accumulated_funds?: number;
  admin_fee?: number;
  admin_fee_percentage?: number;  // ← NUEVO
  winner_telegram_id?: number;
  winner_notified_at?: Date;
  all_participants_notified?: boolean;
}

export interface TicketDB {
  id: number;
  lottery_id: number;
  number: number;
  status: 'available' | 'reserved' | 'sold';
  reserved_until?: Date;
}

export interface PurchaseDB {
  id: number;
  lottery_id: number;
  ticket_id: number;
  ticket_number: number;
  telegram_user_id: number;
  telegram_username: string;
  lightning_address: string;
  payment_hash: string;
  invoice: string;
  amount_sats: number;
  purchased_at: Date;
  status: 'pending' | 'paid' | 'expired';
}

export class DBMapper {
  static lotteryFromDB(row: LotteryDB): Lottery {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      ticketPrice: row.ticket_price,
      drawDate: row.draw_date,
      drawTime: row.draw_time,
      status: row.status,
      createdAt: row.created_at,
      createdBy: row.created_by,
      winningNumber: row.winning_number,
      selectionMethod: row.selection_method,
      accumulatedFunds: row.accumulated_funds,
      adminFee: row.admin_fee,
      adminFeePercentage: row.admin_fee_percentage,  // ← NUEVO
      winnerTelegramId: row.winner_telegram_id,
      winnerNotifiedAt: row.winner_notified_at,
      allParticipantsNotified: row.all_participants_notified,
    };
  }

  static ticketFromDB(row: TicketDB): Ticket {
    return {
      id: row.id,
      lotteryId: row.lottery_id,
      number: row.number,
      status: row.status,
      reservedUntil: row.reserved_until,
    };
  }

  static purchaseFromDB(row: PurchaseDB): Purchase {
    return {
      id: row.id,
      lotteryId: row.lottery_id,
      ticketId: row.ticket_id,
      ticketNumber: row.ticket_number,
      telegramUserId: row.telegram_user_id,
      telegramUsername: row.telegram_username,
      lightningAddress: row.lightning_address,
      paymentHash: row.payment_hash,
      invoice: row.invoice,
      amountSats: row.amount_sats,
      purchasedAt: row.purchased_at,
      status: row.status,
    };
  }
}