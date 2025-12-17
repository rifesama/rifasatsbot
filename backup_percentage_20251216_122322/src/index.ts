// ============================================
// src/index.ts - SISTEMA HÍBRIDO COMPLETO
// ============================================
import { Telegraf, Context, session } from 'telegraf';
import { config } from './config/bot.config';
import { logger } from './utils/logger';
import { isAdmin } from './bot/middlewares/auth';
import { LotteryService } from './services/lotteryService';
import { TicketService } from './services/ticketService';
import { PurchaseService } from './services/purchaseService';
import { StatisticsService } from './services/statisticsService';
import { LightningService } from './services/lightningService';
import { createTicketsKeyboard, adminMainKeyboard } from './bot/keyboards/ticketsKeyboard';
import { generateQRCode } from './utils/qrGenerator';
import { validateLightningAddress, formatNumber, formatSats } from './utils/validators';
import { Lottery } from './types';
import { query } from './database/connection';
import cron from 'node-cron';

// ============================================
// TIPOS DE SESIÓN - ACTUALIZADO
// ============================================
interface SessionData {
  selectedTicket?: number;
  lotteryId?: number;
  awaitingLightningAddress?: boolean;
  awaitingWinningNumber?: boolean;  // ← Nuevo: espera número ganador manual
  awaitingLotteryData?: {
    step: 'name' | 'description' | 'price' | 'date' | 'time';
    name?: string;
    description?: string;
    price?: number;
    date?: string;
  };
}

interface MyContext extends Context {
  session?: SessionData;
}

// ============================================
// SERVICIOS
// ============================================
const lotteryService = new LotteryService();
const ticketService = new TicketService();
const purchaseService = new PurchaseService();
const statsService = new StatisticsService();
const lightningService = new LightningService();

const bot = new Telegraf<MyContext>(config.telegram.botToken);
bot.use(session());

// ============================================
// COMANDOS PRINCIPALES
// ============================================

bot.command('start', async (ctx) => {
  const firstName = ctx.from?.first_name || 'Usuario';
  const isUserAdmin = ctx.from?.id ? config.telegram.adminIds.includes(ctx.from.id) : false;

  let message = `¡Hola ${firstName}! 👋\n\nBienvenido al Bot de Lotería Lightning ⚡\n\n`;

  if (isUserAdmin) {
    message += '🔐 Eres administrador. Usa /admin para gestionar loterías.\n\n';
  }

  message += 'Usa /lottery para ver la lotería activa y comprar números.';

  await ctx.reply(message);
});

bot.command('admin', isAdmin, async (ctx) => {
  await ctx.reply(
    '🔐 *Panel de Administrador*\n\nSelecciona una opción:',
    {
      parse_mode: 'Markdown',
      reply_markup: adminMainKeyboard,
    }
  );
});

bot.command('lottery', async (ctx) => {
  const lottery = await lotteryService.getActiveLottery();

  if (!lottery) {
    return ctx.reply('❌ No hay ninguna lotería activa en este momento.');
  }

  const stats = await statsService.getLotteryStats(lottery.id);
  const drawDate = new Date(lottery.drawDate).toLocaleDateString('es-CO');

  let message = `🎰 *${lottery.name}*\n\n`;
  
  if (lottery.description) {
    message += `📋 ${lottery.description}\n\n`;
  }
  
  message += `💰 Precio por número: ${formatSats(lottery.ticketPrice)} sats\n` +
    `📅 Fecha del sorteo: ${drawDate} a las ${lottery.drawTime}\n\n`;
  
  // Mostrar fondos acumulados si existen
  if (lottery.accumulatedFunds && lottery.accumulatedFunds > 0) {
    message += `🎁 *Bote acumulado:* ${formatSats(lottery.accumulatedFunds)} sats\n\n`;
  }
  
  message += `📊 *Estadísticas:*\n` +
    `✅ Vendidos: ${stats.soldTickets}/100 (${stats.percentageSold.toFixed(1)}%)\n` +
    `🟩 Disponibles: ${stats.availableTickets}\n` +
    `💵 Esta rifa: ${formatSats(stats.totalRevenue)} sats\n`;
  
  if (lottery.accumulatedFunds && lottery.accumulatedFunds > 0) {
    message += `🏆 Premio total: ${formatSats(stats.totalRevenue + lottery.accumulatedFunds)} sats\n`;
  }
  
  message += `\nSelecciona un número disponible (🟩) para comprarlo:`;

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: createTicketsKeyboard(stats.availableNumbers, stats.soldNumbers),
  });
});

