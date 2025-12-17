-- ============================================
-- setup.sql - Script de configuración inicial
-- ============================================

-- Crear base de datos
CREATE DATABASE lottery_bot;

-- Conectar a la base de datos
\c lottery_bot;

-- Crear extensión para UUID (opcional)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLA: admins
-- ============================================
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  username VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insertar admin inicial (reemplazar con tu ID)
INSERT INTO admins (telegram_id, username) 
VALUES (1255987741, 'tu_usuario')
ON CONFLICT (telegram_id) DO NOTHING;

-- ============================================
-- TABLA: lotteries
-- ============================================
CREATE TABLE IF NOT EXISTS lotteries (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  ticket_price INTEGER NOT NULL CHECK (ticket_price > 0),
  draw_date DATE NOT NULL,
  draw_time TIME NOT NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'completed')),
  created_at TIMESTAMP DEFAULT NOW(),
  created_by BIGINT REFERENCES admins(telegram_id),
  winning_number INTEGER CHECK (winning_number >= 0 AND winning_number <= 99),
  prize_sent BOOLEAN DEFAULT FALSE
);

-- Índices para optimización
CREATE INDEX idx_lotteries_status ON lotteries(status);
CREATE INDEX idx_lotteries_date ON lotteries(draw_date);

-- ============================================
-- TABLA: tickets
-- ============================================
CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  lottery_id INTEGER NOT NULL REFERENCES lotteries(id) ON DELETE CASCADE,
  number INTEGER NOT NULL CHECK (number >= 0 AND number <= 99),
  status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'sold')),
  reserved_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(lottery_id, number)
);

-- Índices para optimización
CREATE INDEX idx_tickets_lottery ON tickets(lottery_id);
CREATE INDEX idx_tickets_status ON tickets(lottery_id, status);
CREATE INDEX idx_tickets_reserved ON tickets(reserved_until) WHERE status = 'reserved';

-- ============================================
-- TABLA: purchases
-- ============================================
CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  lottery_id INTEGER NOT NULL REFERENCES lotteries(id) ON DELETE CASCADE,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  ticket_number INTEGER NOT NULL CHECK (ticket_number >= 0 AND ticket_number <= 99),
  telegram_user_id BIGINT NOT NULL,
  telegram_username VARCHAR(255),
  lightning_address VARCHAR(255) NOT NULL,
  payment_hash VARCHAR(255) UNIQUE NOT NULL,
  invoice TEXT NOT NULL,
  amount_sats INTEGER NOT NULL CHECK (amount_sats > 0),
  purchased_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'refunded')),
  expires_at TIMESTAMP,
  paid_at TIMESTAMP
);

-- Índices para optimización
CREATE INDEX idx_purchases_lottery ON purchases(lottery_id);
CREATE INDEX idx_purchases_user ON purchases(telegram_user_id);
CREATE INDEX idx_purchases_status ON purchases(status);
CREATE INDEX idx_purchases_payment_hash ON purchases(payment_hash);
CREATE INDEX idx_purchases_expires ON purchases(expires_at) WHERE status = 'pending';

-- ============================================
-- TABLA: lottery_history (para auditoría)
-- ============================================
CREATE TABLE IF NOT EXISTS lottery_history (
  id SERIAL PRIMARY KEY,
  lottery_id INTEGER REFERENCES lotteries(id),
  action VARCHAR(50) NOT NULL,
  description TEXT,
  performed_by BIGINT,
  performed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_history_lottery ON lottery_history(lottery_id);

-- ============================================
-- TABLA: notifications (para mensajes pendientes)
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL,
  message TEXT NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  sent_at TIMESTAMP
);

CREATE INDEX idx_notifications_pending ON notifications(sent) WHERE NOT sent;

-- ============================================
-- VISTAS ÚTILES
-- ============================================

-- Vista de estadísticas por lotería
CREATE OR REPLACE VIEW lottery_statistics AS
SELECT 
  l.id,
  l.name,
  l.status,
  l.draw_date,
  l.draw_time,
  l.ticket_price,
  COUNT(t.id) as total_tickets,
  COUNT(CASE WHEN t.status = 'sold' THEN 1 END) as sold_tickets,
  COUNT(CASE WHEN t.status = 'available' THEN 1 END) as available_tickets,
  COUNT(CASE WHEN t.status = 'reserved' THEN 1 END) as reserved_tickets,
  COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount_sats ELSE 0 END), 0) as total_revenue,
  ROUND((COUNT(CASE WHEN t.status = 'sold' THEN 1 END)::NUMERIC / 100) * 100, 2) as percentage_sold
