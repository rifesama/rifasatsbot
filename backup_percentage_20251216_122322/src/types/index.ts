// ============================================
// src/types/index.ts - CON SISTEMA HÍBRIDO COMPLETO
// ============================================

export interface Lottery {
  id: number;
  name: string;
  description?: string;
  ticketPrice: number;
  drawDate: Date;
  drawTime: string;
  status: 'active' | 'closed' | 'completed';
  createdAt: Date;
  createdBy?: number;
  winningNumber?: number;  // ← Número ganador (00-99)
  selectionMethod?: 'random' | 'manual';  // ← Método de selección
  accumulatedFunds?: number;  // ← Fondos acumulados de loterías anteriores
  adminFee?: number;  // ← Comisión de administración
  winnerTelegramId?: number;  // ← ID del ganador
  winnerNotifiedAt?: Date;  // ← Cuándo se notificó
  allParticipantsNotified?: boolean;  // ← Si se notificó a todos
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

export interface WinnerResult {
  winningNumber: number;
  hasWinner: boolean;
  winner?: {
    telegramUserId: number;
    telegramUsername: string;
    lightningAddress: string;
  };
  totalPrize: number;
  accumulatedForNext?: number;  // Si no hay ganador: 80%
  adminFee?: number;  // Si no hay ganador: 20%
}