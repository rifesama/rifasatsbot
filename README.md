# RifaSats

Bot de rifas/loterías P2P con pagos en Bitcoin vía Lightning Network, operado a través de Telegram.

## Características

- **100 números por rifa** (del 00 al 99)
- **Pagos en sats** vía Lightning Network (LNbits)
- **Comisión configurable** por rifa (porcentaje de administración)
- **Bote acumulado**: si el número ganador no fue vendido, los fondos pasan a la siguiente rifa
- **QR automático** con la factura Lightning al comprar
- **Verificación de pago** automática en tiempo real
- **Ganador aleatorio o manual** (basado en lotería externa)
- **Notificación automática** al ganador vía Telegram

## Comandos

### Usuarios
| Comando | Descripción |
|---------|-------------|
| `/start` | Bienvenida e información |
| `/lottery` | Ver rifa activa y comprar número |
| `/mytickets` | Ver mis números comprados |

### Administrador
| Comando | Descripción |
|---------|-------------|
| `/admin` | Panel de administración |

**Desde el panel de admin:**
- **Crear rifa** — nombre, descripción, precio, fecha, hora y comisión
- **Ver estadísticas** — números vendidos, recaudado, distribución de fondos
- **Seleccionar ganador aleatorio** — el bot elige entre los números vendidos
- **Seleccionar ganador manual** — el admin ingresa el número ganador (ej. últimas cifras de lotería externa)
- **Cerrar rifa**

## Flujo de compra

1. Usuario ejecuta `/lottery`
2. Selecciona un número disponible (🟩)
3. Ingresa su Lightning Address (ej. `usuario@colsats.com`)
4. Recibe factura Lightning + QR
5. Paga desde su wallet Lightning
6. Bot confirma el pago y reserva el número

## Distribución de fondos

Al seleccionar ganador:
- **Con ganador**: `(100 - comisión)%` para el ganador, `comisión%` para el admin
- **Sin ganador**: `(100 - comisión)%` se acumula para la próxima rifa, `comisión%` para el admin

## Instalación

### Requisitos

- Node.js 18+
- PostgreSQL 14+
- Cuenta en LNbits con wallet activa
- Bot de Telegram (via [@BotFather](https://t.me/BotFather))

### 1. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/rifasats.git
cd rifasats
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

```env
BOT_TOKEN=tu_token_de_telegram
ADMIN_TELEGRAM_IDS=tu_id_de_telegram

DATABASE_URL=postgresql://lottery_user:contraseña@localhost:5432/lottery_bot

LNBITS_URL=https://tu-instancia-lnbits.com
LNBITS_ADMIN_KEY=tu_admin_key
LNBITS_INVOICE_READ_KEY=tu_invoice_read_key

NODE_ENV=production
INVOICE_EXPIRY_MINUTES=15
```

### 4. Crear la base de datos

```bash
sudo -u postgres psql

CREATE USER lottery_user WITH PASSWORD 'contraseña_segura';
CREATE DATABASE lottery_bot OWNER lottery_user;
GRANT ALL PRIVILEGES ON DATABASE lottery_bot TO lottery_user;
\q
```

```bash
psql -U lottery_user -d lottery_bot -f setup.sql
```

### 5. Compilar y ejecutar

```bash
# Compilar TypeScript
npm run build

# Iniciar
npm start
```

**Modo desarrollo** (reinicio automático al cambiar código):
```bash
npm run dev
```

## Despliegue en producción (VPS)

### Crear servicio systemd

```bash
sudo nano /etc/systemd/system/rifasats.service
```

```ini
[Unit]
Description=RifaSats
After=network.target postgresql.service

[Service]
User=tu_usuario
WorkingDirectory=/home/tu_usuario/rifasats
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
EnvironmentFile=/home/tu_usuario/rifasats/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable rifasats
sudo systemctl start rifasats
```

### Ver logs

```bash
sudo journalctl -u rifasats -f
```

### Actualizar desde GitHub

```bash
cd /home/tu_usuario/rifasats
git pull
npm run build
sudo systemctl restart rifasats
```

## Estructura del proyecto

```
rifasats/
├── src/
│   ├── index.ts              # Punto de entrada, handlers del bot
│   ├── config/               # Configuración (bot, LNbits)
│   ├── database/             # Conexión a PostgreSQL
│   ├── services/             # Lógica de negocio
│   │   ├── lotteryService.ts
│   │   ├── ticketService.ts
│   │   ├── purchaseService.ts
│   │   ├── lightningService.ts
│   │   └── statisticsService.ts
│   ├── bot/
│   │   ├── keyboards/        # Teclados inline
│   │   └── middlewares/      # Autenticación de admin
│   ├── types/                # Tipos TypeScript
│   └── utils/                # Validadores, QR, logger
├── setup.sql                 # Script de inicialización de BD
├── package.json
└── tsconfig.json
```

## Stack técnico

- **Runtime**: Node.js + TypeScript
- **Bot**: Telegraf 4.x
- **Base de datos**: PostgreSQL + pg
- **Pagos Lightning**: LNbits API
- **Scheduler**: node-cron
- **Logs**: Winston
