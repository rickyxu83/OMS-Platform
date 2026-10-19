// 天眼查 logo（简化眼睛图标，品牌蓝）
// 点击行为由使用方处理；hasData 控制着色（有缓存数据=品牌蓝，无数据=灰）
export function TycLogo({ className = "h-4 w-4", hasData = true }: { className?: string; hasData?: boolean }) {
  const color = hasData ? "#128BED" : "#9ca3af";
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-label="天眼查">
      <path
        d="M12 5C6.5 5 2.7 9.4 1.8 11.3a1.8 1.8 0 0 0 0 1.4C2.7 14.6 6.5 19 12 19s9.3-4.4 10.2-6.3a1.8 1.8 0 0 0 0-1.4C21.3 9.4 17.5 5 12 5Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.2" fill={color} />
    </svg>
  );
}
