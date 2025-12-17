// ============================================
// src/index.ts - VERSIÓN COMPLETA CON DESCRIPCIÓN
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
// DEFINICIÓN DE TIPOS DE SESIÓN - CON DESCRIPCIÓN
// ============================================
interface SessionData {
  selectedTicket?: number;
  lotteryId?: number;
  awaitingLightningAddress?: boolean;
  awaitingLotteryData?: {
    step: 'name' | 'description' | 'price' | 'date' | 'time';  // ← 'description' agregado
    name?: string;
    description?: string;  // ← Campo de descripción agregado
    price?: number;
    date?: string;
  };
}

interface MyContext extends Context {
  session?: SessionData;
}

// ============================================
// INICIALIZAR SERVICIOS
// ============================================
const lotteryService = new LotteryService();
const ticketService = new TicketService();
const purchaseService = new PurchaseService();
const statsService = new StatisticsService();
const lightningService = new LightningService();

// ============================================
// INICIALIZAR BOT
// ============================================
const bot = new Telegraf<MyContext>(config.telegram.botToken);
bot.use(session());

// ============================================
// COMANDOS PRINCIPALES
// ============================================

// /start
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

// /admin
bot.command('admin', isAdmin, async (ctx) => {
  await ctx.reply(
    '🔐 *Panel de Administrador*\n\nSelecciona una opción:',
    {
      parse_mode: 'Markdown',
      reply_markup: adminMainKeyboard,
    }
  );
});

// /lottery - ACTUALIZADO CON DESCRIPCIÓN
bot.command('lottery', async (ctx) => {
  const lottery = await lotteryService.getActiveLottery();

  if (!lottery) {
    return ctx.reply('❌ No hay ninguna lotería activa en este momento.');
  }

  const stats = await statsService.getLotteryStats(lottery.id);
  const drawDate = new Date(lottery.drawDate).toLocaleDateString('es-CO');

  let message = `🎰 *${lottery.name}*\n\n`;
  
  // ← Mostrar descripción si existe
  if (lottery.description) {
    message += `📋 ${lottery.description}\n\n`;
  }
  
  message += `💰 Precio por número: ${formatSats(lottery.ticketPrice)} sats\n` +
    `📅 Fecha del sorteo: ${drawDate} a las ${lottery.drawTime}\n\n` +
    `📊 *Estadísticas:*\n` +
    `✅ Vendidos: ${stats.soldTickets}/100 (${stats.percentageSold.toFixed(1)}%)\n` +
    `🟩 Disponibles: ${stats.availableTickets}\n` +
    `💵 Total recaudado: ${formatSats(stats.totalRevenue)} sats\n\n` +
    `Selecciona un número disponible (🟩) para comprarlo:`;

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: createTicketsKeyboard(stats.availableNumbers, stats.soldNumbers),
  });
});

// /mytickets
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
// CALLBACK HANDLERS - ADMINISTRADOR
// ============================================

bot.action('admin_create', isAdmin, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session = { awaitingLotteryData: { step: 'name' } };
  await ctx.reply('📝 Por favor, ingresa el nombre de la lotería:');
});

// admin_stats - ACTUALIZADO CON DESCRIPCIÓN
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
  
  // ← Mostrar descripción si existe
  if (lottery.description) {
    message += `📋 ${lottery.description}\n\n`;
  }
  
  message += `📅 Sorteo: ${drawDate} a las ${lottery.drawTime}\n`;
  message += `💰 Precio: ${formatSats(lottery.ticketPrice)} sats\n\n`;
  message += `✅ Vendidos: ${stats.soldTickets}/100 (${stats.percentageSold.toFixed(1)}%)\n`;
  message += `🟩 Disponibles: ${stats.availableTickets}\n`;
  message += `💵 Total: ${formatSats(stats.totalRevenue)} sats\n\n`;
  message += `🎯 *Números vendidos:*\n`;
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

