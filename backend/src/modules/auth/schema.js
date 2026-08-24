const { query } = require('../../config/db')

let authSecurityTablesReady = false

// 登录安全增强（002-login-security）惰性迁移：
// - user_passkeys：WebAuthn 通行密钥凭据（一人多端，credential_id 全局唯一）
// - auth_challenges：登记/登录 challenge 一次性票据（微信扫码 state 将来复用本表）
async function ensureAuthSecurityTables() {
  if (authSecurityTablesReady) return

  await query(
    `CREATE TABLE IF NOT EXISTS user_passkeys (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      credential_id VARCHAR(255) NOT NULL,
      public_key TEXT NOT NULL,
      counter BIGINT UNSIGNED NOT NULL DEFAULT 0,
      transports VARCHAR(255) NULL,
      device_name VARCHAR(64) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_user_passkeys_credential (credential_id),
      KEY idx_user_passkeys_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )

  await query(
    `CREATE TABLE IF NOT EXISTS auth_challenges (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      challenge VARCHAR(128) NOT NULL,
      purpose VARCHAR(32) NOT NULL,
      user_id BIGINT UNSIGNED NULL,
      payload TEXT NULL,
      expires_at DATETIME NOT NULL,
      consumed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_auth_challenges_challenge (challenge),
      KEY idx_auth_challenges_expiry (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )

  authSecurityTablesReady = true
}

module.exports = {
  ensureAuthSecurityTables,
}
