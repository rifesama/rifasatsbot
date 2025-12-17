import axios from 'axios';
import { config } from '../config/bot.config';
import { logger } from '../utils/logger';

export class LightningService {
  private baseUrl: string;
  private adminKey: string;
  private invoiceReadKey: string;

  constructor() {
    this.baseUrl = config.lightning.lnbitsUrl;
    this.adminKey = config.lightning.adminKey;
    this.invoiceReadKey = config.lightning.invoiceReadKey;
  }

  async createInvoice(amountSats: number, memo: string): Promise<{ paymentHash: string; paymentRequest: string }> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/v1/payments`,
        {
          out: false,
          amount: amountSats,
          memo: memo,
          expiry: config.invoice.expiryMinutes * 60,
        },
        {
          headers: {
            'X-Api-Key': this.adminKey,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info('Invoice created', { paymentHash: response.data.payment_hash });

      return {
        paymentHash: response.data.payment_hash,
        paymentRequest: response.data.payment_request,
      };
    } catch (error) {
      logger.error('Error creating invoice', { error });
      throw new Error('Error creando factura Lightning');
    }
  }

  async checkInvoiceStatus(paymentHash: string): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/v1/payments/${paymentHash}`,
        {
          headers: {
            'X-Api-Key': this.invoiceReadKey,
          },
        }
      );

      return response.data.paid === true;
    } catch (error) {
      logger.error('Error checking invoice status', { error, paymentHash });
      return false;
    }
  }

  async sendPayment(lightningAddress: string, amountSats: number): Promise<boolean> {
    try {
      const [username, domain] = lightningAddress.split('@');
      
      const lnurlResponse = await axios.get(
        `https://${domain}/.well-known/lnurlp/${username}`
      );

      const callbackUrl = lnurlResponse.data.callback;
      const minSendable = lnurlResponse.data.minSendable / 1000;
      const maxSendable = lnurlResponse.data.maxSendable / 1000;

      if (amountSats < minSendable || amountSats > maxSendable) {
        throw new Error('Monto fuera del rango permitido');
      }

      const invoiceResponse = await axios.get(
        `${callbackUrl}?amount=${amountSats * 1000}`
      );

      const invoice = invoiceResponse.data.pr;

      // CORRECCIÓN: Eliminar 'const' ya que no se usa después
      await axios.post(
        `${this.baseUrl}/api/v1/payments`,
        {
          out: true,
          bolt11: invoice,
        },
        {
          headers: {
            'X-Api-Key': this.adminKey,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info('Payment sent', { lightningAddress, amountSats });
      return true;
    } catch (error) {
      logger.error('Error sending payment', { error, lightningAddress });
      throw new Error('Error enviando pago Lightning');
    }
  }
}