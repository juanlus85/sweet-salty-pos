CREATE TABLE IF NOT EXISTS `pos_fiscal_invoices` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sale_id` int NOT NULL,
  `profile_id` int NOT NULL,
  `series_id` int NOT NULL,
  `sequence_number` int NOT NULL,
  `invoice_number` varchar(64) NOT NULL,
  `invoice_type` enum('simplified','complete','rectifying','cancellation') NOT NULL DEFAULT 'simplified',
  `status` enum('issued','cancelled','rectified') NOT NULL DEFAULT 'issued',
  `original_fiscal_invoice_id` int,
  `issued_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `subtotal` decimal(12,2) NOT NULL,
  `vat_amount` decimal(12,2) NOT NULL,
  `total_amount` decimal(12,2) NOT NULL,
  `immutable_snapshot` json NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pos_fiscal_invoices_sale_unique` (`sale_id`),
  UNIQUE KEY `pos_fiscal_invoices_number_unique` (`invoice_number`),
  KEY `pos_fiscal_invoices_profile_index` (`profile_id`,`issued_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pos_fiscal_profiles` (
  `id` int AUTO_INCREMENT NOT NULL,
  `commercial_name` varchar(160) NOT NULL DEFAULT 'Sweet & Salty',
  `legal_name` varchar(255) NOT NULL DEFAULT 'Ana Perez Peramo',
  `tax_id` varchar(32) NOT NULL DEFAULT '77807125B',
  `address_line1` varchar(255) NOT NULL DEFAULT 'Calle Adriano 6',
  `postal_code` varchar(16) NOT NULL DEFAULT '41001',
  `city` varchar(100) NOT NULL DEFAULT 'Sevilla',
  `country_code` varchar(2) NOT NULL DEFAULT 'ES',
  `software_name` varchar(160) NOT NULL DEFAULT 'Sweet & Salty POS',
  `software_version` varchar(64) NOT NULL DEFAULT 'preparacion-verifactu',
  `mode` enum('test','verifactu','non_verifiable') NOT NULL DEFAULT 'test',
  `submission_environment` enum('sandbox','production') NOT NULL DEFAULT 'sandbox',
  `certificate_status` enum('not_configured','configured','verified') NOT NULL DEFAULT 'not_configured',
  `is_active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pos_fiscal_profiles_tax_id_unique` (`tax_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pos_fiscal_records` (
  `id` int AUTO_INCREMENT NOT NULL,
  `fiscal_invoice_id` int NOT NULL,
  `record_type` enum('high','cancellation','rectification') NOT NULL DEFAULT 'high',
  `chain_position` int NOT NULL,
  `algorithm` varchar(32) NOT NULL DEFAULT 'SHA-256',
  `previous_hash` varchar(64),
  `record_hash` varchar(64) NOT NULL,
  `canonical_payload` json NOT NULL,
  `qr_payload` text,
  `submission_status` enum('not_ready','sandbox_pending','sandbox_sent','accepted','rejected','error') NOT NULL DEFAULT 'not_ready',
  `submission_message` text,
  `generated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `submitted_at` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pos_fiscal_records_invoice_unique` (`fiscal_invoice_id`,`record_type`),
  UNIQUE KEY `pos_fiscal_records_chain_position_unique` (`chain_position`),
  KEY `pos_fiscal_records_submission_index` (`submission_status`,`generated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pos_fiscal_series` (
  `id` int AUTO_INCREMENT NOT NULL,
  `profile_id` int NOT NULL,
  `code` varchar(20) NOT NULL DEFAULT 'SS',
  `description` varchar(160) NOT NULL DEFAULT 'Tickets Sweet & Salty',
  `next_number` int NOT NULL DEFAULT 1,
  `is_active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pos_fiscal_series_profile_code_unique` (`profile_id`,`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