bot.command('mytickets', async (ctx) => {
  if (!ctx.from?.id) {
    return ctx.reply('Error al obtener tu información.');
  }

  const purchases = await purchaseService.getPurchasesByUser(ctx.from.id);

  if (purchases.length === 0) {
    return ctx.reply('No tienes números comprados aún.');
  }

  let message = '🎟️ *Tus números:*\n\n';
  
  for (const purchase of purchases) {
    const lottery = await lotteryService.getActiveLottery();
    message += `Número: *${formatNumber(purchase.ticketNumber)}*\n`;
    if (lottery) {
      message += `Lotería: ${lottery.name}\n`;
    }
    message += `Fecha de compra: ${purchase.purchasedAt.toLocaleString('es-CO')}\n\n`;
  }

  await ctx.reply(message, { parse_mode: 'Markdown' });
});

// ============================================
// CALLBACKS DE ADMINISTRADOR
// ============================================

bot.action('admin_create', isAdmin, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session = { awaitingLotteryData: { step: 'name' } };
  await ctx.reply('📝 Por favor, ingresa el nombre de la lotería:');
});

bot.action('admin_stats', isAdmin, async (ctx) => {
  await ctx.answerCbQuery();
  
  const lottery = await lotteryService.getActiveLottery();
  if (!lottery) {
    return ctx.reply('❌ No hay ninguna lotería activa.');
  }

  const stats = await statsService.getLotteryStats(lottery.id);
  const purchases = await purchaseService.getPurchasesByLottery(lottery.id);
  const drawDate = new Date(lottery.drawDate).toLocaleDateString('es-CO');

  let message = `📊 *Estadísticas - ${lottery.name}*\n\n`;
  
  if (lottery.description) {
    message += `📋 ${lottery.description}\n\n`;
  }
  
  message += `📅 Sorteo: ${drawDate} a las ${lottery.drawTime}\n`;
  message += `💰 Precio: ${formatSats(lottery.ticketPrice)} sats\n\n`;
  
  if (lottery.accumulatedFunds && lottery.accumulatedFunds > 0) {
    message += `🎁 *Bote acumulado anterior:* ${formatSats(lottery.accumulatedFunds)} sats\n`;
  }
  
  message += `✅ Vendidos: ${stats.soldTickets}/100 (${stats.percentageSold.toFixed(1)}%)\n`;
  message += `🟩 Disponibles: ${stats.availableTickets}\n`;
  message += `💵 Recaudado en esta rifa: ${formatSats(stats.totalRevenue)} sats\n`;
  
  if (lottery.accumulatedFunds && lottery.accumulatedFunds > 0) {
    message += `🏆 *Premio total disponible:* ${formatSats(stats.totalRevenue + lottery.accumulatedFunds)} sats\n`;
  }
  
  message += `\n🎯 *Números vendidos:*\n`;
  message += stats.soldNumbers.map(n => formatNumber(n)).join(', ') || 'Ninguno';

  await ctx.reply(message, { parse_mode: 'Markdown' });

  if (purchases.length > 0) {
    let detailMessage = '📋 *Compras detalladas:*\n\n';
    
    for (const p of purchases) {
      detailMessage += `Número: ${formatNumber(p.ticketNumber)}\n`;
      detailMessage += `Usuario: @${p.telegramUsername} (ID: ${p.telegramUserId})\n`;
      detailMessage += `Dirección LN: ${p.lightningAddress}\n`;
      detailMessage += `Fecha: ${new Date(p.purchasedAt).toLocaleString('es-CO')}\n`;
      detailMessage += `Monto: ${formatSats(p.amountSats)} sats\n\n`;
    }

    await ctx.reply(detailMessage, { parse_mode: 'Markdown' });
  }
});

