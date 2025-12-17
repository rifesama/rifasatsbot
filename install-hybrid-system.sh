#!/bin/bash

# Script de instalación del Sistema Híbrido de Selección de Ganador
# Uso: bash install-hybrid-system.sh

echo "🎯 Instalación del Sistema Híbrido de Selección"
echo ""

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Verificar entorno
if [ ! -f ".env" ]; then
  echo -e "${RED}❌ No se encontró archivo .env${NC}"
  exit 1
fi

if [ ! -f "package.json" ]; then
  echo -e "${RED}❌ No se encontró package.json${NC}"
  exit 1
fi

# Crear backup
echo -e "${YELLOW}💾 Creando backup...${NC}"
backup_dir="backup_hybrid_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$backup_dir"
cp -r src "$backup_dir/"
echo -e "${GREEN}✅ Backup creado: $backup_dir${NC}"
echo ""

# Paso 1: Migración de base de datos
echo -e "${YELLOW}📊 Paso 1/6: Actualizando base de datos...${NC}"

cat > migration_hybrid_winner_system.sql << 'EOF'
BEGIN;

ALTER TABLE lotteries ADD COLUMN IF NOT EXISTS winning_number INTEGER CHECK (winning_number >= 0 AND winning_number <= 99);
ALTER TABLE lotteries ADD COLUMN IF NOT EXISTS selection_method VARCHAR(20) CHECK (selection_method IN ('random', 'manual', NULL));
ALTER TABLE lotteries ADD COLUMN IF NOT EXISTS accumulated_funds INTEGER DEFAULT 0 CHECK (accumulated_funds >= 0);
ALTER TABLE lotteries ADD COLUMN IF NOT EXISTS admin_fee INTEGER DEFAULT 0 CHECK (admin_fee >= 0);
ALTER TABLE lotteries ADD COLUMN IF NOT EXISTS winner_telegram_id BIGINT;
ALTER TABLE lotteries ADD COLUMN IF NOT EXISTS winner_notified_at TIMESTAMP;
ALTER TABLE lotteries ADD COLUMN IF NOT EXISTS all_participants_notified BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_lotteries_winning_number ON lotteries(winning_number);
CREATE INDEX IF NOT EXISTS idx_lotteries_winner_telegram_id ON lotteries(winner_telegram_id);

COMMIT;
EOF

source .env

DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

export PGPASSWORD="$DB_PASS"

if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f migration_hybrid_winner_system.sql > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Base de datos actualizada${NC}"
else
  echo -e "${RED}❌ Error actualizando base de datos${NC}"
  echo -e "${YELLOW}Intenta manualmente: psql \$DATABASE_URL -f migration_hybrid_winner_system.sql${NC}"
  exit 1
fi

# Verificar columnas
COLUMNS_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'lotteries' AND column_name IN ('winning_number', 'selection_method', 'accumulated_funds', 'admin_fee', 'winner_telegram_id');" | xargs)

if [ "$COLUMNS_COUNT" = "5" ]; then
  echo -e "${GREEN}✅ Todas las columnas agregadas correctamente${NC}"
else
  echo -e "${YELLOW}⚠️  Algunas columnas pueden no haberse agregado${NC}"
fi

unset PGPASSWORD
echo ""

# Paso 2-6: Solicitar archivos
echo -e "${YELLOW}📝 Pasos 2-6: Actualizar archivos TypeScript${NC}"
echo ""
echo -e "${BLUE}Ahora debes copiar manualmente los siguientes archivos de los artifacts:${NC}"
echo ""
echo -e "${YELLOW}1. src/types/index.ts${NC}"
echo "   Artifact: 'src/types/index.ts - Con Sistema Híbrido'"
echo ""
echo -e "${YELLOW}2. src/utils/mappers.ts${NC}"
echo "   Artifact: 'src/utils/mappers.ts - Con Sistema Híbrido'"
echo ""
echo -e "${YELLOW}3. src/services/lotteryService.ts${NC}"
echo "   Artifact: 'src/services/lotteryService.ts - Sistema Híbrido COMPLETO'"
echo ""
echo -e "${YELLOW}4. src/bot/keyboards/ticketsKeyboard.ts${NC}"
echo "   Artifact: 'src/bot/keyboards/ticketsKeyboard.ts - Con Opciones Híbridas'"
echo ""
echo -e "${YELLOW}5. src/index.ts${NC}"
echo "   Artifact: 'src/index.ts - SISTEMA HÍBRIDO COMPLETO'"
echo ""

read -p "¿Ya copiaste todos los archivos? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}Por favor copia los archivos de los artifacts y ejecuta de nuevo${NC}"
  exit 0
fi

# Compilar
echo ""
echo -e "${YELLOW}🏗️  Compilando proyecto...${NC}"
npm run build

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Compilación exitosa${NC}"
else
  echo -e "${RED}❌ Error en compilación${NC}"
  echo ""
  echo -e "${YELLOW}Revisa los errores y asegúrate de haber copiado todos los archivos correctamente${NC}"
  exit 1
fi

# Verificación final
echo ""
echo -e "${YELLOW}🔍 Verificando implementación...${NC}"

files_ok=true

# Verificar que existan las nuevas propiedades
if ! grep -q "winningNumber" src/types/index.ts; then
  echo -e "${RED}❌ Falta 'winningNumber' en types/index.ts${NC}"
  files_ok=false
fi

if ! grep -q "selectWinnerRandom" src/services/lotteryService.ts; then
  echo -e "${RED}❌ Falta 'selectWinnerRandom' en lotteryService.ts${NC}"
  files_ok=false
fi

if ! grep -q "admin_winner_random" src/bot/keyboards/ticketsKeyboard.ts; then
  echo -e "${RED}❌ Falta botón 'admin_winner_random' en keyboard${NC}"
  files_ok=false
fi

if ! grep -q "awaitingWinningNumber" src/index.ts; then
  echo -e "${RED}❌ Falta 'awaitingWinningNumber' en index.ts${NC}"
  files_ok=false
fi

if [ "$files_ok" = true ]; then
  echo -e "${GREEN}✅ Todos los archivos verificados${NC}"
else
  echo -e "${YELLOW}⚠️  Algunos archivos pueden estar incompletos${NC}"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✨ Sistema Híbrido Instalado ✨${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}📋 Características instaladas:${NC}"
echo "  ✓ Selección aleatoria de ganador"
echo "  ✓ Selección manual de ganador"
echo "  ✓ Sistema de acumulación 80/20"
echo "  ✓ Notificación a participantes"
echo "  ✓ Fondos acumulados en nuevas rifas"
echo ""
echo -e "${YELLOW}🚀 Para iniciar el bot:${NC}"
echo "   npm run dev"
echo ""
echo -e "${YELLOW}🧪 Para probar:${NC}"
echo "   1. Envía /admin"
echo "   2. Verás dos botones:"
echo "      - 🎲 Selección Aleatoria"
echo "      - ✍️ Selección Manual"
echo ""
echo -e "${YELLOW}📖 Documentación completa:${NC}"
echo "   Ver artifact: '📖 Guía Completa - Sistema Híbrido'"
echo ""
echo -e "${YELLOW}💾 Backup disponible en: $backup_dir${NC}"
echo ""
