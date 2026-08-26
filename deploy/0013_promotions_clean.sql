CREATE TABLE IF NOT EXISTS `pos_promotions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `product_id` int NOT NULL,
  `name` varchar(160) NOT NULL,
  `combo_price` decimal(12,2) NOT NULL,
  `is_active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pos_promotions_id` PRIMARY KEY (`id`),
  CONSTRAINT `pos_promotions_product_unique` UNIQUE (`product_id`)
);

CREATE TABLE IF NOT EXISTS `pos_promotion_slots` (
  `id` int AUTO_INCREMENT NOT NULL,
  `promotion_id` int NOT NULL,
  `position` int NOT NULL,
  `label` varchar(100) NOT NULL,
  `category_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `pos_promotion_slots_id` PRIMARY KEY (`id`),
  CONSTRAINT `pos_promotion_slots_position_unique` UNIQUE (`promotion_id`, `position`)
);

CREATE TABLE IF NOT EXISTS `pos_promotion_slot_products` (
  `id` int AUTO_INCREMENT NOT NULL,
  `slot_id` int NOT NULL,
  `product_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `pos_promotion_slot_products_id` PRIMARY KEY (`id`),
  CONSTRAINT `pos_promotion_slot_products_unique` UNIQUE (`slot_id`, `product_id`)
);

ALTER TABLE `pos_categories` ADD COLUMN IF NOT EXISTS `is_promotion` boolean NOT NULL DEFAULT false;
ALTER TABLE `pos_sale_lines` ADD COLUMN IF NOT EXISTS `discount_percent` decimal(5,2) NOT NULL DEFAULT '0.00';
ALTER TABLE `pos_sale_lines` ADD COLUMN IF NOT EXISTS `pricing_mode` varchar(24) NOT NULL DEFAULT 'normal';
ALTER TABLE `pos_sale_lines` ADD COLUMN IF NOT EXISTS `promotion_id` int NULL;
ALTER TABLE `pos_sale_lines` ADD COLUMN IF NOT EXISTS `promotion_slot_id` int NULL;

SELECT 'Promociones y descuentos listos' AS resultado; 
