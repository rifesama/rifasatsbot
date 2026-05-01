// ============================================
// src/bot/keyboards/ticketsKeyboard.ts - CON SISTEMA HÍBRIDO
// ============================================
import { InlineKeyboardMarkup } from 'telegraf/types';
import { formatNumber } from '../../utils/validators';

export function createTicketsKeyboard(
  availableNumbers: number[],
  soldNumbers: number[]
): InlineKeyboardMarkup {
  const buttons = [];
  const numbersPerRow = 5;
  const totalNumbers = 100;
  const totalRows = totalNumbers / numbersPerRow;

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

// ← ACTUALIZADO: Keyboard de admin con opciones híbridas
export const adminMainKeyboard: InlineKeyboardMarkup = {
  inline_keyboard: [
    [{ text: '➕ Crear Lotería', callback_data: 'admin_create' }],
    [{ text: '📊 Ver Estadísticas', callback_data: 'admin_stats' }],
    [{ text: '🚫 Congelar Venta', callback_data: 'admin_freeze' }],
    [
      { text: '🎲 Selección Aleatoria', callback_data: 'admin_winner_random' },
    ],
    [
      { text: '✍️ Selección Manual', callback_data: 'admin_winner_manual' },
    ],
    [{ text: '❌ Cerrar Lotería', callback_data: 'admin_close' }],
    [{ text: '🗑️ Eliminar Lotería', callback_data: 'admin_delete' }],
  ],
};