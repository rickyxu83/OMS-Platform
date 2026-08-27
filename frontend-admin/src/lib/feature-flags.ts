/**
 * 功能开关（暗启动）。
 *
 * MR 模块（订购申请 + 统一待办）已于 2026-08-27 点亮：菜单/路由/待办轮询常驻，
 * 不再受开关控制（生产 compose 的 FEATURE_MODULES_DISABLED 需同步移除 mr,approval-tasks）。
 *
 * 考勤系统与手机签名（user-signature）仍为半成品（待 QA 与灰度），随整体发布合入 main 后，
 * 生产环境必须对终端用户零感知：前端入口（菜单/路由/页面入口）一律按本开关隐藏，
 * 后端对应模块路由按 FEATURE_MODULES_DISABLED 不挂载（见 backend/src/app.js）。
 *
 * 显示规则：
 * - 本地开发（import.meta.env.DEV）：显示
 * - 测试服（部署注入 VITE_APP_ENVIRONMENT=test）：显示
 * - 生产（未注入 test）：隐藏
 *
 * 点亮路径：考勤/手机签名 QA+灰度完成后，删除本开关及全部引用（菜单/路由/轮询恢复常驻），
 * 并移除生产 compose 的 FEATURE_MODULES_DISABLED 中对应模块，小版本发布即可。
 */
export const SHOW_ATTENDANCE: boolean =
  import.meta.env.DEV || (import.meta as any).env.VITE_APP_ENVIRONMENT === "test";

/** 手机签名（user-signature 模块）暗启动开关，显示规则同 SHOW_ATTENDANCE */
export const SHOW_USER_SIGNATURE: boolean =
  import.meta.env.DEV || (import.meta as any).env.VITE_APP_ENVIRONMENT === "test";
