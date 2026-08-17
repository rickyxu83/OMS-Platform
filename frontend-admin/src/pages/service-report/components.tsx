/**
 * ServiceReport 页独立 UI 组件层（自 6200 行单文件拆出）：
 * 签名板/全屏签名、Markdown 工具栏文本域、字段壳、原生日期时间控件、分区容器等。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as React from "react";
import { CheckCircle, FileText, PenLine, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownContent } from "@/lib/markdown";
import type { MarkdownAction } from "./types";
import { MARKDOWN_TOOLS } from "./constants";
import { openNativePicker, openPickerOnMouse, splitInputDateTime, displayText, inputToday } from "./utils";

export interface TimeInputProps {
  label: string;
  time: string;
  onTimeChange: (time: string) => void;
}

export function NativeTimeInput({ label, time, onTimeChange }: TimeInputProps) {
  return (
    <input
      aria-label={`${label}时间`}
      type="time"
      step={300}
      value={time}
      onChange={(event) => onTimeChange(event.target.value)}
      onPointerDown={openPickerOnMouse}
      className="h-9 min-w-0 cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-900 shadow-sm [color-scheme:light] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
    />
  );
}
export function SignaturePad({
  value,
  onChange,
  className = "",
  canvasClassName = "h-36",
  actionsClassName = "",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  canvasClassName?: string;
  actionsClassName?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  function canvasCssSize(canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    return {
      width: Math.max(1, canvas.clientWidth || rect.width),
      height: Math.max(1, canvas.clientHeight || rect.height),
    };
  }

  function clampPoint(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  // 竖屏手机打开「横屏全屏签名」时，弹窗整体被 CSS rotate-90 旋转，
  // 画布视觉尺寸与布局尺寸互换。此时落笔坐标做了反向映射，位图本身是侧着的，
  // 导出/回显都需要相应转正，否则存下来的签名会旋转 90°。
  function isQuarterRotated(canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const { width, height } = canvasCssSize(canvas);
    const hasTransformedBounds = Math.abs(rect.width - width) > 2 || Math.abs(rect.height - height) > 2;
    return hasTransformedBounds && Math.abs(rect.width - height) < 2 && Math.abs(rect.height - width) < 2;
  }

  function transformedCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    const { width, height } = canvasCssSize(canvas);
    const rectWidth = Math.max(1, rect.width);
    const rectHeight = Math.max(1, rect.height);
    const getBoxQuads = (canvas as HTMLCanvasElement & {
      getBoxQuads?: () => Array<{
        p1: { x: number; y: number };
        p2: { x: number; y: number };
        p4: { x: number; y: number };
      }>;
    }).getBoxQuads;
    const quad = getBoxQuads?.call(canvas)?.[0];
    if (quad) {
      const xAxis = { x: quad.p2.x - quad.p1.x, y: quad.p2.y - quad.p1.y };
      const yAxis = { x: quad.p4.x - quad.p1.x, y: quad.p4.y - quad.p1.y };
      const pointer = { x: clientX - quad.p1.x, y: clientY - quad.p1.y };
      const determinant = xAxis.x * yAxis.y - xAxis.y * yAxis.x;
      if (Math.abs(determinant) > 0.001) {
        const xRatio = (pointer.x * yAxis.y - pointer.y * yAxis.x) / determinant;
        const yRatio = (xAxis.x * pointer.y - xAxis.y * pointer.x) / determinant;
        return {
          x: clampPoint(xRatio * width, 0, width),
          y: clampPoint(yRatio * height, 0, height),
        };
      }
    }

    const hasTransformedBounds = Math.abs(rectWidth - width) > 2 || Math.abs(rectHeight - height) > 2;
    const quarterRotated = hasTransformedBounds && Math.abs(rectWidth - height) < 2 && Math.abs(rectHeight - width) < 2;
    if (quarterRotated) {
      const relativeX = clientX - rect.left;
      const relativeY = clientY - rect.top;
      return {
        x: clampPoint((relativeY / rectHeight) * width, 0, width),
        y: clampPoint(height - (relativeX / rectWidth) * height, 0, height),
      };
    }

    return {
      x: clampPoint(((clientX - rect.left) / rectWidth) * width, 0, width),
      y: clampPoint(((clientY - rect.top) / rectHeight) * height, 0, height),
    };
  }

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = canvasCssSize(canvas);
    const ratio = window.devicePixelRatio || 1;
    const snapshot = value;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    const styles = window.getComputedStyle(document.documentElement);
    const backgroundColor = styles.getPropertyValue("--card").trim() || styles.getPropertyValue("--background").trim() || "#ffffff";
    const foregroundColor = styles.getPropertyValue("--foreground").trim() || "#111827";
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, width, height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2;
    context.strokeStyle = foregroundColor;
    if (snapshot) {
      const image = new Image();
      image.onload = () => {
        if (isQuarterRotated(canvas)) {
          // 画布被旋转 90° 展示：把图片反向转进画布，用户看到的才是正的
          const scale = Math.min(height / image.width, width / image.height);
          const drawWidth = image.width * scale;
          const drawHeight = image.height * scale;
          context.save();
          context.translate(width / 2, height / 2);
          context.rotate(-Math.PI / 2);
          context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
          context.restore();
          return;
        }
        const scale = Math.min(width / image.width, height / image.height);
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      };
      image.src = snapshot;
    }
  }, [value]);

  useEffect(() => {
    let frame = 0;
    const scheduleSetup = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(setupCanvas);
    };
    setupCanvas();
    window.addEventListener("resize", scheduleSetup);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleSetup) : null;
    if (canvasRef.current) observer?.observe(canvasRef.current);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleSetup);
      observer?.disconnect();
    };
  }, [setupCanvas]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    return transformedCanvasPoint(canvas, event.clientX, event.clientY);
  }

  function begin(event: React.PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = point(event);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const last = lastPointRef.current;
    const next = point(event);
    if (!context || !last) return;
    context.beginPath();
    context.moveTo(last.x, last.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    lastPointRef.current = next;
  }

  function end(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const canvas = canvasRef.current;
    let dataUrl = "";
    if (canvas) {
      if (isQuarterRotated(canvas)) {
        // 画布被 CSS 旋转 90°：导出时把位图转正，保证存下来的签名是正的
        const output = document.createElement("canvas");
        output.width = canvas.height;
        output.height = canvas.width;
        const outputContext = output.getContext("2d");
        if (outputContext) {
          outputContext.translate(output.width / 2, output.height / 2);
          outputContext.rotate(Math.PI / 2);
          outputContext.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
          dataUrl = output.toDataURL("image/png");
        }
      }
      if (!dataUrl) dataUrl = canvas.toDataURL("image/png");
    }
    onChange(dataUrl);
  }

  function clear() {
    onChange("");
    window.requestAnimationFrame(setupCanvas);
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border bg-card">
        <canvas
          ref={canvasRef}
          className={`block w-full touch-none ${canvasClassName}`}
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      </div>
      <Button type="button" variant="outline" size="sm" className={actionsClassName} onClick={clear}>
        <RotateCcw className="h-4 w-4" />
        清除签名
      </Button>
    </div>
  );
}

export function FullscreenSignatureDialog({
  open,
  value,
  onOpenChange,
  onChange,
}: {
  open: boolean;
  value: string;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
}) {
  const [draftValue, setDraftValue] = useState(value);
  const [signatureViewport, setSignatureViewport] = useState(() => ({
    touch: typeof window !== "undefined" ? window.matchMedia("(hover: none), (pointer: coarse)").matches : false,
    landscape: typeof window !== "undefined" ? window.matchMedia("(orientation: landscape)").matches : false,
  }));

  useEffect(() => {
    if (open) setDraftValue(value);
  }, [open, value]);

  useEffect(() => {
    const touchMedia = window.matchMedia("(hover: none), (pointer: coarse)");
    const landscapeMedia = window.matchMedia("(orientation: landscape)");
    const updateLayout = () => setSignatureViewport({
      touch: touchMedia.matches,
      landscape: landscapeMedia.matches,
    });
    updateLayout();
    touchMedia.addEventListener("change", updateLayout);
    landscapeMedia.addEventListener("change", updateLayout);
    window.addEventListener("resize", updateLayout);
    return () => {
      touchMedia.removeEventListener("change", updateLayout);
      landscapeMedia.removeEventListener("change", updateLayout);
      window.removeEventListener("resize", updateLayout);
    };
  }, []);

  const dialogClassName = signatureViewport.touch
    ? signatureViewport.landscape
      ? "!fixed !inset-0 !left-0 !top-0 !h-[100dvh] !max-h-none !w-[100dvw] !max-w-none !translate-x-0 !translate-y-0 overflow-hidden rounded-none border-0 p-3 shadow-none sm:!max-w-none"
      : "h-[100dvw] max-h-none w-[100dvh] max-w-none rotate-90 overflow-hidden rounded-none border-0 p-3"
    : "h-[90dvh] max-h-none w-[90vw] max-w-none overflow-hidden rounded-lg border p-4";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={dialogClassName}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex h-full min-h-0 flex-col gap-3">
          <DialogHeader className="shrink-0 text-left">
            <DialogTitle className="text-base">横屏全屏签名</DialogTitle>
            <DialogDescription>请客户在横向区域内完成签名。</DialogDescription>
          </DialogHeader>
          <SignaturePad
            value={draftValue}
            onChange={setDraftValue}
            className="flex min-h-0 flex-1 flex-col"
            canvasClassName="h-full flex-1"
            actionsClassName="hidden"
          />
          <DialogFooter className="shrink-0 flex-row justify-end">
            <Button type="button" variant="outline" onClick={() => setDraftValue("")}>
              <RotateCcw className="h-4 w-4" />
              清除
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              type="button"
              onClick={() => {
                onChange(draftValue);
                onOpenChange(false);
              }}
            >
              保存签名
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function InlineError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </div>
  );
}

export function hasPreviewValue(value?: string | number | null) {
  return String(value ?? "").trim() !== "";
}

export function ReportPreviewField({ label, value, className = "" }: { label: string; value?: string | number | null; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm leading-6 text-foreground">{displayText(value)}</div>
    </div>
  );
}

export function ReportPreviewBlock({ label, value, markdown = false }: { label: string; value?: string | number | null; markdown?: boolean }) {
  const displayValue = displayText(value);
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 rounded-lg border bg-muted/25 px-3 py-2 text-sm leading-6 text-foreground ${markdown ? "" : "whitespace-pre-wrap"}`}>
        {markdown && displayValue !== "-" ? <MarkdownContent content={displayValue} /> : displayValue}
      </div>
    </div>
  );
}



export function markdownReplacement(action: MarkdownAction, selected: string) {
  const value = selected || "";
  if (action === "heading") return { text: `## ${value || "小标题"}`, placeholder: value ? "" : "小标题" };
  if (action === "bold") return { text: `**${value || "重点内容"}**`, placeholder: value ? "" : "重点内容" };
  if (action === "inlineCode") return { text: `\`${value || "命令或错误代码"}\``, placeholder: value ? "" : "命令或错误代码" };
  if (action === "codeBlock") {
    return { text: `\`\`\`\n${value || "粘贴命令、日志或错误代码"}\n\`\`\``, placeholder: value ? "" : "粘贴命令、日志或错误代码" };
  }
  if (action === "link") return { text: `[${value || "链接文字"}](https://example.com)`, placeholder: value ? "https://example.com" : "链接文字" };
  if (action === "numbered") {
    const lines = (value || "列表项").split("\n");
    return { text: lines.map((line, index) => `${index + 1}. ${line || "列表项"}`).join("\n"), placeholder: value ? "" : "列表项" };
  }
  const lines = (value || "列表项").split("\n");
  return { text: lines.map((line) => `- ${line || "列表项"}`).join("\n"), placeholder: value ? "" : "列表项" };
}

export function MarkdownTextarea({
  value,
  onChange,
  rows = 6,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function applyMarkdown(action: MarkdownAction) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    const replacement = markdownReplacement(action, selected);
    const next = `${value.slice(0, start)}${replacement.text}${value.slice(end)}`;
    onChange(next);
    window.requestAnimationFrame(() => {
      const current = textareaRef.current;
      if (!current) return;
      current.focus();
      if (replacement.placeholder) {
        const placeholderStart = replacement.text.indexOf(replacement.placeholder);
        if (placeholderStart >= 0) {
          current.setSelectionRange(start + placeholderStart, start + placeholderStart + replacement.placeholder.length);
          return;
        }
      }
      const nextCursor = start + replacement.text.length;
      current.setSelectionRange(nextCursor, nextCursor);
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-background shadow-sm focus-within:border-primary/60 focus-within:ring-[3px] focus-within:ring-primary/15">
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 p-1.5">
        {MARKDOWN_TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <Button
              key={tool.action}
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground"
              title={tool.label}
              aria-label={tool.label}
              onClick={() => applyMarkdown(tool.action)}
            >
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}
      </div>
      <Textarea
        ref={textareaRef}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[180px] resize-y rounded-none border-0 shadow-none hover:bg-white focus-visible:border-transparent focus-visible:ring-0"
      />
    </div>
  );
}

export function Field({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-2">
      <Label className="block text-sm font-medium text-foreground">
        {required ? <span className="mr-0.5 text-destructive">*</span> : null}{label}
      </Label>
      {children}
    </div>
  );
}

export function DateTimeFieldControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { date, time } = splitInputDateTime(value);
  const [draftDate, setDraftDate] = useState(date || inputToday());

  useEffect(() => {
    setDraftDate(date || inputToday());
  }, [date]);

  function setDate(nextDate: string) {
    const effectiveDate = nextDate || inputToday();
    setDraftDate(effectiveDate);
    if (time) onChange(`${effectiveDate}T${time}`);
  }

  function setTime(nextTime: string) {
    if (!nextTime) {
      onChange("");
      return;
    }
    onChange(`${draftDate || inputToday()}T${nextTime}`);
  }

  return (
    <div className={`grid min-w-0 gap-2 ${value ? "grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_auto]" : "grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]"}`}>
      <input
        aria-label={`${label}日期`}
        type="date"
        value={draftDate}
        onChange={(event) => setDate(event.target.value)}
        onPointerDown={openPickerOnMouse}
        className="h-9 min-w-0 cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-900 shadow-sm [color-scheme:light] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
      />
      <NativeTimeInput label={label} time={time} onTimeChange={setTime} />
      {value ? (
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => onChange("")} aria-label={`清空${label}`}>
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}

export function DenseField({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground md:hidden">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function ReportSection({
  title,
  icon: Icon,
  step: _step,
  tag,
  action,
  sectionId,
  children,
}: {
  title: string;
  icon?: typeof FileText;
  step?: number;
  tag?: string;
  action?: React.ReactNode;
  /** 分区导航锚点（渲染为 report-section-{sectionId}），供 SectionNav 跳转与激活跟踪 */
  sectionId?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={sectionId ? `report-section-${sectionId}` : undefined} className="scroll-mt-24 rounded-lg border bg-card shadow-sm">
      <div className="flex min-h-[52px] items-center justify-between gap-3 px-3 py-3 sm:min-h-[64px] sm:px-5 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          {Icon ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
            {tag ? <div className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{tag}</div> : null}
          </div>
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      <div className="border-t border-border/70">{children}</div>
    </section>
  );
}

