import * as React from "react";

/**
 * iPad Apple Pencil 点按钮时浏览器可能不派发 click（2026-09-11 起多次 iPad 用户反馈：
 * 笔点不动、手指正常；签核确认、附件预览弹窗关闭/缩放/下载均中招）。
 *
 * 兜底策略：pen 指针 pointerup 时合成一次 click（isTrusted=false，直接放行执行）；
 * 若浏览器随后仍补发原生 click（isTrusted=true），在 500ms 窗口内去重，避免同次点按执行两遍。
 * 合成 click 走原生派发，因此 form submit、Radix Trigger/Close 等依赖真实 click 的行为也一并覆盖。
 *
 * 用法：const penHandlers = usePenClick({ onClick, onPointerUp, disabled })，然后 {...penHandlers} 铺到元素上。
 */
export function usePenClick<T extends HTMLElement>(options: {
  onClick?: React.MouseEventHandler<T>;
  onPointerUp?: React.PointerEventHandler<T>;
  disabled?: boolean;
}): { onClick: React.MouseEventHandler<T>; onPointerUp: React.PointerEventHandler<T> } {
  const { onClick, onPointerUp, disabled } = options;
  const lastPenUpAtRef = React.useRef(0);
  return {
    onPointerUp: (event) => {
      onPointerUp?.(event);
      if (disabled || event.pointerType !== "pen" || event.button !== 0) return;
      lastPenUpAtRef.current = Date.now();
      // currentTarget 在回调返回后会被 React 置空，先取引用
      event.currentTarget.click();
    },
    onClick: (event) => {
      // 合成 click（isTrusted=false）直接放行；同次点按若浏览器补发原生 click（isTrusted=true）则去重
      if (event.isTrusted && Date.now() - lastPenUpAtRef.current < 500) {
        lastPenUpAtRef.current = 0;
        return;
      }
      onClick?.(event);
    },
  };
}
