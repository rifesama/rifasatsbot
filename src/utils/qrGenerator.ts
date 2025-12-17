import QRCode from 'qrcode';

export async function generateQRCode(text: string): Promise<Buffer> {
  try {
    return await QRCode.toBuffer(text, {
      errorCorrectionLevel: 'M',
      type: 'png',
      width: 400,
    });
  } catch (error) {
    throw new Error('Error generando código QR');
  }
}