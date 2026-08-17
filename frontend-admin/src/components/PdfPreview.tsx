import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/ui/button";

interface PdfPreviewProps {
  data: Uint8Array;
  title?: string;
}

interface PdfPageProps {
  document: PDFDocumentProxy;
  pageNumber: number;
  containerWidth: number;
  zoom: number;
}

function PdfPage({ document, pageNumber, containerWidth, zoom }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let page: PDFPageProxy | null = null;
    let renderTask: ReturnType<PDFPageProxy["render"]> | null = null;

    void document.getPage(pageNumber).then((loadedPage) => {
      page = loadedPage;
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;

      const baseViewport = loadedPage.getViewport({ scale: 1 });
      const availableWidth = Math.max(280, containerWidth - 32);
      const cssScale = (availableWidth / baseViewport.width) * zoom;
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const renderViewport = loadedPage.getViewport({ scale: cssScale * outputScale });
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("浏览器无法创建 PDF 画布");

      canvas.width = Math.ceil(renderViewport.width);
      canvas.height = Math.ceil(renderViewport.height);
      canvas.style.width = `${Math.ceil(baseViewport.width * cssScale)}px`;
      canvas.style.height = `${Math.ceil(baseViewport.height * cssScale)}px`;

      renderTask = loadedPage.render({ canvas, canvasContext: context, viewport: renderViewport });
      return renderTask.promise;
    }).then(() => {
      if (!cancelled) setError("");
    }).catch((reason) => {
      if (cancelled || reason?.name === "RenderingCancelledException") return;
      setError(reason instanceof Error ? reason.message : "PDF 页面渲染失败");
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      page?.cleanup();
    };
  }, [containerWidth, document, pageNumber, zoom]);

  if (error) {
    return <div className="flex min-h-48 items-center justify-center rounded-lg border bg-background p-6 text-sm text-destructive">第 {pageNumber} 页：{error}</div>;
  }

  return (
    <div className="flex justify-center">
      <canvas
        ref={canvasRef}
        data-pdf-page={pageNumber}
        className="max-w-none rounded-sm bg-white shadow-sm"
        aria-label={`PDF 第 ${pageNumber} 页`}
      />
    </div>
  );
}

export function PdfPreview({ data, title = "PDF 附件预览" }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateWidth = () => setContainerWidth(container.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    setDocument(null);
    setLoading(true);
    setError("");
    setZoom(1);

    void import("pdfjs-dist").then((pdfjs) => {
      if (cancelled) return null;
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      loadingTask = pdfjs.getDocument({ data });
      return loadingTask.promise;
    }).then((nextDocument) => {
      if (!nextDocument || cancelled) return;
      setDocument(nextDocument);
    }).catch((reason) => {
      if (cancelled) return;
      setError(reason instanceof Error ? reason.message : "PDF 文件解析失败");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      if (loadingTask) void loadingTask.destroy();
    };
  }, [data]);

  const pageNumbers = document ? Array.from({ length: document.numPages }, (_, index) => index + 1) : [];

  return (
    <div ref={containerRef} className="flex min-h-[360px] flex-col overflow-hidden rounded-lg border bg-slate-200" aria-label={title}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
        <span className="text-xs text-muted-foreground">
          {document ? `${document.numPages} 页` : loading ? "正在解析 PDF…" : "PDF 预览"}
        </span>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(1))))} disabled={!document || zoom <= 0.5} aria-label="缩小 PDF">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="w-14 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button type="button" variant="outline" size="icon" onClick={() => setZoom((value) => Math.min(2, Number((value + 0.1).toFixed(1))))} disabled={!document || zoom >= 2} aria-label="放大 PDF">
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="h-[64dvh] min-h-[300px] overflow-auto p-4">
        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center gap-2 text-sm text-muted-foreground">
            <span className="btn-loader" aria-hidden="true" />
            正在渲染 PDF…
          </div>
        ) : error ? (
          <div className="flex min-h-[300px] items-center justify-center px-6 text-center text-sm text-destructive">
            PDF 预览失败：{error}。请下载文件后查看。
          </div>
        ) : document && containerWidth ? (
          <div data-pdf-rendered-pages={document.numPages} className="space-y-4">
            {pageNumbers.map((pageNumber) => (
              <PdfPage key={pageNumber} document={document} pageNumber={pageNumber} containerWidth={containerWidth} zoom={zoom} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
