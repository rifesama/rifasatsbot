import winston from 'winston';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // Límite de tamaño: sin él, combined.log crecía sin parar (~1 GB en la VPS).
    // La salida completa sigue en el journal vía Console (journalctl -u rifasats).
    new winston.transports.File({
      filename: 'error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10 MB por archivo
      maxFiles: 3,
      tailable: true,
    }),
    new winston.transports.File({
      filename: 'combined.log',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 3,
      tailable: true,
    }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});