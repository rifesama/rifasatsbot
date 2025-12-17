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
