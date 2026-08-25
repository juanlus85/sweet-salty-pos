CREATE TABLE `pos_loyverse_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`loyverse_id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`color` varchar(32),
	`deleted_at` datetime,
	`remote_created_at` datetime,
	`remote_updated_at` datetime,
	`raw_data` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_loyverse_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_loyverse_categories_loyverse_id_unique` UNIQUE(`loyverse_id`)
);
--> statement-breakpoint
CREATE TABLE `pos_loyverse_inventory_levels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`variant_loyverse_id` varchar(64) NOT NULL,
	`store_loyverse_id` varchar(64) NOT NULL,
	`in_stock` decimal(12,3) NOT NULL DEFAULT '0.000',
	`remote_updated_at` datetime,
	`raw_data` json NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_loyverse_inventory_levels_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_loyverse_inventory_levels_unique` UNIQUE(`variant_loyverse_id`,`store_loyverse_id`)
);
--> statement-breakpoint
CREATE TABLE `pos_loyverse_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`loyverse_id` varchar(64) NOT NULL,
	`item_name` varchar(255) NOT NULL,
	`reference_id` varchar(255),
	`category_loyverse_id` varchar(64),
	`image_url` text,
	`track_stock` boolean NOT NULL DEFAULT false,
	`sold_by_weight` boolean NOT NULL DEFAULT false,
	`is_composite` boolean NOT NULL DEFAULT false,
	`deleted_at` datetime,
	`remote_created_at` datetime,
	`remote_updated_at` datetime,
	`raw_data` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_loyverse_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_loyverse_items_loyverse_id_unique` UNIQUE(`loyverse_id`)
);
--> statement-breakpoint
CREATE TABLE `pos_loyverse_receipt_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receipt_id` int NOT NULL,
	`line_index` int NOT NULL,
	`item_loyverse_id` varchar(64),
	`variant_loyverse_id` varchar(64),
	`item_name` varchar(255) NOT NULL,
	`quantity` decimal(12,3) NOT NULL DEFAULT '0.000',
	`price` decimal(12,2) NOT NULL DEFAULT '0.00',
	`gross_total_money` decimal(12,2) NOT NULL DEFAULT '0.00',
	`total_money` decimal(12,2) NOT NULL DEFAULT '0.00',
	`cost` decimal(12,2) NOT NULL DEFAULT '0.00',
	`cost_total` decimal(12,2) NOT NULL DEFAULT '0.00',
	`raw_data` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pos_loyverse_receipt_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_loyverse_receipt_lines_unique` UNIQUE(`receipt_id`,`line_index`)
);
--> statement-breakpoint
CREATE TABLE `pos_loyverse_receipt_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receipt_id` int NOT NULL,
	`payment_index` int NOT NULL,
	`payment_type_id` varchar(64),
	`money_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`raw_data` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pos_loyverse_receipt_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_loyverse_receipt_payments_unique` UNIQUE(`receipt_id`,`payment_index`)
);
--> statement-breakpoint
CREATE TABLE `pos_loyverse_receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receipt_number` varchar(64) NOT NULL,
	`store_loyverse_id` varchar(64),
	`receipt_type` varchar(32),
	`refund_for` varchar(64),
	`receipt_date` datetime,
	`cancelled_at` datetime,
	`total_money` decimal(12,2) NOT NULL DEFAULT '0.00',
	`total_tax` decimal(12,2) NOT NULL DEFAULT '0.00',
	`total_discount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`raw_data` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_loyverse_receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_loyverse_receipts_number_unique` UNIQUE(`receipt_number`)
);
--> statement-breakpoint
CREATE TABLE `pos_loyverse_shifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`loyverse_id` varchar(64) NOT NULL,
	`store_loyverse_id` varchar(64),
	`opened_at` datetime,
	`closed_at` datetime,
	`starting_cash` decimal(12,2) NOT NULL DEFAULT '0.00',
	`cash_payments` decimal(12,2) NOT NULL DEFAULT '0.00',
	`cash_refunds` decimal(12,2) NOT NULL DEFAULT '0.00',
	`paid_in` decimal(12,2) NOT NULL DEFAULT '0.00',
	`paid_out` decimal(12,2) NOT NULL DEFAULT '0.00',
	`raw_data` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_loyverse_shifts_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_loyverse_shifts_loyverse_id_unique` UNIQUE(`loyverse_id`)
);
--> statement-breakpoint
CREATE TABLE `pos_loyverse_stores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`loyverse_id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`timezone` varchar(64),
	`deleted_at` datetime,
	`remote_created_at` datetime,
	`remote_updated_at` datetime,
	`raw_data` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_loyverse_stores_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_loyverse_stores_loyverse_id_unique` UNIQUE(`loyverse_id`)
);
--> statement-breakpoint
CREATE TABLE `pos_loyverse_sync_state` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` varchar(64),
	`merchant_name` varchar(255),
	`active_store_id` varchar(64),
	`active_store_name` varchar(255),
	`catalog_synced_at` datetime,
	`sales_synced_at` datetime,
	`last_sync_started_at` datetime,
	`last_sync_finished_at` datetime,
	`last_sync_status` enum('idle','running','success','error') NOT NULL DEFAULT 'idle',
	`last_sync_error` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_loyverse_sync_state_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pos_loyverse_variant_prices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`variant_loyverse_id` varchar(64) NOT NULL,
	`store_loyverse_id` varchar(64) NOT NULL,
	`pricing_type` varchar(32),
	`price` decimal(12,2),
	`available_for_sale` boolean NOT NULL DEFAULT true,
	`optimal_stock` decimal(12,3),
	`low_stock` decimal(12,3),
	`raw_data` json NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_loyverse_variant_prices_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_loyverse_variant_prices_unique` UNIQUE(`variant_loyverse_id`,`store_loyverse_id`)
);
--> statement-breakpoint
CREATE TABLE `pos_loyverse_variants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`loyverse_id` varchar(64) NOT NULL,
	`item_loyverse_id` varchar(64) NOT NULL,
	`sku` varchar(255),
	`barcode` varchar(255),
	`option1_value` varchar(255),
	`option2_value` varchar(255),
	`option3_value` varchar(255),
	`cost` decimal(12,2),
	`purchase_cost` decimal(12,2),
	`default_price` decimal(12,2),
	`deleted_at` datetime,
	`remote_created_at` datetime,
	`remote_updated_at` datetime,
	`raw_data` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_loyverse_variants_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_loyverse_variants_loyverse_id_unique` UNIQUE(`loyverse_id`)
);
--> statement-breakpoint
CREATE INDEX `pos_loyverse_items_name_index` ON `pos_loyverse_items` (`item_name`);--> statement-breakpoint
CREATE INDEX `pos_loyverse_receipts_date_index` ON `pos_loyverse_receipts` (`receipt_date`);--> statement-breakpoint
CREATE INDEX `pos_loyverse_shifts_closed_index` ON `pos_loyverse_shifts` (`closed_at`);--> statement-breakpoint
CREATE INDEX `pos_loyverse_variants_item_index` ON `pos_loyverse_variants` (`item_loyverse_id`);