// ← NUEVO: Selección aleatoria
bot.action('admin_winner_random', isAdmin, async (ctx) => {
  await ctx.answerCbQuery();
  
  const lottery = await lotteryService.getActiveLottery();
  if (!lottery) {
    return ctx.reply('❌ No hay ninguna lotería activa.');
  }

  const stats = await statsService.getLotteryStats(lottery.id);
  
  if (stats.soldTickets === 0) {
    return ctx.reply('❌ No hay números vendidos. No se puede seleccionar un ganador.');
  }

  try {
    await ctx.reply('🎲 Seleccionando ganador aleatoriamente...');
    
    const result = await lotteryService.selectWinnerRandom(lottery.id);
    
    await processWinnerResult(ctx, lottery, result);
  } catch (error: any) {
    logger.error('Error in random winner selection', { error });
    await ctx.reply(`❌ Error al seleccionar ganador: ${error.message}`);
  }
});

// ← NUEVO: Selección manual
bot.action('admin_winner_manual', isAdmin, async (ctx) => {
  await ctx.answerCbQuery();
  
  const lottery = await lotteryService.getActiveLottery();
  if (!lottery) {
    return ctx.reply('❌ No hay ninguna lotería activa.');
  }

  ctx.session = { 
    lotteryId: lottery.id,
    awaitingWinningNumber: true 
  };

  await ctx.reply(
    '✍️ *Selección Manual de Ganador*\n\n' +
    'Ingresa el número ganador (00-99):\n\n' +
    '_Ejemplo: Si la lotería externa terminó en 47, escribe: 47_\n\n' +
    '⚠️ El número será verificado contra los números vendidos.',
    { parse_mode: 'Markdown' }
  );
});

bot.action('admin_close', isAdmin, async (ctx) => {
  await ctx.answerCbQuery();
  
  const lottery = await lotteryService.getActiveLottery();
  if (!lottery) {
    return ctx.reply('❌ No hay ninguna lotería activa.');
  }

  await lotteryService.closeLottery(lottery.id);
  await ctx.reply(`✅ Lotería "${lottery.name}" cerrada exitosamente.`);
});

// ============================================
// CALLBACKS DE USUARIOS
// ============================================

bot.action(/^select_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  
  const ticketNumber = parseInt(ctx.match[1]);
  const lottery = await lotteryService.getActiveLottery();

  if (!lottery) {
    return ctx.reply('❌ No hay ninguna lotería activa.');
  }

  const reserved = await ticketService.reserveTicket(lottery.id, ticketNumber);

  if (!reserved) {
    return ctx.reply('❌ Este número ya no está disponible. Por favor selecciona otro.');
  }

  ctx.session = {
    selectedTicket: ticketNumber,
    lotteryId: lottery.id,
    awaitingLightningAddress: true,
  };

  await ctx.reply(
    `Has seleccionado el número *${formatNumber(ticketNumber)}*\n\n` +
    `Por favor, ingresa tu dirección Lightning Network:\n` +
    `Ejemplo: satoshi@colsats.com`,
    { parse_mode: 'Markdown' }
  );
});

bot.action(/^sold_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery('❌ Este número ya está vendido', { show_alert: true });
});

// ============================================
// HANDLERS DE MENSAJES
// ============================================

bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  
  if (!ctx.from?.id) {
    return ctx.reply('Error al procesar tu solicitud.');
  }

  // ← NUEVO: Handler para número ganador manual
  if (ctx.session?.awaitingWinningNumber) {
    const winningNumber = parseInt(text);
    
    if (isNaN(winningNumber) || winningNumber < 0 || winningNumber > 99) {
      return ctx.reply('❌ Por favor ingresa un número válido entre 00 y 99.');
    }

    const lotteryId = ctx.session.lotteryId!;
    ctx.session = {};

    try {
      await ctx.reply(`✍️ Procesando número ganador: *${formatNumber(winningNumber)}*...`, { parse_mode: 'Markdown' });
      
      const lottery = await lotteryService.getLotteryById(lotteryId);
      if (!lottery) {
        return ctx.reply('❌ Error: Lotería no encontrada.');
      }

      const result = await lotteryService.selectWinnerManual(lotteryId, winningNumber);
      
      await processWinnerResult(ctx, lottery, result);
    } catch (error: any) {
      logger.error('Error in manual winner selection', { error });
      await ctx.reply(`❌ Error al procesar ganador: ${error.message}`);
    }
    return;
  }

  // Flujo de creación de lotería
  if (ctx.session?.awaitingLotteryData) {
    const data = ctx.session.awaitingLotteryData;
    
    if (data.step === 'name') {
      data.name = text;
      data.step = 'description';
      await ctx.reply(
        '📝 Ahora ingresa una descripción de la rifa:\n\n' +
        'Ejemplo: "Sorteo de una bicicleta. Ganador según últimas 2 cifras de la Lotería de Bogotá."'
      );
    } else if (data.step === 'description') {
      data.description = text;
      data.step = 'price';
      await ctx.reply('💰 Ingresa el precio por número en satoshis:');
    } else if (data.step === 'price') {
      const price = parseInt(text);
      if (isNaN(price) || price <= 0) {
        return ctx.reply('❌ Por favor ingresa un número válido de satoshis.');
      }
      data.price = price;
      data.step = 'date';
      await ctx.reply('📅 Ingresa la fecha del sorteo (YYYY-MM-DD):\n\nEjemplo: 2025-12-31');
    } else if (data.step === 'date') {
      data.date = text;
      data.step = 'time';
      await ctx.reply('🕐 Ingresa la hora del sorteo (HH:MM):\n\nEjemplo: 20:00');
    } else if (data.step === 'time') {
      try {
        const lottery = await lotteryService.createLottery(
          data.name!,
          data.description,
          data.price!,
          new Date(data.date!),
          text,
          ctx.from.id
        );

        ctx.session = {};
        
        let successMessage = `✅ *Lotería creada exitosamente!*\n\n` +
          `📝 Nombre: ${lottery.name}\n`;
        
        if (lottery.description) {
          successMessage += `📋 Descripción: ${lottery.description}\n`;
        }
        
        if (lottery.accumulatedFunds && lottery.accumulatedFunds > 0) {
          successMessage += `🎁 Bote acumulado: ${formatSats(lottery.accumulatedFunds)} sats\n`;
        }
        
        successMessage += `💰 Precio: ${formatSats(lottery.ticketPrice)} sats\n` +
          `📅 Sorteo: ${new Date(lottery.drawDate).toLocaleDateString('es-CO')} a las ${lottery.drawTime}`;
        
        await ctx.reply(successMessage, { parse_mode: 'Markdown' });
      } catch (error: any) {
        logger.error('Failed to create lottery', { error });
        ctx.session = {};
        await ctx.reply(`❌ Error creando la lotería: ${error.message}`);
      }
    }
    return;
  }

  // Flujo de dirección Lightning
  if (ctx.session?.awaitingLightningAddress) {
    const lightningAddress = text.trim();

    if (!validateLightningAddress(lightningAddress)) {
      return ctx.reply(
        '❌ Dirección Lightning inválida.\n\n' +
        'Debe tener el formato: usuario@dominio.com\n' +
        'Ejemplo: satoshi@colsats.com'
      );
    }

    const ticketNumber = ctx.session.selectedTicket!;
    const lotteryId = ctx.session.lotteryId!;
    const lottery = await lotteryService.getActiveLottery();

    if (!lottery) {
      return ctx.reply('❌ La lotería ya no está activa.');
    }

    try {
      const { paymentHash, paymentRequest } = await lightningService.createInvoice(
        lottery.ticketPrice,
        `Lotería ${lottery.name} - Número ${formatNumber(ticketNumber)}`
      );

      const tickets = await ticketService.getTicketsByLottery(lotteryId);
      const ticket = tickets.find(t => t.number === ticketNumber);

      if (!ticket) {
        return ctx.reply('❌ Error al procesar el ticket.');
      }

      await purchaseService.createPurchase(
        lotteryId,
        ticket.id,
        ticketNumber,
        ctx.from.id,
        ctx.from.username || '',
        lightningAddress,
        paymentHash,
        paymentRequest,
        lottery.ticketPrice
      );

      const qrBuffer = await generateQRCode(paymentRequest);

      await ctx.replyWithPhoto(
        { source: qrBuffer },
        {
          caption: 
            `⚡ *Factura Lightning Network*\n\n` +
            `Número: *${formatNumber(ticketNumber)}*\n` +
            `Monto: ${formatSats(lottery.ticketPrice)} sats\n\n` +
            `Escanea el código QR o copia la factura:\n\n` +
            `\`${paymentRequest}\`\n\n` +
            `⏱️ Expira en ${config.invoice.expiryMinutes} minutos.`,
          parse_mode: 'Markdown',
        }
      );

      ctx.session = {};

      checkPaymentStatus(paymentHash, lotteryId, ticketNumber, ctx.from.id, lottery);
    } catch (error) {
      logger.error('Error creating invoice', { error });
      await ctx.reply('❌ Error generando la factura.');
      ctx.session = {};
    }
  }
});

