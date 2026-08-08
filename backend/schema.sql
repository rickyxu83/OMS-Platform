CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  real_name VARCHAR(64) NOT NULL,
  phone VARCHAR(32) NULL,
  email VARCHAR(128) NULL,
  login_alias VARCHAR(64) NULL,
  engineer_signature LONGTEXT NULL,
  avatar_path VARCHAR(255) NULL,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  role ENUM('admin', 'assistant', 'operations_director', 'engineering_supervisor', 'administrative_supervisor', 'sales_supervisor', 'engineer', 'sales', 'dispatcher') NOT NULL,
  assistant_user_id BIGINT UNSIGNED NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username),
  KEY idx_users_email (email),
  KEY idx_users_assistant (assistant_user_id),
  KEY idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  name_key VARCHAR(160) NULL,
  code VARCHAR(64) NULL,
  address VARCHAR(255) NULL,
  contact_name VARCHAR(64) NULL,
  contact_phone VARCHAR(32) NULL,
  salesperson VARCHAR(64) NULL,
  level ENUM('key', 'normal', 'potential', 'vip') NOT NULL DEFAULT 'normal',
  latitude DECIMAL(10, 7) NULL,
  longitude DECIMAL(10, 7) NULL,
  map_provider VARCHAR(32) NULL,
  map_poi_id VARCHAR(128) NULL,
  map_poi_name VARCHAR(128) NULL,
  map_address VARCHAR(255) NULL,
  remark TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_customers_code (code),
  UNIQUE KEY uk_customers_name_key (name_key),
  KEY idx_customers_name (name),
  KEY idx_customers_location (latitude, longitude),
  KEY idx_customers_map_poi (map_provider, map_poi_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customer_contacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(64) NOT NULL,
  phone VARCHAR(32) NULL,
  use_count INT UNSIGNED NOT NULL DEFAULT 1,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_customer_contacts_customer_name_phone (customer_id, name, phone),
  KEY idx_customer_contacts_customer_usage (customer_id, use_count, last_used_at),
  CONSTRAINT fk_customer_contacts_customer_id FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customer_contact_usage (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_contact_id BIGINT UNSIGNED NOT NULL,
  engineer_id BIGINT UNSIGNED NOT NULL,
  use_count INT UNSIGNED NOT NULL DEFAULT 1,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_customer_contact_usage_engineer (customer_contact_id, engineer_id),
  KEY idx_customer_contact_usage_engineer (engineer_id, use_count, last_used_at),
  CONSTRAINT fk_customer_contact_usage_contact_id FOREIGN KEY (customer_contact_id) REFERENCES customer_contacts (id),
  CONSTRAINT fk_customer_contact_usage_engineer_id FOREIGN KEY (engineer_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE maintenance_parties (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  party_type ENUM('original_manufacturer', 'our_maintenance') NOT NULL,
  name VARCHAR(128) NOT NULL,
  contact VARCHAR(100) NULL,
  phone VARCHAR(32) NULL,
  contacts LONGTEXT NULL,
  official_website VARCHAR(255) NULL,
  remark TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_maintenance_parties_name_phone_type (name, phone, party_type),
  KEY idx_maintenance_parties_party_type (party_type),
  KEY idx_maintenance_parties_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE devices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(128) NULL,
  model VARCHAR(128) NOT NULL,
  pn VARCHAR(128) NULL,
  serial_no VARCHAR(128) NULL,
  mr_no VARCHAR(128) NULL,
  remark TEXT NULL,
  location VARCHAR(255) NULL,
  warranty_until DATE NULL,
  maintenance_type ENUM('pending_confirmation', 'none', 'original_manufacturer', 'our_maintenance') NOT NULL DEFAULT 'pending_confirmation',
  maintenance_party_id BIGINT UNSIGNED NULL,
  maintenance_start DATE NULL,
  maintenance_end DATE NULL,
  installation_source_service_order_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_devices_serial_no (serial_no),
  KEY idx_devices_installation_source_service_order_id (installation_source_service_order_id),
  KEY idx_devices_customer_id (customer_id),
  KEY idx_devices_maintenance_type (maintenance_type),
  KEY idx_devices_maintenance_party_id (maintenance_party_id),
  KEY idx_devices_maintenance_end (maintenance_end),
  CONSTRAINT fk_devices_maintenance_party_id FOREIGN KEY (maintenance_party_id) REFERENCES maintenance_parties (id),
  CONSTRAINT fk_devices_customer_id FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_no VARCHAR(32) NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  contact_name VARCHAR(64) NULL,
  contact_phone VARCHAR(32) NULL,
  device_id BIGINT UNSIGNED NULL,
  service_mode ENUM('onsite', 'remote', 'office') NOT NULL DEFAULT 'onsite',
  service_type ENUM('install', 'repair', 'maintain', 'inspect', 'training', 'other') NOT NULL,
  service_modules JSON NULL,
  timesheet_category VARCHAR(64) NULL,
  timesheet_salesperson VARCHAR(64) NULL,
  priority ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
  status ENUM('draft', 'pending_confirmation', 'awaiting_customer_signature', 'assigned', 'in_progress', 'submitted', 'rejected', 'approved', 'archived', 'cancelled') NOT NULL DEFAULT 'draft',
  issue_description TEXT NOT NULL,
  assigned_engineer_id BIGINT UNSIGNED NULL,
  planned_start_at DATETIME NULL,
  planned_end_at DATETIME NULL,
  internal_note TEXT NULL,
  inspection_schedule_id BIGINT UNSIGNED NULL,
  inspection_occurrence_date DATE NULL,
  target_engineer_id BIGINT UNSIGNED NULL,
  confirmed_by BIGINT UNSIGNED NULL,
  confirmed_at DATETIME NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  submitted_at DATETIME NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  review_comment TEXT NULL,
  archived_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_service_orders_order_no (order_no),
  KEY idx_service_orders_status (status),
  KEY idx_service_orders_customer_id (customer_id),
  KEY idx_service_orders_engineer_status (assigned_engineer_id, status),
  KEY idx_service_orders_planned_start_at (planned_start_at),
  KEY idx_service_orders_submitted_at (submitted_at),
  KEY idx_service_orders_created_at (created_at),
  KEY idx_service_orders_status_created (status, created_at),
  KEY idx_service_orders_target_engineer (target_engineer_id),
  KEY idx_service_orders_inspection_schedule (inspection_schedule_id),
  UNIQUE KEY uk_service_orders_inspection_occurrence (inspection_schedule_id, inspection_occurrence_date, target_engineer_id),
  CONSTRAINT fk_service_orders_customer_id FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_service_orders_device_id FOREIGN KEY (device_id) REFERENCES devices (id),
  CONSTRAINT fk_service_orders_engineer_id FOREIGN KEY (assigned_engineer_id) REFERENCES users (id),
  CONSTRAINT fk_service_orders_target_engineer_id FOREIGN KEY (target_engineer_id) REFERENCES users (id),
  CONSTRAINT fk_service_orders_confirmed_by FOREIGN KEY (confirmed_by) REFERENCES users (id),
  CONSTRAINT fk_service_orders_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_service_orders_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE devices
  ADD CONSTRAINT fk_devices_installation_source_service_order_id
  FOREIGN KEY (installation_source_service_order_id) REFERENCES service_orders (id);

CREATE TABLE service_order_engineers (
  service_order_id BIGINT UNSIGNED NOT NULL,
  engineer_id BIGINT UNSIGNED NOT NULL,
  joined_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (service_order_id, engineer_id),
  KEY idx_service_order_engineers_engineer_id (engineer_id),
  CONSTRAINT fk_service_order_engineers_order_id FOREIGN KEY (service_order_id) REFERENCES service_orders (id),
  CONSTRAINT fk_service_order_engineers_engineer_id FOREIGN KEY (engineer_id) REFERENCES users (id),
  CONSTRAINT fk_service_order_engineers_joined_by FOREIGN KEY (joined_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_order_devices (
  service_order_id BIGINT UNSIGNED NOT NULL,
  device_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (service_order_id, device_id),
  KEY idx_service_order_devices_device_id (device_id),
  CONSTRAINT fk_service_order_devices_order_id FOREIGN KEY (service_order_id) REFERENCES service_orders (id),
  CONSTRAINT fk_service_order_devices_device_id FOREIGN KEY (device_id) REFERENCES devices (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inspection_schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NULL,
  remark VARCHAR(500) NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  target_engineer_id BIGINT UNSIGNED NOT NULL,
  cadence ENUM('monthly', 'bi-monthly', 'quarterly') NOT NULL,
  next_run_anchor DATE NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  active_slot TINYINT GENERATED ALWAYS AS (CASE WHEN active = 1 THEN 1 ELSE NULL END) STORED,
  end_date DATE NULL,
  next_order_status ENUM('pending_confirmation') NOT NULL DEFAULT 'pending_confirmation',
  created_by BIGINT UNSIGNED NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_inspection_schedules_customer_id (customer_id),
  KEY idx_inspection_schedules_engineer_active (target_engineer_id, active),
  KEY idx_inspection_schedules_next_run (active, next_run_anchor),
  CONSTRAINT fk_inspection_schedules_customer_id FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_inspection_schedules_target_engineer_id FOREIGN KEY (target_engineer_id) REFERENCES users (id),
  CONSTRAINT fk_inspection_schedules_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_inspection_schedules_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inspection_schedule_devices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  schedule_id BIGINT UNSIGNED NOT NULL,
  device_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_schedule_device (schedule_id, device_id),
  KEY idx_schedule_devices_device (device_id),
  CONSTRAINT fk_schedule_devices_schedule FOREIGN KEY (schedule_id) REFERENCES inspection_schedules (id) ON DELETE CASCADE,
  CONSTRAINT fk_schedule_devices_device FOREIGN KEY (device_id) REFERENCES devices (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inspection_schedule_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  schedule_id BIGINT UNSIGNED NOT NULL,
  engineer_id BIGINT UNSIGNED NOT NULL,
  device_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_inspection_assignment_device (schedule_id, device_id),
  KEY idx_inspection_assignments_engineer (engineer_id),
  KEY idx_inspection_assignments_device (device_id),
  CONSTRAINT fk_inspection_assignments_schedule FOREIGN KEY (schedule_id) REFERENCES inspection_schedules (id) ON DELETE CASCADE,
  CONSTRAINT fk_inspection_assignments_engineer FOREIGN KEY (engineer_id) REFERENCES users (id),
  CONSTRAINT fk_inspection_assignments_device FOREIGN KEY (device_id) REFERENCES devices (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  service_order_id BIGINT UNSIGNED NOT NULL,
  departure_at DATETIME NULL,
  actual_start_at DATETIME NULL,
  actual_end_at DATETIME NULL,
  return_at DATETIME NULL,
  work_content TEXT NULL,
  result ENUM('resolved', 'unresolved', 'follow_up_required') NULL,
  result_description TEXT NULL,
  customer_name VARCHAR(64) NULL,
  customer_signature_file_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_service_reports_order_id (service_order_id),
  CONSTRAINT fk_service_reports_order_id FOREIGN KEY (service_order_id) REFERENCES service_orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_report_work_entries (
  service_order_id BIGINT UNSIGNED NOT NULL,
  engineer_id BIGINT UNSIGNED NOT NULL,
  work_content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (service_order_id, engineer_id),
  KEY idx_service_report_work_entries_engineer_id (engineer_id),
  CONSTRAINT fk_service_report_work_entries_order_id FOREIGN KEY (service_order_id) REFERENCES service_orders (id),
  CONSTRAINT fk_service_report_work_entries_engineer_id FOREIGN KEY (engineer_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_order_sales_notifications (
  service_order_id BIGINT UNSIGNED NOT NULL,
  due_at DATETIME NOT NULL,
  status ENUM('pending', 'sending', 'sent', 'skipped', 'failed') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  sent_at DATETIME NULL,
  last_error VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (service_order_id),
  KEY idx_sales_notifications_due (status, due_at),
  CONSTRAINT fk_service_order_sales_notifications_order_id FOREIGN KEY (service_order_id) REFERENCES service_orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_order_customer_signature_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  service_order_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  recipient_email VARCHAR(128) NULL,
  status ENUM('created', 'sent', 'signed', 'revoked', 'expired') NOT NULL DEFAULT 'created',
  expires_at DATETIME NOT NULL,
  sent_at DATETIME NULL,
  signed_at DATETIME NULL,
  signed_ip VARCHAR(64) NULL,
  signed_user_agent VARCHAR(255) NULL,
  last_error VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_customer_signature_requests_token_hash (token_hash),
  KEY idx_customer_signature_requests_order_status (service_order_id, status),
  KEY idx_customer_signature_requests_expires (status, expires_at),
  CONSTRAINT fk_customer_signature_requests_order_id FOREIGN KEY (service_order_id) REFERENCES service_orders (id),
  CONSTRAINT fk_customer_signature_requests_created_by FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE self_report_drafts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  engineer_id BIGINT UNSIGNED NOT NULL,
  draft_scope VARCHAR(16) NOT NULL,
  service_order_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  payload_json LONGTEXT NOT NULL,
  client_updated_at VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_self_report_drafts_engineer_scope_order (engineer_id, draft_scope, service_order_id),
  KEY idx_self_report_drafts_service_order_id (service_order_id),
  CONSTRAINT fk_self_report_drafts_engineer_id FOREIGN KEY (engineer_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_parts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  service_order_id BIGINT UNSIGNED NOT NULL,
  device_id BIGINT UNSIGNED NULL,
  action_type ENUM('general', 'replacement', 'installation') NOT NULL DEFAULT 'general',
  part_name VARCHAR(128) NOT NULL,
  part_no VARCHAR(128) NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
  unit VARCHAR(32) NULL,
  remark VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_service_parts_order_id (service_order_id),
  KEY idx_service_parts_device_id (device_id),
  CONSTRAINT fk_service_parts_order_id FOREIGN KEY (service_order_id) REFERENCES service_orders (id),
  CONSTRAINT fk_service_parts_device_id FOREIGN KEY (device_id) REFERENCES devices (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE timesheet_manual_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  engineer_id BIGINT UNSIGNED NOT NULL,
  entry_date DATE NOT NULL,
  category VARCHAR(64) NOT NULL,
  customer_project VARCHAR(128) NULL,
  work_content TEXT NOT NULL,
  progress VARCHAR(64) NULL,
  remark VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_timesheet_manual_entries_engineer_date (engineer_id, entry_date),
  CONSTRAINT fk_timesheet_manual_entries_engineer_id FOREIGN KEY (engineer_id) REFERENCES users (id),
  CONSTRAINT fk_timesheet_manual_entries_created_by FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_type VARCHAR(32) NOT NULL,
  owner_id BIGINT UNSIGNED NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(128) NOT NULL,
  size BIGINT UNSIGNED NOT NULL,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_files_owner (owner_type, owner_id),
  CONSTRAINT fk_files_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE system_settings (
  setting_key VARCHAR(128) NOT NULL,
  setting_value LONGTEXT NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key),
  KEY idx_system_settings_updated_by (updated_by),
  CONSTRAINT fk_system_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE role_permissions (
  role_key VARCHAR(64) NOT NULL,
  permission_key VARCHAR(128) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (role_key, permission_key),
  KEY idx_role_permissions_permission_key (permission_key),
  KEY idx_role_permissions_updated_by (updated_by),
  CONSTRAINT fk_role_permissions_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id BIGINT UNSIGNED NOT NULL,
  target_type VARCHAR(64) NOT NULL,
  target_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(64) NOT NULL,
  detail_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_logs_target (target_type, target_id),
  KEY idx_audit_logs_actor_id (actor_id),
  CONSTRAINT fk_audit_logs_actor_id FOREIGN KEY (actor_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE feedback_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  type ENUM('problem', 'suggestion') NOT NULL DEFAULT 'problem',
  content TEXT NOT NULL,
  page_path VARCHAR(255) NULL,
  status ENUM('open', 'resolved') NOT NULL DEFAULT 'open',
  submitter_id BIGINT UNSIGNED NOT NULL,
  submitter_role VARCHAR(64) NOT NULL,
  resolved_by BIGINT UNSIGNED NULL,
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_feedback_status_created (status, created_at),
  KEY idx_feedback_submitter (submitter_id),
  CONSTRAINT fk_feedback_submitter FOREIGN KEY (submitter_id) REFERENCES users (id),
  CONSTRAINT fk_feedback_resolved_by FOREIGN KEY (resolved_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Canonical device model catalog for normalized backend lookups.
CREATE TABLE IF NOT EXISTS device_model_catalog (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  brand VARCHAR(100) NOT NULL,
  category ENUM('server','storage','network') NOT NULL,
  canonical_model VARCHAR(255) NOT NULL,
  part_number VARCHAR(255) DEFAULT NULL,
  source_provider VARCHAR(50) NOT NULL DEFAULT 'fixture',
  source_reference VARCHAR(255) DEFAULT NULL,
  priority INT NOT NULL DEFAULT 0,
  confidence DECIMAL(3,2) NOT NULL DEFAULT 1.00,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  synced_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_catalog_brand_cat_model (brand, category, canonical_model)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Approved aliases mapped onto canonical catalog rows.
CREATE TABLE IF NOT EXISTS device_model_aliases (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  catalog_id INT UNSIGNED NOT NULL,
  normalized_alias VARCHAR(255) NOT NULL,
  provider_scope VARCHAR(50) NOT NULL DEFAULT 'approved-v1',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_alias_cat_scope (catalog_id, normalized_alias, provider_scope),
  KEY idx_alias_norm_scope (normalized_alias, provider_scope),
  CONSTRAINT fk_alias_catalog FOREIGN KEY (catalog_id) REFERENCES device_model_catalog (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 订购申请（MR）────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mr_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  version_no INT UNSIGNED NOT NULL DEFAULT 0,
  customer_id BIGINT UNSIGNED NULL,
  customer_contact_id BIGINT UNSIGNED NULL,
  sales_owner_id BIGINT UNSIGNED NULL,
  customer_name VARCHAR(255) NULL,
  contact_name VARCHAR(255) NULL,
  case_category VARCHAR(32) NULL,
  customer_po VARCHAR(255) NULL,
  ctrl_no VARCHAR(64) NULL,
  invoice_type VARCHAR(32) NULL,
  pricing_mode TINYINT NULL,
  total_excluding_tax DECIMAL(14,2) NULL,
  has_contract TINYINT(1) NULL,
  contract_type VARCHAR(32) NULL,
  has_penalty TINYINT(1) NULL,
  invoice_process VARCHAR(32) NULL,
  billing_content VARCHAR(500) NULL,
  invoice_recipient VARCHAR(255) NULL,
  billing_timing VARCHAR(255) NULL,
  purchaser VARCHAR(255) NULL,
  purchaser_tel VARCHAR(64) NULL,
  recipient VARCHAR(255) NULL,
  recipient_tel VARCHAR(64) NULL,
  recipient_mail VARCHAR(255) NULL,
  payment_terms VARCHAR(32) NULL,
  payment_other VARCHAR(255) NULL,
  split_delivery TINYINT(1) NULL,
  acceptance VARCHAR(32) NULL,
  acceptance_other VARCHAR(255) NULL,
  penalty_content VARCHAR(500) NULL,
  install_options JSON NULL,
  maintenance_options JSON NULL,
  contract_no VARCHAR(255) NULL,
  fill_date DATE NULL,
  latest_delivery_date DATE NULL,
  delivery_location VARCHAR(500) NULL,
  shipment_no VARCHAR(255) NULL,
  delivery_terms VARCHAR(255) NULL,
  quotation_file_id BIGINT UNSIGNED NULL,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  submitted_at DATETIME NULL,
  approved_at DATETIME NULL,
  rejected_at DATETIME NULL,
  reject_reason VARCHAR(500) NULL,
  return_target VARCHAR(16) NULL,
  withdrawn_at DATETIME NULL,
  withdraw_reason VARCHAR(500) NULL,
  voided_at DATETIME NULL,
  void_reason VARCHAR(500) NULL,
  archive_status VARCHAR(16) NULL,
  archive_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  archive_next_attempt_at DATETIME NULL,
  archive_error VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_mr_orders_status (status),
  KEY idx_mr_orders_customer (customer_id),
  KEY idx_mr_orders_sales_owner (sales_owner_id),
  KEY idx_mr_orders_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mr_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mr_id BIGINT UNSIGNED NOT NULL,
  row_no INT NOT NULL,
  company_part_no VARCHAR(100) NULL,
  oem_spec VARCHAR(255) NULL,
  name VARCHAR(255) NULL,
  description TEXT NULL,
  warranty_service VARCHAR(255) NULL,
  install_by VARCHAR(64) NULL,
  qty DECIMAL(12,4) NULL,
  unit_price DECIMAL(14,6) NULL,
  subtotal DECIMAL(14,2) NULL,
  vendor VARCHAR(255) NULL,
  cost_incl_tax DECIMAL(14,2) NULL,
  tax_rate DECIMAL(5,2) NULL,
  quoted_unit_price DECIMAL(14,6) NULL,
  purchase_order_no VARCHAR(255) NULL,
  cost_source VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_mr_items_mr (mr_id),
  CONSTRAINT fk_mr_items_order FOREIGN KEY (mr_id) REFERENCES mr_orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mr_approvals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mr_id BIGINT UNSIGNED NOT NULL,
  cycle INT NOT NULL DEFAULT 1,
  version_no INT UNSIGNED NULL,
  seq INT NOT NULL,
  step_key VARCHAR(24) NOT NULL,
  step_label VARCHAR(32) NOT NULL,
  assignee_user_id BIGINT UNSIGNED NULL,
  assignment_error VARCHAR(255) NULL,
  approver_id BIGINT UNSIGNED NULL,
  approver_name_snapshot VARCHAR(64) NULL,
  approver_role_snapshot VARCHAR(32) NULL,
  approver_signature_snapshot LONGTEXT NULL,
  action VARCHAR(16) NULL,
  reason VARCHAR(500) NULL,
  decided_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_mr_approvals_mr (mr_id, cycle, seq),
  CONSTRAINT fk_mr_approvals_order FOREIGN KEY (mr_id) REFERENCES mr_orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mr_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mr_id BIGINT UNSIGNED NOT NULL,
  cycle INT NOT NULL,
  version_no INT UNSIGNED NOT NULL,
  kind VARCHAR(16) NOT NULL,
  snapshot JSON NOT NULL,
  changes JSON NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_mr_versions_cycle_kind (mr_id, cycle, kind),
  KEY idx_mr_versions_number (mr_id, version_no),
  CONSTRAINT fk_mr_versions_order FOREIGN KEY (mr_id) REFERENCES mr_orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS approval_tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_type VARCHAR(32) NOT NULL,
  business_id BIGINT UNSIGNED NOT NULL,
  approval_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  assignee_user_id BIGINT UNSIGNED NOT NULL,
  initiator_user_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  detail_path VARCHAR(255) NOT NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_approval_tasks_approval (business_type, approval_id),
  KEY idx_approval_tasks_assignee (assignee_user_id, status, created_at),
  KEY idx_approval_tasks_initiator (initiator_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mr_notification_outbox (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mr_id BIGINT UNSIGNED NOT NULL,
  recipient_user_id BIGINT UNSIGNED NOT NULL,
  event VARCHAR(24) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error VARCHAR(500) NULL,
  sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_mr_notification_due (status, next_attempt_at),
  CONSTRAINT fk_mr_outbox_order FOREIGN KEY (mr_id) REFERENCES mr_orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mr_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mr_id BIGINT UNSIGNED NOT NULL,
  version_no INT UNSIGNED NOT NULL,
  document_type VARCHAR(16) NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  size BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_mr_documents_version_type (mr_id, version_no, document_type),
  CONSTRAINT fk_mr_documents_order FOREIGN KEY (mr_id) REFERENCES mr_orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
