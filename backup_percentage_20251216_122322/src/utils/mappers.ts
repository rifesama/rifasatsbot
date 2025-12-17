// ============================================
// src/utils/mappers.ts - CON SISTEMA HÍBRIDO COMPLETO
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
  winning_number?: number;  // ← Nuevo
  selection_method?: 'random' | 'manual';  // ← Nuevo
  accumulated_funds?: number;  // ← Nuevo
  admin_fee?: number;  // ← Nuevo
  winner_telegram_id?: number;  // ← Nuevo
  winner_notified_at?: Date;  // ← Nuevo
  all_participants_notified?: boolean;  // ← Nuevo
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
      winningNumber: row.winning_number,  // ← Nuevo
      selectionMethod: row.selection_method,  // ← Nuevo
      accumulatedFunds: row.accumulated_funds,  // ← Nuevo
      adminFee: row.admin_fee,  // ← Nuevo
      winnerTelegramId: row.winner_telegram_id,  // ← Nuevo
      winnerNotifiedAt: row.winner_notified_at,  // ← Nuevo
      allParticipantsNotified: row.all_participants_notified,  // ← Nuevo
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