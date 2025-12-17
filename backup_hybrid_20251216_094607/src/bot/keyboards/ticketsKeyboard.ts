// ============================================
// src/bot/keyboards/ticketsKeyboard.ts
// VERSIÓN MEJORADA: 5 números por fila
// ============================================
import { InlineKeyboardMarkup } from 'telegraf/types';
import { formatNumber } from '../../utils/validators';

export function createTicketsKeyboard(
  availableNumbers: number[],
  soldNumbers: number[]
): InlineKeyboardMarkup {
  const buttons = [];
  const numbersPerRow = 5; // Cambiado de 10 a 5
  const totalNumbers = 100;
  const totalRows = totalNumbers / numbersPerRow; // 20 filas

  for (let i = 0; i < totalRows; i++) {
    const row = [];
    
    for (let j = 0; j < numbersPerRow; j++) {
      const num = i * numbersPerRow + j;
      const isSold = soldNumbers.includes(num);
      const isAvailable = availableNumbers.includes(num);
      
      let text = formatNumber(num);
      let callbackData = `select_${num}`;

      if (isSold) {
        text = `⬜ ${formatNumber(num)}`;
        callbackData = `sold_${num}`;
      } else if (isAvailable) {
        text = `🟩 ${formatNumber(num)}`;
      }

      row.push({
        text: text,
        callback_data: callbackData,
      });
    }
    
    buttons.push(row);
  }

  return { inline_keyboard: buttons };
}

export const adminMainKeyboard: InlineKeyboardMarkup = {
  inline_keyboard: [
    [{ text: '➕ Crear Lotería', callback_data: 'admin_create' }],
    [{ text: '📊 Ver Estadísticas', callback_data: 'admin_stats' }],
    [{ text: '🏆 Seleccionar Ganador', callback_data: 'admin_winner' }],
    [{ text: '🔒 Cerrar Lotería', callback_data: 'admin_close' }],
  ],
};