import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { api } from "@/services/api";

const ENV_AMAP_JSAPI_KEY =
  (import.meta as any).env.VITE_AMAP_JSAPI_KEY?.trim() ||
  (import.meta as any).env.VITE_AMAP_KEY?.trim() ||
  "";
const ENV_AMAP_SECURITY_JS_CODE =
  (import.meta as any).env.VITE_AMAP_SECURITY_JS_CODE?.trim() || "";

export const AMAP_CONFIGURED = Boolean(ENV_AMAP_JSAPI_KEY && ENV_AMAP_SECURITY_JS_CODE);

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
let amapLoadedKey = "";
let amapLoadedSecurityJsCode = "";
const MAX_FLIGHT_LINES = 80;
const FIT_VIEW_PADDING = [60, 60, 60, 60] as const;

interface AmapRuntimeConfig {
  jsapiKey: string;
  securityJsCode: string;
}

async function loadAmapConfig(): Promise<AmapRuntimeConfig> {
  return api.get("/settings/public-map")
    .then((data) => ({
      jsapiKey: String(data?.item?.amapJsapiKey || ENV_AMAP_JSAPI_KEY || "").trim(),
      securityJsCode: String(data?.item?.amapSecurityJsCode || ENV_AMAP_SECURITY_JS_CODE || "").trim(),
    }))
    .catch(() => ({
      jsapiKey: ENV_AMAP_JSAPI_KEY,
      securityJsCode: ENV_AMAP_SECURITY_JS_CODE,
    }));
}

function loadAMapScript(config: AmapRuntimeConfig): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("AMap 需在浏览器环境"));
  const existing = document.querySelector('script[data-amap-jsapi="true"]') as HTMLScriptElement | null;
  const existingMatches = Boolean(
    existing
    && existing.dataset.amapKey === config.jsapiKey
    && existing.dataset.amapSecurityJsCode === config.securityJsCode,
  );
  if (
    (window as any).AMap?.Map
    && (
      existingMatches
      || (amapLoadedKey === config.jsapiKey && amapLoadedSecurityJsCode === config.securityJsCode)
    )
  ) {
    amapLoadedKey = config.jsapiKey;
    amapLoadedSecurityJsCode = config.securityJsCode;
    if (existing) existing.dataset.amapLoaded = "true";
    return Promise.resolve((window as any).AMap);
  }
  if (amapLoaderPromise) return amapLoaderPromise;
  if (!config.jsapiKey || !config.securityJsCode) {
    return Promise.reject(new Error("未配置 AMap JSAPI 密钥或安全密钥"));
  }
  (window as any)._AMapSecurityConfig = { securityJsCode: config.securityJsCode };
  amapLoaderPromise = new Promise((resolve, reject) => {
    const finish = (AMap: any) => {
      amapLoaderPromise = null;
      amapLoadedKey = config.jsapiKey;
      amapLoadedSecurityJsCode = config.securityJsCode;
      resolve(AMap);
    };
    const fail = (message: string) => {
      amapLoaderPromise = null;
      reject(new Error(message));
    };
    if (existingMatches && existing) {
      if (existing.dataset.amapLoaded === "true" && (window as any).AMap?.Map) {
        finish((window as any).AMap);
        return;
      }
      if (existing.dataset.amapError === "true") {
        existing.remove();
      } else if (existing.dataset.amapLoading === "true") {
        existing.addEventListener("load", () => {
          existing.dataset.amapLoaded = "true";
          delete existing.dataset.amapLoading;
          finish((window as any).AMap);
        }, { once: true });
        existing.addEventListener("error", () => fail("AMap JSAPI 加载失败：浏览器未能下载高德脚本"), { once: true });
        return;
      } else if ((window as any).AMap?.Map) {
        existing.dataset.amapLoaded = "true";
        finish((window as any).AMap);
        return;
      } else {
        existing.remove();
      }
    }
    if (!existingMatches && existing) {
      existing.remove();
      try { delete (window as any).AMap; } catch {}
    }
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.defer = true;
    script.dataset.amapJsapi = "true";
    script.dataset.amapKey = config.jsapiKey;
    script.dataset.amapSecurityJsCode = config.securityJsCode;
    script.dataset.amapLoading = "true";
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.jsapiKey)}`;
    script.onload = () => {
      delete script.dataset.amapLoading;
      if (!(window as any).AMap?.Map) {
        fail("AMap JSAPI 已加载但未初始化");
        return;
      }
      script.dataset.amapLoaded = "true";
      finish((window as any).AMap);
    };
    script.onerror = () => {
      delete script.dataset.amapLoading;
      script.dataset.amapError = "true";
      fail("AMap JSAPI 加载失败：浏览器未能下载高德脚本");
    };
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

function setMarkerDelay(el: HTMLElement, index: number) {
  const delay = Math.min(index, 18) * 18;
  el.style.setProperty("--ops-map-marker-delay", `${delay}ms`);
  el.style.setProperty("--ops-map-label-delay", `${delay + 120}ms`);
}

function buildOfficeMarkerEl() {
  const el = document.createElement("div");
  el.className = "ops-map-marker ops-map-marker-office";
  setMarkerDelay(el, 0);

  const dot = document.createElement("span");
  dot.className = "ops-map-marker-office-dot";
  el.appendChild(dot);

  const label = document.createElement("span");
  label.className = "ops-map-marker-office-label";
  label.textContent = "中心";
  el.appendChild(label);
  return el;
}

function buildMarkerEl(point: AmapPoint, onClick?: (p: AmapPoint) => void, index = 0): HTMLElement {
  const tier = point.level || getTier(point.annualServices || 0);
  const el = document.createElement("button");
  el.type = "button";
  el.className = `ops-map-marker ops-map-marker-tier-${tier}`;
  el.setAttribute("aria-label", `${point.name}，年服务 ${point.annualServices || 0} 次`);
  el.dataset.id = String(point.id);
  setMarkerDelay(el, index + 1);

  const dot = document.createElement("span");
  dot.className = "ops-map-marker-dot";
  el.appendChild(dot);

  if (point.annualServices && point.annualServices > 0) {
    const label = document.createElement("span");
    label.className = "ops-map-marker-label";
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

function flightPath(from: { x: number; y: number }, to: { x: number; y: number }, index: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  const curve = Math.min(90, Math.max(22, distance * 0.22));
  const direction = index % 2 === 0 ? 1 : -1;
  const cx = (from.x + to.x) / 2 - (dy / distance) * curve * direction;
  const cy = (from.y + to.y) / 2 + (dx / distance) * curve * direction;
  return `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}

