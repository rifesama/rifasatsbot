// ============================================
// src/types/index.ts - CON PORCENTAJE CONFIGURABLE
// ============================================

export interface Lottery {
  id: number;
  name: string;
  description?: string;
  ticketPrice: number;
  drawDate: Date;
  drawTime: string;
  status: 'active' | 'frozen' | 'closed' | 'completed';
  createdAt: Date;
  createdBy?: number;
  winningNumber?: number;
  selectionMethod?: 'random' | 'manual';
  accumulatedFunds?: number;
  adminFee?: number;
  adminFeePercentage?: number;  // ← NUEVO: Porcentaje configurable (0-100)
  winnerTelegramId?: number;
  winnerNotifiedAt?: Date;
  allParticipantsNotified?: boolean;
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
  totalAmount: number;  // Total recaudado + acumulado
  winnerPrize?: number;  // Si hay ganador: monto para el ganador
  adminFee: number;  // Comisión admin (siempre presente)
  accumulatedForNext?: number;  // Si no hay ganador: monto acumulado
  adminFeePercentage: number;  // Porcentaje aplicado
}