import winston from 'winston';

// Resume un error para el log. Los errores de axios traen `config.headers`
// con la X-Api-Key de LNbits: nunca deben llegar enteros al log.
function summarizeError(e: any): unknown {
  if (!e || typeof e !== 'object') return e;
  if (e.isAxiosError) {
    const data = e.response?.data;
    return {
      message: e.message,
      code: e.code,
      status: e.response?.status,
      method: e.config?.method,
      url: e.config?.url,
      data: data === undefined ? undefined : JSON.stringify(data).slice(0, 500),
    };
  }
  if (e instanceof Error) {
    return { name: e.name, message: e.message, stack: e.stack };
  }
  return e;
}

const sanitizeErrors = winston.format((info) => {
  for (const key of ['error', 'err']) {
    if (key in info) info[key] = summarizeError(info[key]);
  }
  return info;
});

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    sanitizeErrors(),
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
