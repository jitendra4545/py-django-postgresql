ALTER TABLE app_documents
  MODIFY storage_disk ENUM('local','s3','spaces') NOT NULL,
  ADD COLUMN visibility ENUM('PRIVATE','PUBLIC') NOT NULL DEFAULT 'PRIVATE' AFTER storage_key,
  ADD KEY idx_app_documents_expiry (expires_at,deleted_at);

UPDATE app_documents SET storage_disk='spaces' WHERE storage_disk='s3';

ALTER TABLE app_documents
  MODIFY storage_disk ENUM('local','spaces') NOT NULL;

ALTER TABLE app_account_invitations
  ADD COLUMN last_sent_at TIMESTAMP NULL AFTER accepted_at,
  ADD COLUMN send_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER last_sent_at,
  ADD KEY idx_app_account_invitation_pending (user_id,accepted_at,expires_at);
