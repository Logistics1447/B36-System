-- ========================================
-- B36 System Database Schema
-- نظام إدارة القاعات اللوجستية
-- Supabase (PostgreSQL)
-- ========================================

-- تفعيل الملحقات
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- 1. جدول المستخدمين (Users)
-- ========================================
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL, -- في الإنتاج، استخدم bcrypt
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'STAFF' CHECK (role IN ('ADMIN', 'STAFF', 'VIEWER')),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- إنشاء مستخدم admin افتراضي
INSERT INTO users (username, password, full_name, role)
VALUES ('admin', '1234', 'مدير النظام', 'ADMIN')
ON CONFLICT (username) DO NOTHING;

-- فهرس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ========================================
-- 2. جدول القاعات (Halls)
-- ========================================
CREATE TABLE IF NOT EXISTS halls (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) DEFAULT 'MAIN' CHECK (type IN ('MAIN', 'WAITING', 'INTERVIEW', 'NORMAL')),
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    current INTEGER DEFAULT 0 CHECK (current >= 0),
    status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PAUSED', 'CLOSED')),
    color VARCHAR(7), -- hex color code
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT check_current_capacity CHECK (current <= capacity)
);

-- إنشاء قاعات افتراضية
INSERT INTO halls (name, type, capacity, current, status, active)
VALUES 
    ('قاعة الانتظار الرئيسية', 'WAITING', 100, 0, 'OPEN', TRUE),
    ('قاعة المقابلات 1', 'INTERVIEW', 50, 0, 'OPEN', TRUE),
    ('قاعة المقابلات 2', 'INTERVIEW', 50, 0, 'OPEN', TRUE),
    ('القاعة الرئيسية', 'MAIN', 200, 0, 'OPEN', TRUE),
    ('قاعة الخدمات', 'NORMAL', 75, 0, 'OPEN', TRUE)
ON CONFLICT DO NOTHING;

-- فهرس للبحث
CREATE INDEX IF NOT EXISTS idx_halls_active ON halls(active);
CREATE INDEX IF NOT EXISTS idx_halls_status ON halls(status);

