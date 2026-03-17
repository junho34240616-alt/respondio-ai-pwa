ALTER TABLE store_platform_connections ADD COLUMN auth_mode TEXT DEFAULT 'credentials' CHECK(auth_mode IN ('credentials','direct_session'));
ALTER TABLE store_platform_connections ADD COLUMN session_status TEXT DEFAULT 'inactive' CHECK(session_status IN ('inactive','pending','connected','expired','error'));
ALTER TABLE store_platform_connections ADD COLUMN session_connected_at DATETIME;
ALTER TABLE store_platform_connections ADD COLUMN session_last_validated_at DATETIME;
