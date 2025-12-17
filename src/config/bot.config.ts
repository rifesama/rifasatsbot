import dotenv from 'dotenv';
dotenv.config();

export const config = {
  telegram: {
    botToken: process.env.BOT_TOKEN!,
    adminIds: process.env.ADMIN_TELEGRAM_IDS!.split(',').map(id => parseInt(id)),
  },
  database: {
    url: process.env.DATABASE_URL!,
  },
  lightning: {
    lnbitsUrl: process.env.LNBITS_URL!,
    adminKey: process.env.LNBITS_ADMIN_KEY!,
    invoiceReadKey: process.env.LNBITS_INVOICE_READ_KEY!,
  },
  invoice: {
    expiryMinutes: parseInt(process.env.INVOICE_EXPIRY_MINUTES || '15'),
  },
};