-- ========================================
-- 3. جدول الإعدادات العامة (Global Settings)
-- ========================================
CREATE TABLE IF NOT EXISTS global_settings (
    id BIGSERIAL PRIMARY KEY,
    outdoor_queue INTEGER DEFAULT 0 CHECK (outdoor_queue >= 0),
    served_count INTEGER DEFAULT 0 CHECK (served_count >= 0),
    system_paused BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- إنشاء سجل افتراضي
INSERT INTO global_settings (outdoor_queue, served_count, system_paused)
VALUES (0, 0, FALSE)
ON CONFLICT DO NOTHING;

-- ========================================
-- 4. جدول سجل النشاطات (Activity Logs)
-- ========================================
CREATE TABLE IF NOT EXISTS activity_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    user VARCHAR(100) NOT NULL, -- اسم المستخدم للحفظ
    action VARCHAR(50) NOT NULL,
    details TEXT,
    hall_id BIGINT REFERENCES halls(id) ON DELETE SET NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON activity_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_user ON activity_logs(user);
CREATE INDEX IF NOT EXISTS idx_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_logs_hall ON activity_logs(hall_id);

-- ========================================
-- 5. جدول البلاغات (Incidents)
-- ========================================
CREATE TABLE IF NOT EXISTS incidents (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    user VARCHAR(100) NOT NULL,
    hall_id BIGINT REFERENCES halls(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    status VARCHAR(20) DEFAULT 'NEW' CHECK (status IN ('NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
    image_url TEXT,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- فهارس
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_priority ON incidents(priority);
CREATE INDEX IF NOT EXISTS idx_incidents_hall ON incidents(hall_id);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at DESC);

-- ========================================
-- 6. جدول طلبات النقل (Transfer Requests)
-- ========================================
CREATE TABLE IF NOT EXISTS transfer_requests (
    id BIGSERIAL PRIMARY KEY,
    from_hall_id BIGINT REFERENCES halls(id) ON DELETE CASCADE,
    to_hall_id BIGINT REFERENCES halls(id) ON DELETE CASCADE,
    requested_by VARCHAR(100) NOT NULL,
    count INTEGER DEFAULT 1 CHECK (count > 0),
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- فهارس
CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfer_requests(status);
CREATE INDEX IF NOT EXISTS idx_transfers_created ON transfer_requests(created_at DESC);

-- ========================================
-- Functions & Triggers
-- ========================================

-- دالة لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- تطبيق Trigger على الجداول
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_halls_updated_at
    BEFORE UPDATE ON halls
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_global_settings_updated_at
    BEFORE UPDATE ON global_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_incidents_updated_at
    BEFORE UPDATE ON incidents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- Views للإحصائيات
-- ========================================

-- عرض إحصائيات القاعات
CREATE OR REPLACE VIEW halls_statistics AS
SELECT 
    h.id,
    h.name,
    h.type,
    h.capacity,
    h.current,
    h.status,
    ROUND((h.current::DECIMAL / NULLIF(h.capacity, 0)) * 100, 2) as occupancy_rate,
    COUNT(DISTINCT al.id) as activity_count,
    COUNT(DISTINCT i.id) as incidents_count
FROM halls h
LEFT JOIN activity_logs al ON h.id = al.hall_id 
    AND al.timestamp >= NOW() - INTERVAL '24 hours'
LEFT JOIN incidents i ON h.id = i.hall_id 
    AND i.status IN ('NEW', 'IN_PROGRESS')
WHERE h.active = TRUE
GROUP BY h.id, h.name, h.type, h.capacity, h.current, h.status;

-- عرض ملخص النظام
CREATE OR REPLACE VIEW system_summary AS
SELECT 
    (SELECT COUNT(*) FROM halls WHERE active = TRUE) as total_halls,
    (SELECT SUM(capacity) FROM halls WHERE active = TRUE) as total_capacity,
    (SELECT SUM(current) FROM halls WHERE active = TRUE) as total_current,
    (SELECT outdoor_queue FROM global_settings LIMIT 1) as outdoor_queue,
    (SELECT served_count FROM global_settings LIMIT 1) as served_count,
    (SELECT COUNT(*) FROM incidents WHERE status IN ('NEW', 'IN_PROGRESS')) as open_incidents,
    ROUND(
        (SELECT SUM(current)::DECIMAL FROM halls WHERE active = TRUE) / 
        NULLIF((SELECT SUM(capacity) FROM halls WHERE active = TRUE), 0) * 100, 
        2
    ) as overall_occupancy_rate;

-- ========================================
-- Row Level Security (RLS) - اختياري
-- ========================================

-- تفعيل RLS على الجداول
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE halls ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

-- سياسات الوصول (يمكن تخصيصها حسب الحاجة)
-- للقراءة: الجميع
CREATE POLICY "Enable read access for all users" ON halls
    FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON activity_logs
    FOR SELECT USING (true);

-- للكتابة: المستخدمون المصادق عليهم فقط
CREATE POLICY "Enable insert for authenticated users" ON activity_logs
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users" ON halls
    FOR UPDATE USING (true);

-- ========================================
-- Sample Data (بيانات تجريبية)
-- ========================================

-- إضافة بعض النشاطات التجريبية
INSERT INTO activity_logs (user, action, details, hall_id)
VALUES 
    ('admin', 'SYSTEM_START', 'بدء تشغيل النظام', NULL),
    ('admin', 'HALL_CREATE', 'إنشاء القاعات الافتراضية', NULL)
ON CONFLICT DO NOTHING;

-- ========================================
-- إحصائيات وصيانة
-- ========================================

-- دالة لحذف السجلات القديمة (أقدم من 6 أشهر)
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM activity_logs 
    WHERE timestamp < NOW() - INTERVAL '6 months';
END;
$$ LANGUAGE plpgsql;

-- جدولة تنفيذ دورية (يمكن تفعيلها باستخدام pg_cron)
-- SELECT cron.schedule('cleanup-old-logs', '0 2 * * 0', 'SELECT cleanup_old_logs()');

-- ========================================
-- تعليقات على الجداول
-- ========================================

COMMENT ON TABLE users IS 'جدول المستخدمين - يحتوي على بيانات الموظفين والمسؤولين';
COMMENT ON TABLE halls IS 'جدول القاعات - يحتوي على معلومات القاعات والسعة';
COMMENT ON TABLE global_settings IS 'جدول الإعدادات العامة - يحتوي على عدادات النظام';
COMMENT ON TABLE activity_logs IS 'جدول سجل النشاطات - يحفظ جميع العمليات';
COMMENT ON TABLE incidents IS 'جدول البلاغات - يحتوي على البلاغات والمشاكل';

-- ========================================
-- اكتمل إنشاء قاعدة البيانات
-- ========================================

-- للتحقق من نجاح الإنشاء، قم بتشغيل:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public';
