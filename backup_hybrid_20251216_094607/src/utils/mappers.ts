// ============================================
// src/utils/mappers.ts - VERSIÓN COMPLETA CON DESCRIPCIÓN
// ============================================
import { Lottery, Ticket, Purchase } from '../types';

// Tipos de la base de datos (snake_case) - como vienen de PostgreSQL
export interface LotteryDB {
  id: number;
  name: string;
  description?: string;  // ← Campo de descripción agregado
  ticket_price: number;
  draw_date: Date;
  draw_time: string;
  status: 'active' | 'closed' | 'completed';
  created_at: Date;
  created_by?: number;
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
      description: row.description,  // ← Campo de descripción agregado
      ticketPrice: row.ticket_price,
      drawDate: row.draw_date,
      drawTime: row.draw_time,
      status: row.status,
      createdAt: row.created_at,
      createdBy: row.created_by,
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