ALTER TABLE `pos_products` ADD `equivalence_surcharge_rate` decimal(5,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `pos_products` ADD `last_purchase_cost_before_surcharge` decimal(12,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `pos_products` ADD `weighted_average_cost_before_surcharge` decimal(12,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `pos_products` ADD `show_in_tpv` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `pos_purchase_invoice_lines` ADD `equivalence_surcharge_rate` decimal(5,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `pos_purchase_invoice_lines` ADD `equivalence_surcharge_amount` decimal(12,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `pos_purchase_invoices` ADD `equivalence_surcharge_amount` decimal(12,2) DEFAULT '0.00' NOT NULL;