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

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const alpha = pixels[offset + 3];
      if (alpha < 24) continue; // 透明区域不算笔迹
      const diff = Math.abs(pixels[offset] - bgR) + Math.abs(pixels[offset + 1] - bgG) + Math.abs(pixels[offset + 2] - bgB);
      if (diff > 48) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return ""; // 无笔迹

  const pad = Math.max(8, Math.round(Math.max(maxX - minX, maxY - minY) * 0.15));
  const cropX = Math.max(0, minX - pad);
  const cropY = Math.max(0, minY - pad);
  const cropW = Math.min(width, maxX + pad + 1) - cropX;
  const cropH = Math.min(height, maxY + pad + 1) - cropY;

  const out = document.createElement("canvas");
  out.width = cropW;
  out.height = cropH;
  const outContext = out.getContext("2d");
  if (!outContext) return canvas.toDataURL("image/png");
  outContext.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
  outContext.fillRect(0, 0, cropW, cropH);
  outContext.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return out.toDataURL("image/png");
}