bot.action('admin_winner', isAdmin, async (ctx) => {
  await ctx.answerCbQuery();
  
  const lottery = await lotteryService.getActiveLottery();
  if (!lottery) {
    return ctx.reply('❌ No hay ninguna lotería activa.');
  }

  const winningNumber = await lotteryService.selectWinner(lottery.id);
  
  if (winningNumber === null) {
    return ctx.reply('❌ No se puede seleccionar un ganador porque no hay números vendidos.');
  }

  const purchases = await purchaseService.getPurchasesByLottery(lottery.id);
  const winner = purchases.find(p => p.ticketNumber === winningNumber);

  if (!winner) {
    return ctx.reply('❌ Error al encontrar el ganador.');
  }

  const stats = await statsService.getLotteryStats(lottery.id);

  let message = `🏆 *¡Ganador Seleccionado!*\n\n`;
  message += `🎯 Número ganador: *${formatNumber(winningNumber)}*\n\n`;
  message += `👤 Ganador: @${winner.telegramUsername}\n`;
  message += `⚡ Dirección LN: ${winner.lightningAddress}\n`;
  message += `💰 Premio: ${formatSats(stats.totalRevenue)} sats\n\n`;
  message += `Envía el premio manualmente a la dirección Lightning del ganador.`;

  await ctx.reply(message, { parse_mode: 'Markdown' });

  try {
    await bot.telegram.sendMessage(
      winner.telegramUserId,
      `🎉 *¡FELICIDADES!* 🎉\n\n` +
      `Has ganado la lotería "${lottery.name}"!\n\n` +
      `🎯 Tu número ganador: *${formatNumber(winningNumber)}*\n` +
      `💰 Premio: ${formatSats(stats.totalRevenue)} sats\n\n` +
      `El premio será enviado a tu dirección Lightning:\n${winner.lightningAddress}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Could not notify winner', { error });
  }
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
// CALLBACK HANDLERS - USUARIOS
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
// MESSAGE HANDLERS - FLUJO ACTUALIZADO CON DESCRIPCIÓN
// ============================================

bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  
  if (!ctx.from?.id) {
    return ctx.reply('Error al procesar tu solicitud.');
  }

  // Handle lottery creation flow - ACTUALIZADO
  if (ctx.session?.awaitingLotteryData) {
    const data = ctx.session.awaitingLotteryData;
    
    if (data.step === 'name') {
      data.name = text;
      data.step = 'description';  // ← Cambiado a description
      await ctx.reply(
        '📝 Ahora ingresa una descripción de la rifa:\n\n' +
        'Puedes incluir información sobre el premio, fecha de entrega, forma de contacto, etc.\n\n' +
        'Ejemplo: "Sorteo de una bicicleta nueva marca X modelo Y. El ganador será contactado por WhatsApp el mismo día del sorteo."'
      );
    } else if (data.step === 'description') {  // ← NUEVO PASO
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
      await ctx.reply('📅 Ingresa la fecha del sorteo (formato: YYYY-MM-DD):\n\nEjemplo: 2025-12-31');
    } else if (data.step === 'date') {
      data.date = text;
      data.step = 'time';
      await ctx.reply('🕐 Ingresa la hora del sorteo (formato: HH:MM):\n\nEjemplo: 20:00');
    } else if (data.step === 'time') {
      try {
        logger.info('Creating lottery with params', {
          name: data.name,
          description: data.description,  // ← Log de descripción
          price: data.price,
          date: data.date,
          time: text,
          adminId: ctx.from.id
        });

        // ← Llamada actualizada con descripción
        const lottery = await lotteryService.createLottery(
          data.name!,
          data.description,  // ← Parámetro de descripción
          data.price!,
          new Date(data.date!),
          text,
          ctx.from.id
        );

        ctx.session = {};
        
        // ← Mensaje actualizado mostrando descripción
        let successMessage = `✅ *Lotería creada exitosamente!*\n\n` +
          `📝 Nombre: ${lottery.name}\n`;
        
        if (lottery.description) {
          successMessage += `📋 Descripción: ${lottery.description}\n`;
        }
        
        successMessage += `💰 Precio: ${formatSats(lottery.ticketPrice)} sats\n` +
          `📅 Sorteo: ${new Date(lottery.drawDate).toLocaleDateString('es-CO')} a las ${lottery.drawTime}`;
        
        await ctx.reply(successMessage, { parse_mode: 'Markdown' });
      } catch (error: any) {
        logger.error('Failed to create lottery', { 
          error: error.message,
          stack: error.stack,
          data 
        });
        
        ctx.session = {};
        
        await ctx.reply(
          '❌ Error creando la lotería.\n\n' +
          `Detalle: ${error.message}\n\n` +
          'Por favor verifica los datos e intenta nuevamente.'
        );
      }
    }
    return;
  }

  // Handle Lightning address input
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
            `⏱️ Esta factura expira en ${config.invoice.expiryMinutes} minutos.\n\n` +
            `Una vez pagada, tu número quedará registrado automáticamente.`,
          parse_mode: 'Markdown',
        }
      );

      ctx.session = {};

      checkPaymentStatus(paymentHash, lotteryId, ticketNumber, ctx.from.id, lottery);
    } catch (error) {
      logger.error('Error creating invoice', { error });
      await ctx.reply('❌ Error generando la factura. Por favor intenta nuevamente.');
      ctx.session = {};
    }
  }
});

// ============================================
// PAYMENT VERIFICATION
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
          `Gracias por participar.\n\n` +
          `Su número es: *${formatNumber(ticketNumber)}*\n\n` +
          `Recuerde que la lotería juega el ${drawDate} a las ${lottery.drawTime}.\n\n` +
          `Si usted es el ganador, le enviaremos el premio a la dirección Lightning que ingresó.`,
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
// ERROR HANDLER
// ============================================

bot.catch((err: any, ctx: MyContext) => {
  logger.error('Bot error', { error: err, userId: ctx.from?.id });
  ctx.reply('❌ Ocurrió un error. Por favor intenta nuevamente.');
});

// ============================================
// START BOT
// ============================================

bot.launch()
  .then(() => {
    logger.info('Bot started successfully');
    console.log('🤖 Bot de lotería Lightning iniciado');
  })
  .catch((error) => {
    logger.error('Failed to start bot', { error });
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));