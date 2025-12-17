import { InlineKeyboardMarkup } from 'telegraf/types';
import { formatNumber } from '../../utils/validators';

export function createTicketsKeyboard(
  availableNumbers: number[],
  soldNumbers: number[]
): InlineKeyboardMarkup {
  const allNumbers = Array.from({ length: 100 }, (_, i) => i);
  const buttons = [];

  // Create rows of 10 numbers each
  for (let i = 0; i < 10; i++) {
    const row = [];
    for (let j = 0; j < 10; j++) {
      const num = i * 10 + j;
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
