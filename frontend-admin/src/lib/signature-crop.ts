/**
 * 手写签名裁剪：把整张画布裁剪到笔迹包围盒（含留白），输出紧凑 PNG dataURL。
 * 签名图只含笔迹本身，归档/打印渲染时大小才能统一；同时显著减小 dataURL 体积。
 * 背景色以左上角像素为基准，兼容白底/卡片底/透明底画布；无笔迹时返回空串。
 */
export function cropSignatureDataUrl(canvas: HTMLCanvasElement): string {
  const context = canvas.getContext("2d");
  if (!context) return canvas.toDataURL("image/png");
  const { width, height } = canvas;
  if (!width || !height) return "";
  const pixels = context.getImageData(0, 0, width, height).data;
  const bgR = pixels[0];
  const bgG = pixels[1];
  const bgB = pixels[2];
  const bgTransparent = pixels[3] < 24;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (pixels[offset + 3] < 24) continue; // 透明区域不算笔迹
      // 背景透明时可见像素即笔迹；背景不透明时按色差判定
      if (!bgTransparent) {
        const diff = Math.abs(pixels[offset] - bgR) + Math.abs(pixels[offset + 1] - bgG) + Math.abs(pixels[offset + 2] - bgB);
        if (diff <= 48) continue;
      }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return ""; // 无笔迹

  // 归一化：笔迹 + 四边各 15% 留白（横竖分别按笔迹宽/高计算，不够就向外扩），
  // 横竖两个方向笔迹占比都恒定为 1/1.3，固定高度渲染时笔迹视觉大小一致。
  const inkW = maxX - minX + 1;
  const inkH = maxY - minY + 1;
  const padX = Math.max(8, Math.round(inkW * 0.15));
  const padY = Math.max(8, Math.round(inkH * 0.15));
  const outW = inkW + padX * 2;
  const outH = inkH + padY * 2;

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const outContext = out.getContext("2d");
  if (!outContext) return canvas.toDataURL("image/png");
  if (!bgTransparent) {
    outContext.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
    outContext.fillRect(0, 0, outW, outH);
  }
  outContext.drawImage(canvas, minX, minY, inkW, inkH, padX, padY, inkW, inkH);
  return out.toDataURL("image/png");
}
