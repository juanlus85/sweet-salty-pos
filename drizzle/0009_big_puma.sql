ALTER TABLE `pos_settings` ADD `smtp_host` varchar(255);--> statement-breakpoint
ALTER TABLE `pos_settings` ADD `smtp_port` int DEFAULT 587 NOT NULL;--> statement-breakpoint
ALTER TABLE `pos_settings` ADD `smtp_secure` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `pos_settings` ADD `smtp_user` varchar(320);--> statement-breakpoint
ALTER TABLE `pos_settings` ADD `smtp_password` varchar(255);--> statement-breakpoint
ALTER TABLE `pos_settings` ADD `smtp_from` varchar(320);