FROM lotteries l
LEFT JOIN tickets t ON l.id = t.lottery_id
LEFT JOIN purchases p ON l.id = p.lottery_id
GROUP BY l.id, l.name, l.status, l.draw_date, l.draw_time, l.ticket_price;

-- Vista de compras detalladas
CREATE OR REPLACE VIEW purchase_details AS
SELECT 
  p.id,
  p.ticket_number,
  p.telegram_user_id,
  p.telegram_username,
  p.lightning_address,
  p.amount_sats,
  p.purchased_at,
  p.status as purchase_status,
  l.id as lottery_id,
  l.name as lottery_name,
  l.draw_date,
  l.draw_time,
  t.status as ticket_status
FROM purchases p
JOIN lotteries l ON p.lottery_id = l.id
JOIN tickets t ON p.ticket_id = t.id
WHERE p.status = 'paid'
ORDER BY p.purchased_at DESC;

-- ============================================
-- FUNCIONES ÚTILES
-- ============================================

-- Función para limpiar reservas expiradas
CREATE OR REPLACE FUNCTION cleanup_expired_reservations()
RETURNS INTEGER AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE tickets
  SET status = 'available', reserved_until = NULL
  WHERE status = 'reserved' AND reserved_until < NOW();
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$$ LANGUAGE plpgsql;

-- Función para marcar facturas expiradas
CREATE OR REPLACE FUNCTION mark_expired_invoices()
RETURNS INTEGER AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE purchases
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at < NOW();
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener números disponibles
CREATE OR REPLACE FUNCTION get_available_numbers(lottery_id_param INTEGER)
RETURNS TABLE(number INTEGER) AS $$
BEGIN
  -- Primero limpiar reservas expiradas
  PERFORM cleanup_expired_reservations();
  
  -- Retornar números disponibles
  RETURN QUERY
  SELECT t.number
  FROM tickets t
  WHERE t.lottery_id = lottery_id_param AND t.status = 'available'
  ORDER BY t.number;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger para registrar cambios en lotteries
CREATE OR REPLACE FUNCTION log_lottery_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO lottery_history (lottery_id, action, description)
    VALUES (NEW.id, 'CREATE', 'Lotería creada: ' || NEW.name);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != NEW.status THEN
      INSERT INTO lottery_history (lottery_id, action, description)
      VALUES (NEW.id, 'STATUS_CHANGE', 
              'Estado cambiado de ' || OLD.status || ' a ' || NEW.status);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lottery_changes_trigger
AFTER INSERT OR UPDATE ON lotteries
FOR EACH ROW EXECUTE FUNCTION log_lottery_changes();

-- Trigger para actualizar paid_at cuando se marca como pagado
CREATE OR REPLACE FUNCTION update_paid_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    NEW.paid_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER purchase_paid_trigger
BEFORE UPDATE ON purchases
FOR EACH ROW EXECUTE FUNCTION update_paid_at();

-- ============================================
-- POLÍTICAS DE LIMPIEZA (opcional)
-- ============================================

-- Eliminar compras expiradas después de 30 días
CREATE OR REPLACE FUNCTION cleanup_old_expired_purchases()
RETURNS INTEGER AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  DELETE FROM purchases
  WHERE status = 'expired' 
  AND expires_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- CONSULTAS ÚTILES PARA ADMINISTRACIÓN
-- ============================================

-- Ver estadísticas de todas las loterías
-- SELECT * FROM lottery_statistics ORDER BY created_at DESC;

-- Ver todas las compras pagadas
-- SELECT * FROM purchase_details ORDER BY purchased_at DESC;

-- Limpiar reservas expiradas manualmente
-- SELECT cleanup_expired_reservations();

-- Ver números disponibles de una lotería
-- SELECT * FROM get_available_numbers(1);

-- Ver historial de una lotería
-- SELECT * FROM lottery_history WHERE lottery_id = 1 ORDER BY performed_at DESC;

-- ============================================
-- GRANTS (si usas un usuario específico)
-- ============================================

-- Crear usuario para la aplicación (opcional)
-- CREATE USER lottery_app WITH PASSWORD 'secure_password';
-- GRANT CONNECT ON DATABASE lottery_bot TO lottery_app;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO lottery_app;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO lottery_app;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO lottery_app;