// ============================================
// FUNCIONES AUXILIARES
// ============================================

async function processWinnerResult(ctx: MyContext, lottery: Lottery, result: any) {
  const stats = await statsService.getLotteryStats(lottery.id);
  
  if (result.hasWinner) {
    // HAY GANADOR
    let message = `🏆 *¡GANADOR SELECCIONADO!*\n\n`;
    message += `🎯 Número ganador: *${formatNumber(result.winningNumber)}*\n\n`;
    message += `👤 Ganador: @${result.winner.telegramUsername}\n`;
    message += `⚡ Dirección LN: ${result.winner.lightningAddress}\n`;
    message += `💰 Premio total: ${formatSats(result.totalPrize)} sats\n\n`;
    
    if (lottery.accumulatedFunds && lottery.accumulatedFunds > 0) {
      message += `   📊 De esta rifa: ${formatSats(stats.totalRevenue)} sats\n`;
      message += `   🎁 Bote acumulado: ${formatSats(lottery.accumulatedFunds)} sats\n\n`;
    }
    
    message += `Envía el premio a la dirección Lightning del ganador.`;

    await ctx.reply(message, { parse_mode: 'Markdown' });

    // Notificar al ganador
    try {
      await bot.telegram.sendMessage(
        result.winner.telegramUserId,
        `🎉 *¡FELICIDADES! ¡GANASTE!* 🎉\n\n` +
        `Has ganado la lotería "${lottery.name}"!\n\n` +
        `🎯 Número ganador: *${formatNumber(result.winningNumber)}*\n` +
        `💰 Premio: ${formatSats(result.totalPrize)} sats\n\n` +
        `El premio será enviado a:\n${result.winner.lightningAddress}`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Could not notify winner', { error });
    }
  } else {
    // NO HAY GANADOR - 80/20
    let message = `📊 *Resultado del Sorteo*\n\n`;
    message += `🎯 Número ganador: *${formatNumber(result.winningNumber)}*\n\n`;
    message += `❌ *Este número NO fue vendido*\n\n`;
    message += `💰 Total recaudado: ${formatSats(result.totalPrize)} sats\n\n`;
    message += `📋 *Distribución de fondos:*\n`;
    message += `   🎁 80% para próxima rifa: ${formatSats(result.accumulatedForNext!)} sats\n`;
    message += `   💼 20% admin: ${formatSats(result.adminFee!)} sats\n\n`;
    message += `¿Deseas notificar a todos los participantes?`;

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Sí, notificar a todos', callback_data: 'notify_all_participants' }],
          [{ text: '❌ No notificar', callback_data: 'skip_notification' }],
        ],
      },
    });
  }
}

