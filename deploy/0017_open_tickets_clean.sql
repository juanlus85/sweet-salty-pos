CREATE TABLE IF NOT EXISTS `pos_open_tickets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `slot_number` int NOT NULL,
  `cart` json NOT NULL,
  `saved_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pos_open_tickets_slot_unique` (`slot_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