function renderFlightOverlay(
  overlay: HTMLDivElement | null,
  map: any,
  center: { lng: number; lat: number },
  points: AmapPoint[],
) {
  if (!overlay || !map?.lngLatToContainer) return;
  const width = overlay.clientWidth;
  const height = overlay.clientHeight;
  if (!width || !height) return;

  const centerPixel = map.lngLatToContainer([center.lng, center.lat]);
  const centerPoint = { x: Number(centerPixel.x), y: Number(centerPixel.y) };
  const rankedPoints = [...points]
    .filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat))
    .sort((a, b) => Number(b.annualServices || 0) - Number(a.annualServices || 0))
    .slice(0, MAX_FLIGHT_LINES);

  const paths = rankedPoints.map((point, index) => {
    const pixel = map.lngLatToContainer([point.lng, point.lat]);
    const target = { x: Number(pixel.x), y: Number(pixel.y) };
    const path = flightPath(centerPoint, target, index);
    const tier = point.level || getTier(point.annualServices || 0);
    const delay = `${(index % 12) * 0.28}s`;
    return [
      `<path class="ops-map-flight-line ops-map-flight-line-${tier}" d="${path}" style="animation-delay:${delay}" />`,
      `<path class="ops-map-flight-glow ops-map-flight-glow-${tier}" d="${path}" style="animation-delay:${delay}" />`,
    ].join("");
  }).join("");

  overlay.innerHTML = `
    <svg class="ops-map-flight-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      ${paths}
      <circle class="ops-map-heartbeat ops-map-heartbeat-one" cx="${centerPoint.x.toFixed(1)}" cy="${centerPoint.y.toFixed(1)}" r="10" />
      <circle class="ops-map-heartbeat ops-map-heartbeat-two" cx="${centerPoint.x.toFixed(1)}" cy="${centerPoint.y.toFixed(1)}" r="10" />
    </svg>
  `;
}

