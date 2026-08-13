ALTER TABLE `pos_settings` MODIFY COLUMN `timezone` varchar(64) NOT NULL DEFAULT 'Europe/Madrid';--> statement-breakpoint
ALTER TABLE `pos_settings` MODIFY COLUMN `default_vat_rate` decimal(5,2) NOT NULL DEFAULT '10.00';--> statement-breakpoint
ALTER TABLE `pos_cash_sessions` ADD `counted_card` decimal(12,2);--> statement-breakpoint
ALTER TABLE `pos_cash_sessions` ADD `denomination_counts` json;--> statement-breakpoint
ALTER TABLE `pos_settings` ADD `business_day_starts_at` varchar(5) DEFAULT '07:00' NOT NULL;