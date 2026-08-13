import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export interface ProgressState {
  stage: string;
  progress: number;
  message: string;
}

interface ProgressPanelProps {
  progress: ProgressState;
  title?: string;
  /** 是否显示滚动渐变效果（默认 true） */
  animated?: boolean;
  /** 长等待阶段的平滑爬升参数：从 from% 以 perSecond%/s 爬到 to% 封顶 */
  creep?: { from: number; to: number; perSecond: number };
  /** 轮换提示文案（多用于长等待阶段） */
  hints?: string[];
  hintInterval?: number;
}

/**
 * 通用任务进度面板：彩色滚动进度条 + 实时百分比 + 分步文字描述。
 * 进度值由外部（SSE 事件 / 轮询 / 分片计数）驱动，面板负责平滑显示与文案轮换。
 */
export function ProgressPanel({
  progress,
  title = "处理中",
  animated = true,
  creep,
  hints = [],
  hintInterval = 4000,
}: ProgressPanelProps) {
  const displayRef = useRef(progress.progress);
  const [display, setDisplay] = useState(progress.progress);
  const [hintIndex, setHintIndex] = useState(0);
  const creepStartRef = useRef(0);

  // 每次进度更新时记录爬升起点（用于长阶段内按时间推进）
  useEffect(() => {
    creepStartRef.current = Date.now();
  }, [progress.stage]);

  // 平滑显示：向目标值缓动；有 creep 且当前为长阶段时按时间推进
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      let target = progress.progress;
      if (creep) {
        const elapsed = (Date.now() - creepStartRef.current) / 1000;
        target = Math.max(target, Math.min(creep.to, creep.from + elapsed * creep.perSecond));
      }
      displayRef.current += (target - displayRef.current) * 0.06;
      if (Math.abs(target - displayRef.current) < 0.2) displayRef.current = target;
      setDisplay(Math.min(100, Math.round(displayRef.current)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [progress, creep]);

  // 轮换提示文案
  useEffect(() => {
    if (!hints.length) return;
    const timer = window.setInterval(() => setHintIndex((i) => (i + 1) % hints.length), hintInterval);
    return () => window.clearInterval(timer);
  }, [hints, hintInterval]);

  const message = hints.length ? hints[hintIndex] : progress.message;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          {title}
        </div>
        <span className="font-mono text-sm font-semibold text-primary tabular-nums">{display}%</span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${animated ? "ai-progress-bar" : "bg-primary"} transition-[width] duration-300 ease-out`}
          style={{ width: `${display}%` }}
        />
      </div>
      <p className="mt-2 min-h-5 text-sm text-muted-foreground animate-pulse">{message}</p>
    </div>
  );
}
