/**
 * mr 包对外暴露的分区导航入口（depcruise 边界：包外只能引根文件，不许深引 lib/）。
 * SectionNav 是通用的"表单分区导航"组件，ServiceReport 等非 MR 页面也经由此处复用。
 */
export { SectionNav } from './lib/MrFormRail'
export type { MrSection } from './lib/form-sections'
