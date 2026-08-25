ALTER TABLE `pos_categories` ADD `loyverse_id` varchar(64);--> statement-breakpoint
ALTER TABLE `pos_products` ADD `loyverse_item_id` varchar(64);--> statement-breakpoint
ALTER TABLE `pos_products` ADD `loyverse_variant_id` varchar(64);--> statement-breakpoint
ALTER TABLE `pos_products` ADD `loyverse_store_id` varchar(64);--> statement-breakpoint
ALTER TABLE `pos_categories` ADD CONSTRAINT `pos_categories_loyverse_id_unique` UNIQUE(`loyverse_id`);--> statement-breakpoint
ALTER TABLE `pos_products` ADD CONSTRAINT `pos_products_loyverse_variant_id_unique` UNIQUE(`loyverse_variant_id`);