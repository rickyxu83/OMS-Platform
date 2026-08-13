import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Maximize2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  // 异步图片回画令牌：value 变化（尤其是清空）后，旧图片的 onload 不得再回画，避免"清除后残影复活"
  const drawTokenRef = useRef(0);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const token = ++drawTokenRef.current;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, rect.width, rect.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = "#111827";
    if (value) {
      const image = new Image();
      image.onload = () => {
        if (drawTokenRef.current !== token) return;
        const scale = Math.min(rect.width / image.width, rect.height / image.height);
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        context.drawImage(image, (rect.width - drawWidth) / 2, (rect.height - drawHeight) / 2, drawWidth, drawHeight);
      };
      image.src = value;
    }
  }, [value]);

  useEffect(() => {
    setupCanvas();
    window.addEventListener("resize", setupCanvas);
    return () => window.removeEventListener("resize", setupCanvas);
  }, [setupCanvas]);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function begin(event: PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
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
    onChange(canvasRef.current?.toDataURL("image/png") || "");
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
