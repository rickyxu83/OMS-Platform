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

  // 匿名登录审计需要 actor_id 可空（2026-08-24 事故：audit_logs.actor_id NOT NULL + FK RESTRICT，
  // 失败登录用 actor_id=0 写入直接 FK 报错，失败审计静默丢失；NULL 可绕过 FK 且语义正确）
  const actorCol = await query(
    `SELECT IS_NULLABLE AS isNullable
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs' AND COLUMN_NAME = 'actor_id'
     LIMIT 1`,
  )
  if (actorCol[0] && String(actorCol[0].isNullable).toUpperCase() === 'NO') {
    await query('ALTER TABLE audit_logs MODIFY actor_id BIGINT UNSIGNED NULL')
  }

  authSecurityTablesReady = true
}

module.exports = {
  ensureAuthSecurityTables,
}
