#!/bin/bash

# Script de instalación del Sistema de Porcentaje Configurable
# Uso: bash install-percentage-system.sh

echo "💼 Instalación del Sistema de Porcentaje Configurable"
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
backup_dir="backup_percentage_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$backup_dir"
cp -r src "$backup_dir/"
echo -e "${GREEN}✅ Backup: $backup_dir${NC}"
echo ""

# Paso 1: Migración de base de datos
echo -e "${YELLOW}📊 Paso 1/5: Actualizando base de datos...${NC}"

cat > migration_admin_fee_percentage.sql << 'EOF'
BEGIN;

ALTER TABLE lotteries 
ADD COLUMN IF NOT EXISTS admin_fee_percentage INTEGER DEFAULT 10 
CHECK (admin_fee_percentage >= 0 AND admin_fee_percentage <= 100);

COMMENT ON COLUMN lotteries.admin_fee_percentage IS 
'Porcentaje de comisión de administración (0-100). Se aplica tanto cuando hay ganador como cuando no hay ganador';

UPDATE lotteries 
SET admin_fee_percentage = 10 
WHERE admin_fee_percentage IS NULL;

COMMIT;
EOF

source .env

DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

export PGPASSWORD="$DB_PASS"

if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f migration_admin_fee_percentage.sql > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Base de datos actualizada${NC}"
else
  echo -e "${RED}❌ Error actualizando base de datos${NC}"
  echo -e "${YELLOW}Intenta manualmente: psql \$DATABASE_URL -f migration_admin_fee_percentage.sql${NC}"
  exit 1
fi

# Verificar columna
COLUMN_EXISTS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'lotteries' AND column_name = 'admin_fee_percentage';" | xargs)

if [ "$COLUMN_EXISTS" = "1" ]; then
  echo -e "${GREEN}✅ Columna 'admin_fee_percentage' agregada${NC}"
else
  echo -e "${YELLOW}⚠️  Columna puede no haberse agregado${NC}"
fi

unset PGPASSWORD
echo ""

# Pasos 2-5: Solicitar archivos
echo -e "${YELLOW}📝 Pasos 2-5: Actualizar archivos TypeScript${NC}"
echo ""
echo -e "${BLUE}Copia los siguientes archivos de los artifacts:${NC}"
echo ""
echo -e "${YELLOW}1. src/types/index.ts${NC}"
echo "   Artifact: 'src/types/index.ts - Con Porcentaje Configurable'"
echo ""
echo -e "${YELLOW}2. src/utils/mappers.ts${NC}"
echo "   Artifact: 'src/utils/mappers.ts - Con Porcentaje'"
echo ""
echo -e "${YELLOW}3. src/services/lotteryService.ts${NC}"
echo "   Artifact: 'src/services/lotteryService.ts - Con Porcentaje Configurable'"
echo ""
echo -e "${YELLOW}4. src/index.ts${NC}"
echo "   Artifact: 'src/index.ts - Con Porcentaje Configurable COMPLETO'"
echo ""

read -p "¿Ya copiaste todos los archivos? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}Por favor copia los archivos y ejecuta de nuevo${NC}"
  exit 0
fi

# Compilar
echo ""
echo -e "${YELLOW}🏗️  Compilando...${NC}"
npm run build

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Compilación exitosa${NC}"
else
  echo -e "${RED}❌ Error en compilación${NC}"
  echo ""
  echo -e "${YELLOW}Revisa los errores y verifica que copiaste todos los archivos${NC}"
  exit 1
fi

# Verificación
echo ""
echo -e "${YELLOW}🔍 Verificando...${NC}"

files_ok=true

if ! grep -q "adminFeePercentage" src/types/index.ts; then
  echo -e "${RED}❌ Falta 'adminFeePercentage' en types${NC}"
  files_ok=false
fi

if ! grep -q "admin_fee_percentage" src/utils/mappers.ts; then
  echo -e "${RED}❌ Falta 'admin_fee_percentage' en mappers${NC}"
  files_ok=false
fi

if ! grep -q "adminFeePercentage: number" src/services/lotteryService.ts; then
  echo -e "${RED}❌ Falta parámetro en lotteryService${NC}"
  files_ok=false
fi

if ! grep -q "'percentage'" src/index.ts; then
  echo -e "${RED}❌ Falta step 'percentage' en index${NC}"
  files_ok=false
fi

if [ "$files_ok" = true ]; then
  echo -e "${GREEN}✅ Todos los archivos verificados${NC}"
else
  echo -e "${YELLOW}⚠️  Algunos archivos pueden estar incompletos${NC}"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✨ Sistema de Porcentaje Instalado ✨${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}📋 Características:${NC}"
echo "  ✓ Porcentaje configurable por lotería (0-100%)"
echo "  ✓ Se aplica SIEMPRE (con/sin ganador)"
echo "  ✓ Con ganador: Ganador (100-%)%, Admin %"
echo "  ✓ Sin ganador: Bote (100-%)%, Admin %"
echo ""
echo -e "${YELLOW}🚀 Para iniciar:${NC}"
echo "   npm run dev"
echo ""
echo -e "${YELLOW}🧪 Para probar:${NC}"
echo "   1. /admin → Crear Lotería"
echo "   2. Completa hasta el paso de porcentaje"
echo "   3. Ingresa un porcentaje (ej: 10)"
echo "   4. Verifica distribución en resultados"
echo ""
echo -e "${YELLOW}💡 Porcentajes recomendados:${NC}"
echo "   • 5% - Rifas grandes"
echo "   • 10% - Uso estándar"
echo "   • 15% - Rifas pequeñas"
echo ""
echo -e "${YELLOW}📖 Documentación:${NC}"
echo "   Ver artifact: '📖 Guía - Porcentaje Configurable'"
echo ""
echo -e "${YELLOW}💾 Backup: $backup_dir${NC}"
echo ""