// Handler para notificar a participantes cuando no hay ganador
bot.action('notify_all_participants', isAdmin, async (ctx) => {
  await ctx.answerCbQuery();
  
  try {
    await ctx.reply('📤 Enviando notificaciones a todos los participantes...');
    
    // Obtener última lotería completada sin ganador
    const result = await query(
      `SELECT * FROM lotteries 
       WHERE status = 'completed' AND winning_number IS NOT NULL AND winner_telegram_id IS NULL
       ORDER BY created_at DESC LIMIT 1`
    );
    
    if (result.rows.length === 0) {
      return ctx.reply('❌ No se encontró la lotería.');
    }
    
    const lottery = result.rows[0];
    const purchases = await purchaseService.getPurchasesByLottery(lottery.id);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const purchase of purchases) {
      try {
        await bot.telegram.sendMessage(
          purchase.telegramUserId,
          `📢 *Resultado - ${lottery.name}*\n\n` +
          `🎯 Número ganador: *${formatNumber(lottery.winning_number)}*\n` +
          `Tu número: ${formatNumber(purchase.ticketNumber)}\n\n` +
          `❌ El número ganador no fue vendido.\n\n` +
          `🎁 El 80% del bote (${formatSats(lottery.accumulated_funds)} sats) ` +
          `se acumula para la próxima rifa.\n\n` +
          `¡Gracias por participar! 🙏`,
          { parse_mode: 'Markdown' }
        );
        successCount++;
        await new Promise(resolve => setTimeout(resolve, 100)); // Evitar rate limit
      } catch (error) {
        logger.error('Failed to notify participant', { error, userId: purchase.telegramUserId });
        failCount++;
      }
    }
    
    await lotteryService.markParticipantsNotified(lottery.id);
    
    await ctx.reply(
      `✅ Notificaciones enviadas\n\n` +
      `✓ Exitosas: ${successCount}\n` +
      `✗ Fallidas: ${failCount}`
    );
  } catch (error) {
    logger.error('Error notifying participants', { error });
    await ctx.reply('❌ Error al enviar notificaciones.');
  }
});

bot.action('skip_notification', isAdmin, async (ctx) => {
  await ctx.answerCbQuery('No se enviarán notificaciones');
  await ctx.reply('✅ Operación completada sin notificaciones.');
});

// ============================================
// VERIFICACIÓN DE PAGOS
// ============================================

async function checkPaymentStatus(
  paymentHash: string,
  lotteryId: number,
  ticketNumber: number,
  userId: number,
  lottery: Lottery
) {
  const maxChecks = 60;
  let checks = 0;

  const interval = setInterval(async () => {
    checks++;

    try {
      const isPaid = await lightningService.checkInvoiceStatus(paymentHash);

      if (isPaid) {
        clearInterval(interval);

        await purchaseService.markAsPaid(paymentHash);
        await ticketService.markTicketAsSold(lotteryId, ticketNumber);

        const drawDate = new Date(lottery.drawDate).toLocaleDateString('es-CO');
        
        await bot.telegram.sendMessage(
          userId,
          `✅ *¡Pago confirmado!*\n\n` +
          `Tu número: *${formatNumber(ticketNumber)}*\n\n` +
          `Sorteo: ${drawDate} a las ${lottery.drawTime}\n\n` +
          `Si eres el ganador, te contactaremos.`,
          { parse_mode: 'Markdown' }
        );

        logger.info('Payment confirmed', { paymentHash, ticketNumber });
      }

      if (checks >= maxChecks) {
        clearInterval(interval);
        logger.warn('Payment check timeout', { paymentHash });
      }
    } catch (error) {
      logger.error('Error checking payment', { error, paymentHash });
    }
  }, 15000);
}

// ============================================
// CRON JOBS
// ============================================

cron.schedule('* * * * *', async () => {
  try {
    const lottery = await lotteryService.getActiveLottery();
    if (lottery) {
      await query(
        `UPDATE tickets SET status = 'available', reserved_until = NULL 
         WHERE lottery_id = $1 AND status = 'reserved' AND reserved_until < NOW()`,
        [lottery.id]
      );
    }
  } catch (error) {
    logger.error('Error cleaning reservations', { error });
  }
});

// ============================================
// ERROR HANDLER & START
// ============================================

bot.catch((err: any, ctx: MyContext) => {
  logger.error('Bot error', { error: err, userId: ctx.from?.id });
  ctx.reply('❌ Ocurrió un error.');
});

bot.launch()
  .then(() => {
    logger.info('Bot started successfully');
    console.log('🤖 Bot de lotería Lightning iniciado - Sistema Híbrido');
  })
  .catch((error) => {
    logger.error('Failed to start bot', { error });
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));