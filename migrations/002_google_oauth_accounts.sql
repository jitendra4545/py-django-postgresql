CREATE TABLE IF NOT EXISTS app_user_oauth_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  provider VARCHAR(32) NOT NULL,
  provider_subject VARCHAR(191) NOT NULL,
  provider_email VARCHAR(191) NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_oauth_provider_subject (provider,provider_subject),
  UNIQUE KEY uq_app_oauth_user_provider (user_id,provider),
  KEY idx_app_oauth_provider_email (provider,provider_email),
  CONSTRAINT fk_app_oauth_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
