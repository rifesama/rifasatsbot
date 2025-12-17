import { z } from 'zod';

export const lightningAddressSchema = z.string()
  .regex(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Dirección Lightning inválida');

export function validateLightningAddress(address: string): boolean {
  try {
    lightningAddressSchema.parse(address);
    return true;
  } catch {
    return false;
  }
}

export function formatNumber(num: number): string {
  return num.toString().padStart(2, '0');
}

export function formatSats(sats: number): string {
  return new Intl.NumberFormat('es-CO').format(sats);
}