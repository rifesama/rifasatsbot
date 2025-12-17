import { Context, MiddlewareFn } from 'telegraf';
import { config } from '../../config/bot.config';

export const isAdmin: MiddlewareFn<Context> = (ctx, next) => {
  const userId = ctx.from?.id;
  
  if (!userId || !config.telegram.adminIds.includes(userId)) {
    return ctx.reply('❌ No tienes permisos de administrador.');
  }
  
  return next();
};
