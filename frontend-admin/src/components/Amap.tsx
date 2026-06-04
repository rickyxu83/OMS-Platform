import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";

const AMAP_JSAPI_KEY =
  (import.meta as any).env.VITE_AMAP_JSAPI_KEY?.trim() ||
  (import.meta as any).env.VITE_AMAP_KEY?.trim() ||
  "";
const AMAP_SECURITY_JS_CODE =
  (import.meta as any).env.VITE_AMAP_SECURITY_JS_CODE?.trim() || "";

export const AMAP_CONFIGURED = Boolean(AMAP_JSAPI_KEY && AMAP_SECURITY_JS_CODE);

interface AmapPoint {
  id: string | number;
  name: string;
  lng: number;
  lat: number;
  annualServices?: number;
  level?: "peak" | "high" | "active" | "quiet";
  address?: string;
  contact?: string;
  phone?: string;
  [k: string]: any;
}

interface AmapProps {
  center?: { lng: number; lat: number; name?: string };
  points?: AmapPoint[];
  zoom?: number;
  height?: number | string;
  onPointClick?: (point: AmapPoint) => void;
  className?: string;
}

let amapLoaderPromise: Promise<any> | null = null;

function loadAMapScript(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("AMap 需在浏览器环境"));
  if ((window as any).AMap?.Map) return Promise.resolve((window as any).AMap);
  if (amapLoaderPromise) return amapLoaderPromise;
  if (!AMAP_JSAPI_KEY || !AMAP_SECURITY_JS_CODE) {
    return Promise.reject(new Error("未配置 AMap JSAPI 密钥或安全密钥"));
  }
  (window as any)._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_JS_CODE };
  amapLoaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-amap-jsapi="true"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).AMap), { once: true });
      existing.addEventListener("error", () => reject(new Error("AMap JSAPI 加载失败")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.defer = true;
    script.dataset.amapJsapi = "true";
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(AMAP_JSAPI_KEY)}`;
    script.onload = () => resolve((window as any).AMap);
    script.onerror = () => reject(new Error("AMap JSAPI 加载失败"));
    document.head.appendChild(script);
  }).catch((err) => {
    amapLoaderPromise = null;
    throw err;
  });
  return amapLoaderPromise;
}

function getTier(count: number): "peak" | "high" | "active" | "quiet" {
  if (count >= 10) return "peak";
  if (count >= 4) return "high";
  if (count >= 1) return "active";
  return "quiet";
}

function buildMarkerEl(point: AmapPoint, onClick?: (p: AmapPoint) => void): HTMLElement {
  const tier = point.level || getTier(point.annualServices || 0);
  const el = document.createElement("button");
  el.type = "button";
  el.className = `amap-marker amap-marker-tier-${tier}`;
  el.setAttribute("aria-label", `${point.name}，年服务 ${point.annualServices || 0} 次`);
  el.dataset.id = String(point.id);

  const dot = document.createElement("span");
  dot.className = "amap-marker-dot";
  el.appendChild(dot);

  if (point.annualServices && point.annualServices > 0) {
    const label = document.createElement("span");
    label.className = "amap-marker-label";
    label.textContent = `${point.annualServices}`;
    el.appendChild(label);
  }

  if (onClick) {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick(point);
    });
  }
  return el;
}

export function Amap({
  center = { lng: 120.71518, lat: 31.31962, name: "苏州工业园区和乔丽晶" },
  points = [],
  zoom = 9,
  height = 400,
  onPointClick,
  className = "",
}: AmapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);
  const [state, setState] = useState<"loading" | "ready" | "fallback" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!AMAP_CONFIGURED) {
      setState("fallback");
      setErrorMsg("未配置 AMap JSAPI 密钥");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const AMap = await loadAMapScript();
        if (cancelled || !containerRef.current) return;
        if (mapRef.current) {
          mapRef.current.destroy();
          mapRef.current = null;
        }
        const map = new AMap.Map(containerRef.current, {
          zoom,
          center: [center.lng, center.lat],
          mapStyle: "amap://styles/light",
          viewMode: "2D",
        });
        mapRef.current = map;
        infoWindowRef.current = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -10), autoMove: true });
        setState("ready");
      } catch (e: any) {
        if (cancelled) return;
        setState("error");
        setErrorMsg(e?.message || "地图加载失败");
      }
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (state !== "ready" || !mapRef.current) return;
    const AMap = (window as any).AMap;
    markersRef.current.forEach((m) => { mapRef.current.remove(m); });
    markersRef.current = [];

    const centerMarker = new AMap.Marker({
      position: [center.lng, center.lat],
      content: '<div class="amap-marker amap-marker-office"><span class="amap-marker-office-dot"></span><span class="amap-marker-office-label">中心</span></div>',
      offset: new AMap.Pixel(0, 0),
      zIndex: 200,
    });
    mapRef.current.add(centerMarker);
    markersRef.current.push(centerMarker);

    const validPoints = points.filter((p) => p.lng && p.lat);
    validPoints.forEach((p) => {
      const marker = new AMap.Marker({
        position: [p.lng, p.lat],
        content: buildMarkerEl(p, (clicked) => {
          if (onPointClick) onPointClick(clicked);
          if (infoWindowRef.current) {
            const html = `
              <div style="padding:8px 12px;font-size:12px;line-height:1.6;min-width:200px">
                <div style="font-weight:600;font-size:13px;color:#0b1c30">${clicked.name}</div>
                ${clicked.address ? `<div style="color:#717182;margin-top:2px">${clicked.address}</div>` : ""}
                ${clicked.contact ? `<div style="margin-top:4px">联系人：${clicked.contact}</div>` : ""}
                ${clicked.phone ? `<div>电话：${clicked.phone}</div>` : ""}
                <div style="margin-top:4px;color:#7c3aed">年服务 ${clicked.annualServices || 0} 次</div>
              </div>`;
            infoWindowRef.current.setContent(html);
            infoWindowRef.current.open(mapRef.current, [clicked.lng, clicked.lat]);
          }
        }),
        offset: new AMap.Pixel(0, 0),
        zIndex: 100,
      });
      mapRef.current.add(marker);
      markersRef.current.push(marker);
    });

    if (points.length > 0) {
      const all = [[center.lng, center.lat], ...points.filter((p) => p.lng && p.lat).map((p) => [p.lng, p.lat])];
      try {
        mapRef.current.setFitView(markersRef.current, false, [60, 60, 60, 60]);
      } catch {}
    }
  }, [state, points, center.lng, center.lat, center.name, zoom, onPointClick]);

  if (state === "fallback" || state === "error") {
    return <FallbackMap center={center} points={points} onPointClick={onPointClick} message={errorMsg} height={height} className={className} />;
  }

  return (
    <div className={`relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 ${className}`} style={{ height }}>
      {state === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-muted-foreground text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> 地图加载中…
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
      <style>{AMAP_MARKER_CSS}</style>
    </div>
  );
}

const AMAP_MARKER_CSS = `
.amap-marker { position: relative; display: inline-flex; align-items: center; justify-content: center; border: 0; padding: 0; background: transparent; cursor: pointer; }
.amap-marker-dot { position: relative; z-index: 1; display: block; width: 11px; height: 11px; border-radius: 999px; background: radial-gradient(circle at 35% 35%, #fbf7ff 0, #ddc4ff 18%, #8b5cf6 56%, #6d28d9 100%); box-shadow: 0 0 0 3px rgba(139,92,246,0.12), 0 10px 22px rgba(107,56,212,0.22); }
.amap-marker-label { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); color: white; font-size: 9px; font-weight: 700; line-height: 1; z-index: 2; pointer-events: none; }
.amap-marker-tier-peak .amap-marker-dot { width: 18px; height: 18px; }
.amap-marker-tier-high .amap-marker-dot { width: 15px; height: 15px; }
.amap-marker-tier-quiet .amap-marker-dot { width: 8px; height: 8px; }
.amap-marker:hover .amap-marker-dot { transform: scale(1.2); transition: transform 0.15s ease; }
.amap-marker-office-dot { display: block; width: 30px; height: 30px; border-radius: 999px; border: 3px solid white; background: radial-gradient(circle at 35% 35%, #ffffff 0, #d3e4fe 22%, #6b38d4 64%, #361268 100%); box-shadow: 0 0 0 8px rgba(107,56,212,0.14), 0 0 0 18px rgba(107,56,212,0.06), 0 18px 36px rgba(54,18,104,0.28); }
.amap-marker-office-label { position: absolute; left: 50%; bottom: 100%; transform: translateX(-50%); margin-bottom: 6px; border: 1px solid rgba(255,255,255,0.7); border-radius: 999px; padding: 3px 8px; color: white; background: rgba(27,12,59,0.94); font-size: 10px; white-space: nowrap; }
`;

interface FallbackProps {
  center: { lng: number; lat: number; name?: string };
  points: AmapPoint[];
  onPointClick?: (p: AmapPoint) => void;
  message?: string;
  height?: number | string;
  className?: string;
}

function FallbackMap({ center, points, onPointClick, message, height, className }: FallbackProps) {
  const validPoints = points.filter((p) => p.lng && p.lat);
  const all = [{ ...center, name: center.name || "中心", annualServices: 0, level: "peak" as const }, ...validPoints];
  const lngs = all.map((p) => p.lng);
  const lats = all.map((p) => p.lat);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const lngSpan = Math.max(maxLng - minLng, 0.01);
  const latSpan = Math.max(maxLat - minLat, 0.01);

  const project = (lng: number, lat: number) => ({
    x: ((lng - minLng) / lngSpan) * 80 + 10,
    y: 90 - ((lat - minLat) / latSpan) * 80,
  });

  return (
    <div className={`relative rounded-xl overflow-hidden border border-slate-200 ${className}`} style={{ height, background: "radial-gradient(circle at 50% 50%, rgba(233,221,255,0.8), transparent 26%), linear-gradient(135deg, #eef3ff 0%, #f7f3ff 48%, #edf5ff 100%)" }}>
      <div className="absolute top-2 left-2 right-2 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-[10px] text-muted-foreground border border-slate-200/60 shadow-sm flex items-center gap-2">
        <MapPin className="w-3 h-3 text-primary" />
        {message || "AMap 未配置，显示以苏州办事处为中心的客户坐标层"}
      </div>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="客户分布示意图">
        <defs>
          <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="0.2" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#grid)" />
        {validPoints.map((p) => {
          const c = project(center.lng, center.lat);
          const q = project(p.lng, p.lat);
          return <line key={`line-${p.id}`} x1={c.x} y1={c.y} x2={q.x} y2={q.y} stroke="rgba(107,56,212,0.15)" strokeWidth="0.3" strokeDasharray="1 1" />;
        })}
      </svg>
      {all.map((p) => {
        const pos = project(p.lng, p.lat);
        const isCenter = p.id === center.lng + center.lat;
        const tier = p.level || getTier(p.annualServices || 0);
        const size = tier === "peak" ? 24 : tier === "high" ? 18 : tier === "active" ? 12 : 8;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onPointClick?.(p)}
            className="absolute -translate-x-1/2 -translate-y-1/2 group"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            title={p.name || "客户"}
          >
            <span
              className="block rounded-full border-2 border-white shadow-lg"
              style={{
                width: size,
                height: size,
                background: isCenter
                  ? "radial-gradient(circle at 35% 35%, #ffffff 0, #d3e4fe 22%, #6b38d4 64%, #361268 100%)"
                  : "radial-gradient(circle at 35% 35%, #fbf7ff 0, #ddc4ff 18%, #8b5cf6 56%, #6d28d9 100%)",
              }}
            />
            <span className="absolute left-1/2 -translate-x-1/2 -top-7 whitespace-nowrap rounded-full bg-slate-900 px-2 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {p.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
