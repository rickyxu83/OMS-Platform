interface SkeletonProps {
  className?: string;
}

/** 骨架屏占位块：灰色脉冲动画 */
export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} aria-hidden="true" />;
}

/** 列表行骨架屏：一行两列（主文本 + 右侧短条） */
export function SkeletonRow({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="h-4 w-24 shrink-0" />
      <Skeleton className="h-4 flex-1" />
      {Array.from({ length: Math.max(0, columns - 2) }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-16 shrink-0" />
      ))}
      <Skeleton className="h-6 w-14 shrink-0 rounded-full" />
    </div>
  );
}

/** 列表骨架屏：多行 */
export function SkeletonList({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} columns={columns} />
      ))}
    </div>
  );
}

/** 详情/字段骨架屏：标签+值 成对占位 */
export function SkeletonDetail({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}
