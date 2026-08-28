import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Maximize2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cropSignatureDataUrl } from "@/lib/signature-crop";

interface SignatureCanvasProps {
  value: string;
  onChange: (value: string) => void;
  wrapperClassName: string;
  canvasClassName: string;
  placeholder?: string;
}

/** 手写签名画布：笔迹在每次落笔结束时通过 onChange 输出 PNG dataURL；value 变化时整体重绘。 */
function SignatureCanvas({ value, onChange, wrapperClassName, canvasClassName, placeholder }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  // 画布当前像素对应的 value：笔迹结束回传的 value 与本画布内容一致，重绘时跳过
  // （否则会把我迹裁剪图拉伸铺满画布——“第一笔变很大”的根因）
  const drawnValueRef = useRef("");
  // 异步图片回画令牌：value 变化（尤其是清空）后，旧图片的 onload 不得再回画，避免"清除后残影复活"
  const drawTokenRef = useRef(0);
  // 旋转/尺寸变化防抖定时器：等 iOS 旋转动画结束后再重设画布，避免读到中间尺寸
  const resizeTimerRef = useRef<number | null>(null);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const token = ++drawTokenRef.current;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const targetW = Math.max(1, Math.round(rect.width * ratio));
    const targetH = Math.max(1, Math.round(rect.height * ratio));
    // 尺寸没变且当前显示正是这份 value（笔迹回传触发的重绘）：像素已正确，直接跳过
    if (canvas.width === targetW && canvas.height === targetH && drawnValueRef.current === value) return;
    canvas.width = targetW;
    canvas.height = targetH;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, rect.width, rect.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = "#111827";
    drawnValueRef.current = value;
    if (value) {
      const image = new Image();
      image.onload = () => {
        if (drawTokenRef.current !== token) return;
        // 裁剪图是设备像素：换回 CSS 尺寸（÷ratio）后只缩不放，绝不上采样——恢复/重绘不再放大笔迹
        const naturalW = image.width / ratio;
        const naturalH = image.height / ratio;
        const scale = Math.min(1, rect.width / naturalW, rect.height / naturalH);
        const drawWidth = naturalW * scale;
        const drawHeight = naturalH * scale;
        context.drawImage(image, (rect.width - drawWidth) / 2, (rect.height - drawHeight) / 2, drawWidth, drawHeight);
      };
      image.src = value;
    }
  }, [value]);

  // 落笔前校验画布像素尺寸与当前实际尺寸一致：不一致说明经历旋转/布局变化后未重设，立即重设，避免第一笔坐标系漂移
  const ensureCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const targetW = Math.max(1, Math.round(rect.width * ratio));
    const targetH = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== targetW || canvas.height !== targetH) setupCanvas();
  }, [setupCanvas]);

  useEffect(() => {
    setupCanvas();
    const scheduleSetup = () => {
      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = window.setTimeout(() => {
        resizeTimerRef.current = null;
        setupCanvas();
      }, 300);
    };
    window.addEventListener("resize", scheduleSetup);
    window.addEventListener("orientationchange", scheduleSetup);
    return () => {
      window.removeEventListener("resize", scheduleSetup);
      window.removeEventListener("orientationchange", scheduleSetup);
      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
    };
  }, [setupCanvas]);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function begin(event: PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    // 落笔前强制坐标系对齐（旋转后第一笔漂移的兜底修复）
    ensureCanvasSize();
    drawingRef.current = true;
    lastPointRef.current = point(event);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    event.preventDefault();
    const context = canvasRef.current?.getContext("2d");
    const last = lastPointRef.current;
    const next = point(event);
    if (!context || !last) return;
    context.beginPath();
    context.moveTo(last.x, last.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    lastPointRef.current = next;
  }

  function end(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const canvas = canvasRef.current;
    const next = canvas ? cropSignatureDataUrl(canvas) : "";
    drawnValueRef.current = next; // 标记本画布已显示此 value，阻止紧随其后的重绘把它拉伸放大
    onChange(next);
  }

  return (
    <div className={wrapperClassName}>
      <canvas
        ref={canvasRef}
        className={canvasClassName}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      {!value && placeholder ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm font-medium text-slate-400">
          {placeholder}
        </div>
      ) : null}
    </div>
  );
}

export function SignatureCapture({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [landscapeOpen, setLandscapeOpen] = useState(false);
  const [portrait, setPortrait] = useState(() => window.innerHeight >= window.innerWidth);

  useEffect(() => {
    if (!landscapeOpen) return;
    const syncOrientation = () => setPortrait(window.innerHeight >= window.innerWidth);
    syncOrientation();
    window.addEventListener("resize", syncOrientation);
    window.addEventListener("orientationchange", syncOrientation);
    return () => {
      window.removeEventListener("resize", syncOrientation);
      window.removeEventListener("orientationchange", syncOrientation);
    };
  }, [landscapeOpen]);

  // 清除只改 value：各画布靠 value 变化整体重绘为空白（旧版 rAF 调用旧闭包 + 异步图片回画，导致需点两次）
  const clear = () => onChange("");

  return (
    <div className="space-y-2">
      <SignatureCanvas
        value={value}
        onChange={onChange}
        wrapperClassName="relative overflow-hidden rounded-lg border border-dashed bg-white"
        canvasClassName="block h-56 w-full touch-none"
        placeholder="请在此处手写签名"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          <RotateCcw className="h-4 w-4" />
          清除签名
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setLandscapeOpen(true)}>
          <Maximize2 className="h-4 w-4" />
          横屏签名
        </Button>
      </div>
      {landscapeOpen
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex flex-col bg-background">
              <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
                <span className="text-sm font-medium">横屏签名</span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={clear}>
                    <RotateCcw className="h-4 w-4" />
                    清除
                  </Button>
                  <Button type="button" size="sm" onClick={() => setLandscapeOpen(false)}>
                    <X className="h-4 w-4" />
                    完成
                  </Button>
                </div>
              </div>
              {portrait ? (
                <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-800">
                  当前为竖屏，将手机旋转至横屏可获得更大的签名空间。
                </div>
              ) : null}
              <div className="min-h-0 flex-1 p-3">
                <SignatureCanvas
                  value={value}
                  onChange={onChange}
                  wrapperClassName="relative h-full w-full overflow-hidden rounded-lg border bg-white"
                  canvasClassName="block h-full w-full touch-none"
                  placeholder="请在此处手写签名"
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