export function Amap({
  center = { lng: 120.71518, lat: 31.31962, name: "苏州工业园区和乔丽晶" },
  points = [],
  zoom = 9,
  height = 400,
  onPointClick,
  className = "",
}: AmapProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const infoWindowRef = useRef<any>(null);
  const [state, setState] = useState<"loading" | "ready" | "fallback" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await loadAmapConfig();
        if (!config.jsapiKey || !config.securityJsCode) {
          throw new Error("未配置 AMap JSAPI 密钥或安全密钥");
        }
        const AMap = await loadAMapScript(config);
        if (cancelled || !containerRef.current) return;
        if (mapRef.current) {
          mapRef.current.destroy();
          mapRef.current = null;
        }
        const map = new AMap.Map(containerRef.current, {
          zoom,
          center: [center.lng, center.lat],
          mapStyle: "amap://styles/light",
          features: ["bg", "point", "road", "building"],
          showLabel: true,
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
    const map = mapRef.current;
    const shell = shellRef.current;
    shell?.classList.remove("ops-map-settled");
    shell?.classList.add("ops-map-preparing");

    markersRef.current.forEach((m) => { map.remove(m); });
    markersRef.current = [];

    const centerMarker = new AMap.Marker({
      position: [center.lng, center.lat],
      content: buildOfficeMarkerEl(),
      offset: new AMap.Pixel(-15, -15),
      zIndex: 200,
    });
    map.add(centerMarker);
    markersRef.current.push(centerMarker);

    const validPoints = points.filter((p) => p.lng && p.lat);
    validPoints.forEach((p, index) => {
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
            infoWindowRef.current.open(map, [clicked.lng, clicked.lat]);
          }
        }, index),
        offset: new AMap.Pixel(-10, -10),
        zIndex: 100,
      });
      map.add(marker);
      markersRef.current.push(marker);
    });

    let flightFrame = 0;
    let settleTimer = 0;
    let settled = false;
    const renderFlights = () => {
      if (flightFrame) return;
      flightFrame = window.requestAnimationFrame(() => {
        flightFrame = 0;
        renderFlightOverlay(overlayRef.current, map, center, validPoints);
      });
    };
    const settleMap = () => {
      if (settled) return;
      settled = true;
      shell?.classList.remove("ops-map-preparing");
      shell?.classList.add("ops-map-settled");
      renderFlights();
    };
    const settleAfterViewportChange = () => {
      renderFlights();
      if (settleTimer) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settleMap, 120);
    };

    renderFlights();
    map.on("mapmove", renderFlights);
    map.on("moveend", settleAfterViewportChange);
    map.on("zoomchange", renderFlights);
    map.on("zoomend", settleAfterViewportChange);

    if (validPoints.length > 0) {
      try {
        map.setFitView(markersRef.current, false, [...FIT_VIEW_PADDING], zoom);
        renderFlights();
      } catch {}
      settleTimer = window.setTimeout(settleMap, 900);
    } else {
      settleTimer = window.setTimeout(settleMap, 160);
    }

    return () => {
      map.off("mapmove", renderFlights);
      map.off("moveend", settleAfterViewportChange);
      map.off("zoomchange", renderFlights);
      map.off("zoomend", settleAfterViewportChange);
      if (flightFrame) window.cancelAnimationFrame(flightFrame);
      if (settleTimer) window.clearTimeout(settleTimer);
      shell?.classList.remove("ops-map-preparing", "ops-map-settled");
      if (overlayRef.current) overlayRef.current.innerHTML = "";
    };
  }, [state, points, center.lng, center.lat, center.name, zoom, onPointClick]);

  if (state === "fallback" || state === "error") {
    return <FallbackMap center={center} points={points} onPointClick={onPointClick} message={errorMsg} height={height} className={className} />;
  }

  return (
    <div ref={shellRef} className={`ops-map-shell relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 ${className}`} style={{ height }}>
      {state === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-muted-foreground text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> 地图正在加载…
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
      <div ref={overlayRef} className="ops-map-flight-overlay" />
      <style>{AMAP_MARKER_CSS}</style>
    </div>
  );
}

