import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

/** 导入进度（与后端 importProgressHandler 对齐） */
export interface RecognitionProgress {
  done: number
  total: number
  current?: string
  stage?: string
  stagePercent?: number
  itemCount?: number
}

/** AI 生成阶段轮换提示文案（按真实生成步骤：提取→归纳→评估→识别→整理） */
const AI_MESSAGES = [
  '正在提取各品项名称与规格…',
  '正在归纳字段与版式结构…',
  '正在评估供应商与采购成本…',
  '正在识别缺失项与异常值…',
  '正在整理跨文件匹配建议…',
]

const STAGE_MESSAGES: Record<string, (itemCount?: number) => string> = {
  preparing: () => '正在准备解析…',
  parsing: () => '正在解析报价文件…',
  cache: () => '正在复用历史识别结果…',
  ocr: () => 'OCR 文字识别中…',
  ready: (count) => (count && count > 0 ? `已识别 ${count} 条品项，准备生成识别结果…` : '已解析文件，准备生成识别结果…'),
  normalizing: () => '识别结果已生成，正在校验完整性…',
  merging: () => '正在汇总识别结果…',
  done: () => '识别完成',
}

// AI 阶段：35% 起每秒 +0.8% 平滑爬升，89% 封顶
const AI_START_PERCENT = 35
const AI_CAP_PERCENT = 89
const AI_RISE_PER_SECOND = 0.8
const AI_MESSAGE_INTERVAL_MS = 4000

/**
 * 订单导入 AI 识别分阶段进度面板（移植自 AI 运营总结生成动画）：
 * 服务端分阶段上报锚点（stagePercent），前端在锚点间平滑补间；
 * AI 生成阶段展示紫→天蓝渐变滚动光带进度条，并每 4 秒轮换提示文案。
 */
export function RecognitionProgressPanel({ progress, fileCount = 1 }: { progress: RecognitionProgress | null; fileCount?: number }) {
  const [percent, setPercent] = useState(3)
  const [messageIndex, setMessageIndex] = useState(0)
  const lastAnchor = useRef(3)

  const stage = progress?.stage || 'preparing'
  const anchor = Number(progress?.stagePercent ?? 3)
  const itemCount = Number(progress?.itemCount || 0)
  const isAiStage = stage === 'ai' || stage === 'rendering'

  // 锚点前进（不后退）：非 AI 阶段目标 = 服务端锚点；AI 阶段起点 35%
  const target = useMemo(() => {
    if (isAiStage) return AI_CAP_PERCENT
    return Math.max(anchor, 3)
  }, [isAiStage, anchor])

  // 锚点推进：服务端到达更高阶段时立即平滑推进（含 AI 阶段起点）
  useEffect(() => {
    if (!isAiStage && anchor > lastAnchor.current) {
      lastAnchor.current = anchor
      setPercent(anchor)
    }
  }, [isAiStage, anchor])

  // AI 阶段：匀速爬升 + 文案轮换
  useEffect(() => {
    if (!isAiStage) return
    if (lastAnchor.current < AI_START_PERCENT) {
      lastAnchor.current = AI_START_PERCENT
      setPercent(AI_START_PERCENT)
    }
    const ticker = window.setInterval(() => {
      setPercent((current) => Math.min(AI_CAP_PERCENT, current + AI_RISE_PER_SECOND))
    }, 1000)
    const message = window.setInterval(() => {
      setMessageIndex((index) => (index + 1) % AI_MESSAGES.length)
    }, AI_MESSAGE_INTERVAL_MS)
    return () => {
      window.clearInterval(ticker)
      window.clearInterval(message)
    }
  }, [isAiStage])

  // 完成/校验阶段：到 100
  useEffect(() => {
    if (stage === 'done' || stage === 'merging' && progress?.done === progress?.total) {
      setPercent(100)
    }
  }, [stage, progress?.done, progress?.total])

  const displayPercent = Math.max(3, Math.min(100, Math.round(percent)))
  const message = isAiStage
    ? (itemCount > 0 ? `AI 正在分析 ${itemCount} 条品项（第 ${messageIndex + 1}/5 次尝试）…` : AI_MESSAGES[messageIndex])
    : STAGE_MESSAGES[stage]?.(itemCount) || STAGE_MESSAGES.preparing()
  const isAiBar = isAiStage

  return (
    <div role="status" aria-live="polite" className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
          <span className="truncate text-base font-semibold">AI 报价识别中</span>
        </div>
        <span className="shrink-0 font-mono text-2xl font-bold tabular-nums text-primary">{displayPercent}%</span>
      </div>

      {/* 进度条：全程渐变华丽风格（基础渐变 + 光带滚动），不随阶段切换纯色/渐变，避免风格跳动 */}
      <div className="mt-3 h-3.5 overflow-hidden rounded-full bg-muted">
        <div
          className="relative h-full rounded-full transition-[width] duration-300 ease-out mr-ai-progress-bar"
          style={{ width: `${displayPercent}%`, boxShadow: '0 0 14px rgba(124,58,237,0.45), 0 0 6px rgba(56,189,248,0.35)' }}
        />
      </div>

      <div className="mt-2.5 text-xs text-muted-foreground" style={{ animation: 'mr-progress-breathe 2.4s ease-in-out infinite' }}>
        {message}
      </div>

      <style>{`
        /* AI 阶段进度条：基础渐变（primary → 天蓝 → primary → 天蓝）+ 白色光带层背景位置滚动（参考范例） */
        @keyframes mr-progress-roll {
          0% { background-position: 0% 0, 0 0; }
          100% { background-position: 40% 0, 0 0; }
        }
        .mr-ai-progress-bar {
          position: relative;
          overflow: hidden;
          background-image:
            linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.45) 50%, transparent 100%),
            linear-gradient(90deg, var(--primary), #38bdf8, var(--primary), #38bdf8);
          background-size: 40% 100%, 100% 100%;
          background-repeat: repeat, no-repeat;
          animation: mr-progress-roll 1.1s linear infinite;
        }
        @keyframes mr-progress-breathe {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
