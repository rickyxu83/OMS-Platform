const { query } = require('../../config/db')

// 登录安全审计（002-login-security US3）：/api/v1/auth 未挂 auditLogger 中间件（依赖 req.user），
// 登录成功/失败与通行密钥增删全部在这里显式留痕。
// action 词表沿用系统自由动词风格（如 contract_no_fill）：login / login_failed / passkey_register / passkey_delete / passkey_rename
async function writeAuthAudit(req, { actorId = 0, action, detail = {} }) {
  try {
    await query(
      `INSERT INTO audit_logs (actor_id, target_type, target_id, action, detail_json)
       VALUES (:actorId, 'auth', :targetId, :action, :detailJson)`,
      {
        actorId,
        targetId: actorId,
        action,
        detailJson: JSON.stringify({
          ip: req.ip,
          userAgent: String(req.get?.('user-agent') || '').slice(0, 255) || undefined,
          ...detail,
        }),
      },
    )
  } catch (error) {
    // 审计失败不阻塞登录主流程，与 auditLogger 中间件的容错口径一致
    console.error('auth audit log failed', error.message)
  }
}

module.exports = {
  writeAuthAudit,
}
