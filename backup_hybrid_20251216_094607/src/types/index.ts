// ============================================
// src/types/index.ts - VERSIÓN COMPLETA CON DESCRIPCIÓN
// ============================================

export interface Lottery {
  id: number;
  name: string;
  description?: string;  // ← Campo de descripción agregado
  ticketPrice: number;
  drawDate: Date;
  drawTime: string;
  status: 'active' | 'closed' | 'completed';
  createdAt: Date;
  createdBy?: number;
}

export interface Ticket {
  id: number;
  lotteryId: number;
  number: number;
  status: 'available' | 'reserved' | 'sold';
  reservedUntil?: Date;
}

export interface Purchase {
  id: number;
  lotteryId: number;
  ticketId: number;
  ticketNumber: number;
  telegramUserId: number;
  telegramUsername: string;
  lightningAddress: string;
  paymentHash: string;
  invoice: string;
  amountSats: number;
  purchasedAt: Date;
  status: 'pending' | 'paid' | 'expired';
}

export interface LotteryStats {
  totalTickets: number;
  soldTickets: number;
  availableTickets: number;
  totalRevenue: number;
  percentageSold: number;
  soldNumbers: number[];
  availableNumbers: number[];
}