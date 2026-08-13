CREATE TABLE `pos_vat_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`rate` decimal(5,2) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_vat_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_vat_types_name_unique` UNIQUE(`name`),
	CONSTRAINT `pos_vat_types_rate_unique` UNIQUE(`rate`)
);
--> statement-breakpoint
ALTER TABLE `pos_products` ADD `vat_type_id` int;