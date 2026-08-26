CREATE TABLE `pos_loyverse_taxes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`loyverse_id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` varchar(64),
	`rate` decimal(12,2),
	`deleted_at` datetime,
	`remote_created_at` datetime,
	`remote_updated_at` datetime,
	`raw_data` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_loyverse_taxes_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_loyverse_taxes_loyverse_id_unique` UNIQUE(`loyverse_id`)
);
