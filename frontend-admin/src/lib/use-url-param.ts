import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * 与 URL 查询参数双向绑定的 state hook。
 *
 * - 初始化时从 URL 读取（支持深链/刷新恢复）
 * - 变更后通过 effect 写回 URL（replace，不刷浏览器历史）
 * - 值为默认值或空字符串时从 URL 删除该参数，保持地址栏干净
 *
 * 用于页签、列表筛选等需要"刷新后保持当前位置"的状态。
 * 与 useState 完全同构（支持函数式更新）：
 *   const [value, setValue] = useUrlParam("status", "all")
 */
export function useUrlParam(key: string, defaultValue = "") {
  const [searchParams, setSearchParams] = useSearchParams();
  const [value, setValue] = useState(() => searchParams.get(key) ?? defaultValue);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const current = prev.get(key) ?? defaultValue;
        if (current === value) return prev;
        const next = new URLSearchParams(prev);
        if (value && value !== defaultValue) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }, [key, value, defaultValue, setSearchParams]);

  return [value, setValue] as const;
}
