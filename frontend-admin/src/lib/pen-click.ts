import * as React from "react";

/**
 * iPad Apple Pencil 点按钮时浏览器可能不派发 click（2026-09-11 起多次 iPad 用户反馈：
 * 笔点不动、手指正常；签核确认、附件预览弹窗关闭/缩放/下载均中招）。
 * 根因：笔尖在玻璃屏幕点按时易产生 3~12px 微滑移，或触发 iPadOS 随手写（Scribble）手势探测，
 * 导致 WebKit 吞掉兼容性 mousedown 与原生 click。
 *
 * 双层兜底策略：
 * 1. 组件级 `usePenClick`：供共享 `<Button>` / `<DialogClose>` 等直接挂载。
 * 2. 全局级 `installGlobalPenClickFallback`：在 document 层监听 `pointerType === "pen"` 的轻点（位移 ≤ 18px、时长 ≤ 650ms），
 *    自动为全站原生 `<button>`、`<a>`、`[role="button"]`、Tab、复选框、可点击卡片与表格行补发一次合成 click，
 *    并在捕获阶段拦截 500ms 内可能迟到的原生 click，彻底杜绝漏点与双触发；同时避开 `<canvas>` 手写签名与长列表滚动。
 */

let lastHookPenUpAt = 0;

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
      const now = Date.now();
      lastPenUpAtRef.current = now;
      lastHookPenUpAt = now;
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

const PEN_TAP_MAX_DISTANCE_PX = 18;
const PEN_TAP_MAX_DURATION_MS = 650;
const PEN_CLICK_DEDUP_WINDOW_MS = 500;

const CLICKABLE_SELECTOR = [
  "button",
  "a[href]",
  "summary",
  '[role="button"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="radio"]',
  "[data-pen-clickable]",
].join(",");

const EXCLUDED_SELECTOR = [
  "canvas",
  "textarea",
  "select",
  '[contenteditable="true"]',
  "[data-radix-collection-item]",
  '[role="menuitem"]',
  '[role="option"]',
  'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"])',
].join(",");

function findPenClickableTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  if (node.closest(EXCLUDED_SELECTOR)) return null;
  const matched = node.closest(CLICKABLE_SELECTOR);
  if (matched instanceof HTMLElement) return matched;
  const row = node.closest("tr");
  if (row instanceof HTMLElement && (row.classList.contains("cursor-pointer") || window.getComputedStyle(row).cursor === "pointer")) {
    return row;
  }
  return null;
}

let globalPenInstalled = false;

export function installGlobalPenClickFallback(): void {
  if (globalPenInstalled || typeof document === "undefined") return;
  globalPenInstalled = true;

  let downState: {
    pointerId: number;
    x: number;
    y: number;
    at: number;
    clickable: HTMLElement | null;
  } | null = null;

  let lastSynthetic: { node: HTMLElement; at: number } | null = null;

  document.addEventListener(
    "pointerdown",
    (event: PointerEvent) => {
      if (event.pointerType !== "pen" || event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest("canvas")) {
        downState = null;
        return;
      }
      downState = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        at: Date.now(),
        clickable: findPenClickableTarget(event.target),
      };
    },
    true,
  );

  document.addEventListener(
    "pointercancel",
    (event: PointerEvent) => {
      if (downState && event.pointerId === downState.pointerId) {
        downState = null;
      }
    },
    true,
  );

  document.addEventListener("pointerup", (event: PointerEvent) => {
    if (event.pointerType !== "pen" || event.button !== 0) return;
    const start = downState;
    downState = null;
    // 若已由组件级 usePenClick 处理，直接跳过避免重复合成
    if (Date.now() - lastHookPenUpAt < 60) return;
    if (!start || start.pointerId !== event.pointerId || !start.clickable) return;

    const duration = Date.now() - start.at;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (duration > PEN_TAP_MAX_DURATION_MS || distance > PEN_TAP_MAX_DISTANCE_PX) return;

    const upClickable = findPenClickableTarget(event.target);
    if (!upClickable || (upClickable !== start.clickable && !start.clickable.contains(upClickable))) return;
    if (!upClickable.isConnected) return;
    if ((upClickable as HTMLButtonElement).disabled || upClickable.getAttribute("aria-disabled") === "true") return;

    lastSynthetic = { node: upClickable, at: Date.now() };
    upClickable.click();
  });

  document.addEventListener(
    "click",
    (event: MouseEvent) => {
      if (!event.isTrusted || !lastSynthetic) return;
      if (Date.now() - lastSynthetic.at > PEN_CLICK_DEDUP_WINDOW_MS) {
        lastSynthetic = null;
        return;
      }
      const target = event.target;
      if (target instanceof Node && (lastSynthetic.node === target || lastSynthetic.node.contains(target))) {
        lastSynthetic = null;
        event.stopPropagation();
        event.preventDefault();
      }
    },
    true,
  );
}
