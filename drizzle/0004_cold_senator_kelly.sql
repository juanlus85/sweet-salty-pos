ALTER TABLE `pos_products` MODIFY COLUMN `vat_rate` decimal(5,2) NOT NULL DEFAULT '10.00';--> statement-breakpoint
ALTER TABLE `pos_purchase_invoice_lines` MODIFY COLUMN `vat_rate` decimal(5,2) NOT NULL DEFAULT '10.00';--> statement-breakpoint
ALTER TABLE `pos_sale_lines` MODIFY COLUMN `vat_rate` decimal(5,2) NOT NULL DEFAULT '10.00';