const AMAP_MARKER_CSS = `
.ops-map-marker { appearance: none; box-sizing: border-box; position: relative; display: inline-flex; width: 20px; height: 20px; align-items: center; justify-content: center; border: 0; border-radius: 999px; padding: 0; background: transparent; cursor: pointer; overflow: visible; opacity: 0; transform: translateY(5px) scale(0.86); transition: opacity 0.34s ease, transform 0.42s cubic-bezier(0.2, 0.8, 0.2, 1); transition-delay: var(--ops-map-marker-delay, 0ms); will-change: opacity, transform; }
.ops-map-settled .ops-map-marker { opacity: 1; transform: translateY(0) scale(1); }
.ops-map-marker-dot { position: relative; z-index: 1; display: block; width: 11px; height: 11px; flex: 0 0 auto; border-radius: 999px; border: 2px solid rgba(255,255,255,0.9); background: radial-gradient(circle at 35% 35%, #fbf7ff 0, #ddc4ff 18%, #8b5cf6 56%, #6d28d9 100%); box-shadow: 0 0 0 3px rgba(139,92,246,0.12), 0 10px 22px rgba(107,56,212,0.22); }
.ops-map-marker-label { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(0.86); color: white; font-size: 9px; font-weight: 700; line-height: 1; z-index: 2; pointer-events: none; opacity: 0; transition: opacity 0.22s ease, transform 0.28s ease; transition-delay: var(--ops-map-label-delay, 120ms); }
.ops-map-settled .ops-map-marker-label { opacity: 1; transform: translate(-50%, -50%) scale(1); }
.ops-map-marker-tier-peak .ops-map-marker-dot { width: 18px; height: 18px; }
.ops-map-marker-tier-high .ops-map-marker-dot { width: 15px; height: 15px; }
.ops-map-marker-tier-quiet .ops-map-marker-dot { width: 8px; height: 8px; }
.ops-map-marker:hover .ops-map-marker-dot { transform: scale(1.2); transition: transform 0.15s ease; }
.ops-map-marker-office { width: 30px; height: 30px; }
.ops-map-marker-office-dot { display: block; width: 30px; height: 30px; border-radius: 999px; border: 3px solid white; background: radial-gradient(circle at 35% 35%, #ffffff 0, #d3e4fe 22%, #6b38d4 64%, #361268 100%); box-shadow: 0 0 0 8px rgba(107,56,212,0.14), 0 0 0 18px rgba(107,56,212,0.06), 0 18px 36px rgba(54,18,104,0.28); }
.ops-map-marker-office-label { position: absolute; left: 50%; bottom: 100%; transform: translateX(-50%) translateY(3px); margin-bottom: 6px; border: 1px solid rgba(255,255,255,0.7); border-radius: 999px; padding: 3px 8px; color: white; background: rgba(27,12,59,0.94); font-size: 10px; white-space: nowrap; opacity: 0; transition: opacity 0.24s ease, transform 0.28s ease; transition-delay: var(--ops-map-label-delay, 120ms); }
.ops-map-settled .ops-map-marker-office-label { opacity: 1; transform: translateX(-50%) translateY(0); }
.ops-map-flight-overlay { position: absolute; inset: 0; z-index: 4; pointer-events: none; overflow: hidden; opacity: 0; transition: opacity 0.45s ease 0.08s; }
.ops-map-settled .ops-map-flight-overlay { opacity: 1; }
.ops-map-flight-svg { display: block; width: 100%; height: 100%; overflow: visible; }
.ops-map-flight-line { fill: none; stroke: rgba(217,119,6,0.32); stroke-width: 1.9; stroke-linecap: round; }
.ops-map-flight-line-peak { stroke: rgba(245,158,11,0.46); stroke-width: 2.4; }
.ops-map-flight-line-high { stroke: rgba(234,179,8,0.4); stroke-width: 2.1; }
.ops-map-flight-line-quiet { stroke: rgba(180,83,9,0.24); stroke-width: 1.45; }
.ops-map-flight-glow { fill: none; stroke: rgba(250,204,21,0.98); stroke-width: 3.8; stroke-linecap: round; stroke-dasharray: 3 280; animation: ops-map-fly 3.6s linear infinite; filter: drop-shadow(0 0 5px rgba(251,191,36,0.95)) drop-shadow(0 0 13px rgba(245,158,11,0.65)); }
.ops-map-flight-glow-peak { stroke: rgba(251,191,36,1); }
.ops-map-flight-glow-high { stroke: rgba(253,224,71,0.96); }
.ops-map-flight-glow-quiet { stroke: rgba(245,158,11,0.72); }
.ops-map-heartbeat { fill: none; stroke: rgba(250,204,21,0.86); stroke-width: 3; transform-box: fill-box; transform-origin: center; animation: ops-map-heartbeat 2.2s ease-out infinite; filter: drop-shadow(0 0 7px rgba(251,191,36,0.9)); }
.ops-map-heartbeat-two { animation-delay: 1.1s; }
@keyframes ops-map-fly { from { stroke-dashoffset: 280; } to { stroke-dashoffset: 0; } }
@keyframes ops-map-heartbeat { 0% { opacity: 0.75; transform: scale(0.4); } 80%, 100% { opacity: 0; transform: scale(3.2); } }
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
  const all = [{ ...center, id: center.lng + center.lat, name: center.name || "中心", annualServices: 0, level: "peak" as const }, ...validPoints];
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
