-- Sweet & Salty POS · actualización SMTP segura para MySQL/MariaDB
-- Se puede ejecutar más de una vez: cada columna solo se añade si todavía no existe.

SET @db_name = DATABASE();

SET @exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db_name AND table_name = 'pos_settings' AND column_name = 'smtp_host');
SET @sql = IF(@exists = 0, 'ALTER TABLE `pos_settings` ADD `smtp_host` varchar(255) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db_name AND table_name = 'pos_settings' AND column_name = 'smtp_port');
SET @sql = IF(@exists = 0, 'ALTER TABLE `pos_settings` ADD `smtp_port` int NOT NULL DEFAULT 587', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db_name AND table_name = 'pos_settings' AND column_name = 'smtp_secure');
SET @sql = IF(@exists = 0, 'ALTER TABLE `pos_settings` ADD `smtp_secure` boolean NOT NULL DEFAULT false', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db_name AND table_name = 'pos_settings' AND column_name = 'smtp_user');
SET @sql = IF(@exists = 0, 'ALTER TABLE `pos_settings` ADD `smtp_user` varchar(320) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db_name AND table_name = 'pos_settings' AND column_name = 'smtp_password');
SET @sql = IF(@exists = 0, 'ALTER TABLE `pos_settings` ADD `smtp_password` varchar(255) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db_name AND table_name = 'pos_settings' AND column_name = 'smtp_from');
SET @sql = IF(@exists = 0, 'ALTER TABLE `pos_settings` ADD `smtp_from` varchar(320) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'SMTP columns ready' AS result;
