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
