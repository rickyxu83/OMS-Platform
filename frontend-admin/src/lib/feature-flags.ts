/**
 * 功能开关（暗启动）。
 *
 * 考勤系统 2026-10-20 内测上线：SHOW_ATTENDANCE 开关已删除，菜单/路由常驻，
 * 菜单名带「（内测）」标识；正式上线时去掉标识文案即可。
 *
 * MR 报价识别实验体系（spec 009）：实验引擎 v2 入口 + 规则教练入口。
 * 生产隐藏（佬 2026-09-09 裁决：实验功能不上生产，验收稳定后删除本开关及引用即可点亮）；
 * 后端接口不受开关影响（engine 参数缺省 v1，行为与线上完全一致）。
 *
 * 显示规则：本地开发/测试服显示，生产隐藏。
 */
export const SHOW_MR_QUOTE_V2: boolean =
  import.meta.env.DEV || (import.meta as any).env.VITE_APP_ENVIRONMENT === "test";
