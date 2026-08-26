CREATE TABLE IF NOT EXISTS `pos_loyverse_taxes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `loyverse_id` varchar(64) NOT NULL,
  `name` varchar(255) NOT NULL,
  `type` varchar(64) NULL,
  `rate` decimal(12,2) NULL,
  `deleted_at` datetime NULL,
  `remote_created_at` datetime NULL,
  `remote_updated_at` datetime NULL,
  `raw_data` json NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pos_loyverse_taxes_loyverse_id_unique` (`loyverse_id`)
);

SELECT 'Caché de impuestos de Loyverse lista' AS resultado;
