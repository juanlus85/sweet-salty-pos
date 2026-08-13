CREATE TABLE `pos_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entity_type` varchar(64) NOT NULL,
	`entity_id` int NOT NULL,
	`action` varchar(64) NOT NULL,
	`before_data` json,
	`after_data` json,
	`note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pos_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pos_cash_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cash_session_id` int NOT NULL,
	`movement_type` enum('float','cash_sale','withdrawal','cash_in','cash_out','refund') NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`note` varchar(255),
	`source_type` varchar(50),
	`source_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pos_cash_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pos_cash_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`business_date` varchar(10) NOT NULL,
	`opening_float` decimal(12,2) NOT NULL DEFAULT '0.00',
	`expected_cash` decimal(12,2) NOT NULL DEFAULT '0.00',
	`counted_cash` decimal(12,2),
	`card_total` decimal(12,2) NOT NULL DEFAULT '0.00',
	`difference` decimal(12,2),
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`opened_at` timestamp NOT NULL DEFAULT (now()),
	`closed_at` timestamp,
	`notes` text,
	CONSTRAINT `pos_cash_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_cash_sessions_date_unique` UNIQUE(`business_date`)
);
--> statement-breakpoint
CREATE TABLE `pos_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`color` varchar(7) NOT NULL DEFAULT '#155E75',
	`image_url` text,
	`sort_order` int NOT NULL DEFAULT 0,
	`is_featured` boolean NOT NULL DEFAULT false,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_categories_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `pos_inventory_balances` (
	`product_id` int NOT NULL,
	`quantity_on_hand` decimal(12,3) NOT NULL DEFAULT '0.000',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_inventory_balances_product_id` PRIMARY KEY(`product_id`)
);
--> statement-breakpoint
CREATE TABLE `pos_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sale_id` int NOT NULL,
	`method` enum('cash','card') NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`received_amount` decimal(12,2),
	`change_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`terminal_reference` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pos_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pos_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`business_name` varchar(160) NOT NULL DEFAULT 'Sweet & Salty',
	`currency` varchar(3) NOT NULL DEFAULT 'EUR',
	`timezone` varchar(64) NOT NULL DEFAULT 'Atlantic/Canary',
	`default_vat_rate` decimal(5,2) NOT NULL DEFAULT '7.00',
	`build_version` varchar(64) NOT NULL DEFAULT 'v0.1.0',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pos_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category_id` int NOT NULL,
	`primary_supplier_id` int,
	`name` varchar(255) NOT NULL,
	`sku` varchar(100),
	`barcode` varchar(100),
	`description` text,
	`image_url` text,
	`unit` varchar(32) NOT NULL DEFAULT 'unidad',
	`sale_price` decimal(12,2) NOT NULL DEFAULT '0.00',
	`vat_rate` decimal(5,2) NOT NULL DEFAULT '7.00',
	`last_purchase_cost` decimal(12,2) NOT NULL DEFAULT '0.00',
	`weighted_average_cost` decimal(12,2) NOT NULL DEFAULT '0.00',
	`minimum_stock` decimal(12,3) NOT NULL DEFAULT '0.000',
	`is_featured` boolean NOT NULL DEFAULT false,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_products_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_products_sku_unique` UNIQUE(`sku`),
	CONSTRAINT `pos_products_barcode_unique` UNIQUE(`barcode`)
);
--> statement-breakpoint
CREATE TABLE `pos_purchase_invoice_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchase_invoice_id` int NOT NULL,
	`product_id` int,
	`supplier_reference` varchar(100),
	`detected_name` varchar(255),
	`quantity` decimal(12,3) NOT NULL,
	`unit_cost` decimal(12,2) NOT NULL,
	`vat_rate` decimal(5,2) NOT NULL DEFAULT '7.00',
	`line_total` decimal(12,2) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pos_purchase_invoice_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pos_purchase_invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplier_id` int,
	`invoice_number` varchar(100),
	`invoice_date` datetime,
	`subtotal` decimal(12,2) NOT NULL DEFAULT '0.00',
	`vat_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`total_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`document_url` text,
	`document_name` varchar(255),
	`ocr_status` enum('not_requested','processing','ready','failed','reviewed') NOT NULL DEFAULT 'not_requested',
	`ocr_data` json,
	`status` enum('draft','received','void') NOT NULL DEFAULT 'draft',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_purchase_invoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pos_sale_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sale_id` int NOT NULL,
	`product_id` int,
	`product_name` varchar(255) NOT NULL,
	`sku` varchar(100),
	`quantity` decimal(12,3) NOT NULL,
	`unit_price` decimal(12,2) NOT NULL,
	`unit_cost` decimal(12,2) NOT NULL DEFAULT '0.00',
	`vat_rate` decimal(5,2) NOT NULL DEFAULT '7.00',
	`line_subtotal` decimal(12,2) NOT NULL,
	`line_vat` decimal(12,2) NOT NULL DEFAULT '0.00',
	`line_total` decimal(12,2) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pos_sale_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pos_sales` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sale_number` varchar(32) NOT NULL,
	`cash_session_id` int NOT NULL,
	`subtotal` decimal(12,2) NOT NULL,
	`discount_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`vat_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`total_amount` decimal(12,2) NOT NULL,
	`status` enum('completed','void','refunded') NOT NULL DEFAULT 'completed',
	`note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`voided_at` timestamp,
	`void_reason` varchar(255),
	CONSTRAINT `pos_sales_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_sales_number_unique` UNIQUE(`sale_number`)
);
--> statement-breakpoint
CREATE TABLE `pos_stock_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` int NOT NULL,
	`movement_type` enum('opening','purchase_receipt','sale','sale_return','adjustment','waste','void_reversal') NOT NULL,
	`quantity_delta` decimal(12,3) NOT NULL,
	`quantity_before` decimal(12,3) NOT NULL,
	`quantity_after` decimal(12,3) NOT NULL,
	`unit_cost` decimal(12,2),
	`source_type` varchar(50),
	`source_id` int,
	`note` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pos_stock_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pos_supplier_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplier_id` int NOT NULL,
	`product_id` int NOT NULL,
	`supplier_reference` varchar(100),
	`last_unit_cost` decimal(12,2),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_supplier_products_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_supplier_product_unique` UNIQUE(`supplier_id`,`product_id`)
);
--> statement-breakpoint
CREATE TABLE `pos_suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`legal_name` varchar(255),
	`tax_id` varchar(64),
	`contact_name` varchar(255),
	`phone` varchar(50),
	`email` varchar(320),
	`address` text,
	`notes` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pos_suppliers_id` PRIMARY KEY(`id`),
	CONSTRAINT `pos_suppliers_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE INDEX `pos_audit_entity_index` ON `pos_audit_log` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `pos_cash_movements_session_index` ON `pos_cash_movements` (`cash_session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `pos_categories_sort_index` ON `pos_categories` (`sort_order`,`is_active`);--> statement-breakpoint
CREATE INDEX `pos_payments_sale_index` ON `pos_payments` (`sale_id`);--> statement-breakpoint
CREATE INDEX `pos_payments_method_index` ON `pos_payments` (`method`,`created_at`);--> statement-breakpoint
CREATE INDEX `pos_products_category_index` ON `pos_products` (`category_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `pos_products_name_index` ON `pos_products` (`name`);--> statement-breakpoint
CREATE INDEX `pos_purchase_invoices_date_index` ON `pos_purchase_invoices` (`invoice_date`);--> statement-breakpoint
CREATE INDEX `pos_purchase_invoices_supplier_index` ON `pos_purchase_invoices` (`supplier_id`,`status`);--> statement-breakpoint
CREATE INDEX `pos_sales_session_index` ON `pos_sales` (`cash_session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `pos_stock_movements_product_index` ON `pos_stock_movements` (`product_id`,`created_at`);