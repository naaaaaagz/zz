"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const TWITCH_URL = "https://www.twitch.tv/zedthecyclist";
const BASE_TILE_URL = "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png";
const LABEL_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}";
const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "dark-base": {
      type: "raster", tileSize: 256, maxzoom: 20,
      tiles: [BASE_TILE_URL],
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
    "english-labels": {
      type: "raster", tileSize: 256, maxzoom: 16,
      tiles: [LABEL_TILE_URL],
      attribution: "&copy; Esri",
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#071118" } },
    { id: "dark-base", type: "raster", source: "dark-base", paint: { "raster-fade-duration": 120 } },
    { id: "english-labels", type: "raster", source: "english-labels", paint: { "raster-fade-duration": 120, "raster-opacity": 0.94 } },
  ],
};
const COUNTRY_BORDERS_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_boundary_lines_land.geojson";
const COUNTRY_NAMES_HU: Record<string, string> = {
  Austria: "Ausztria",
  Belgium: "Belgium",
  Croatia: "Horvátország",
  Germany: "Németország",
  Hungary: "Magyarország",
  Italy: "Olaszország",
  Netherlands: "Hollandia",
  Slovakia: "Szlovákia",
  Slovenia: "Szlovénia",
  Sweden: "Svédország",
};
const prefetchedTileUrls = new Set<string>();
const tilePrefetchQueue: string[] = [];
let activeTilePrefetches = 0;

function drainTilePrefetchQueue() {
  while (activeTilePrefetches < 4 && tilePrefetchQueue.length) {
    const url = tilePrefetchQueue.shift();
    if (!url) return;
    activeTilePrefetches += 1;
    fetch(url, { cache: "force-cache", mode: "cors" }).catch(() => {
      prefetchedTileUrls.delete(url);
    }).finally(() => {
      activeTilePrefetches -= 1;
      drainTilePrefetchQueue();
    });
  }
}

function queueTilePrefetch(url: string) {
  if (prefetchedTileUrls.has(url)) return;
  if (prefetchedTileUrls.size > 1600) prefetchedTileUrls.clear();
  prefetchedTileUrls.add(url);
  tilePrefetchQueue.push(url);
  drainTilePrefetchQueue();
}

function prefetchTileRing(map: MapLibreMap) {
  const bounds = map.getBounds();
  const addRing = (zoom: number, template: string) => {
    const tileCount = 2 ** zoom;
    const longitudeToX = (longitude: number) => Math.floor(((longitude + 180) / 360) * tileCount);
    const latitudeToY = (latitude: number) => {
      const clamped = Math.max(-85.05112878, Math.min(85.05112878, latitude));
      const radians = clamped * Math.PI / 180;
      return Math.floor((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * tileCount);
    };
    let west = bounds.getWest();
    let east = bounds.getEast();
    while (east < west) east += 360;
    const minX = longitudeToX(west);
    const maxX = longitudeToX(east);
    const minY = latitudeToY(bounds.getNorth());
    const maxY = latitudeToY(bounds.getSouth());
    for (let y = minY - 1; y <= maxY + 1; y += 1) {
      if (y < 0 || y >= tileCount) continue;
      for (let x = minX - 1; x <= maxX + 1; x += 1) {
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) continue;
        const wrappedX = ((x % tileCount) + tileCount) % tileCount;
        queueTilePrefetch(template.replace("{z}", String(zoom)).replace("{x}", String(wrappedX)).replace("{y}", String(y)));
      }
    }
  };
  const zoom = Math.max(2, Math.min(20, Math.floor(map.getZoom())));
  addRing(zoom, BASE_TILE_URL);
  addRing(Math.min(16, zoom), LABEL_TILE_URL);
}

type Place = {
  id: number; name: string; clipUrl: string; category: string;
  sourceKeywords: string; keywords: string; latitude: number; longitude: number;
  twitchTitle: string; country: string; clipDate: string; top: boolean;
  twitchCategory: string; twitchKeywords: string;
};

function getClipId(url: string) { return url.match(/\/clip\/([^/?#]+)/)?.[1] ?? ""; }
function unique(values: string[]) { return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)); }
function countryNameHu(country: string) { return COUNTRY_NAMES_HU[country] ?? country; }
function detailedClusterZoom(pointCount: number, currentZoom: number, expansionZoom: number) {
  const detailZoom = pointCount > 100 ? 11.5 : pointCount > 20 ? 12.5 : pointCount > 5 ? 13.5 : 15;
  return Math.min(16, Math.max(expansionZoom + 2, currentZoom + 3.5, detailZoom));
}
function countValues(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    if (value) counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}
function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("hu-HU")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function placesToGeoJson(places: Place[]) {
  return {
    type: "FeatureCollection" as const,
    features: places.map((place) => ({
      type: "Feature" as const,
      id: place.id,
      geometry: { type: "Point" as const, coordinates: [place.longitude, place.latitude] },
      properties: {
        id: place.id, name: place.name || "Névtelen klip", linked: Boolean(place.clipUrl), top: place.top,
      },
    })),
  };
}

function makeTopStar() {
  const size = 40;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const outer = 17; const inner = 7.4; const center = size / 2;
  context.beginPath();
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.closePath();
  const gradient = context.createLinearGradient(8, 6, 31, 34);
  gradient.addColorStop(0, "#f1a4ff"); gradient.addColorStop(0.58, "#a64cff"); gradient.addColorStop(1, "#7047e8");
  context.fillStyle = gradient; context.fill();
  context.lineWidth = 2.5; context.strokeStyle = "#07141c"; context.stroke();
  return context.getImageData(0, 0, size, size);
}

function makeClusterIcon(count: number) {
  const displaySize = count >= 100 ? 42 : count >= 10 ? 36 : 31;
  const scale = 2; const size = displaySize * scale; const center = size / 2;
  const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(center * 0.7, center * 0.63, 1, center, center, center);
  gradient.addColorStop(0, "#7952b5"); gradient.addColorStop(1, "#241c3c");
  context.beginPath(); context.arc(center, center, center - 2, 0, Math.PI * 2);
  context.fillStyle = gradient; context.fill();
  context.lineWidth = 4; context.strokeStyle = "#dc97ff"; context.stroke();
  context.fillStyle = "#ffffff";
  context.font = `850 ${22 * scale / 2}px Arial, Helvetica, sans-serif`;
  context.textAlign = "center"; context.textBaseline = "middle";
  context.fillText(String(count), center, center + 0.5);
  return context.getImageData(0, 0, size, size);
}

function ClipPlayer({ clipId, parent, title }: { clipId: string; parent: string; title: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setReady(true));
    });
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); };
  }, []);

  return (
    <div className="player-frame">
      {ready && (
        <iframe src={`https://clips.twitch.tv/embed?clip=${encodeURIComponent(clipId)}&parent=${encodeURIComponent(parent)}&autoplay=true&muted=false`}
          title={title} allow="autoplay; fullscreen" allowFullScreen />
      )}
    </div>
  );
}

export default function Home() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapLoadingRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [selected, setSelected] = useState<Place | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [topOnly, setTopOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [online, setOnline] = useState(false);

  const categories = useMemo(() => unique(places.map((place) => place.category)), [places]);
  const countries = useMemo(() => unique(places.map((place) => place.country))
    .sort((a, b) => countryNameHu(a).localeCompare(countryNameHu(b), "hu")), [places]);
  const categoryCounts = useMemo(() => countValues(places.map((place) => place.category)), [places]);
  const countryCounts = useMemo(() => countValues(places.map((place) => place.country)), [places]);
  const topCount = useMemo(() => places.filter((place) => place.top).length, [places]);
  const searchTokens = useMemo(() => normalizeSearch(searchQuery).split(/\s+/).filter(Boolean), [searchQuery]);
  const visiblePlaces = useMemo(() => places.filter((place) => {
    if (!selectedCategories.includes(place.category) || !selectedCountries.includes(place.country)) return false;
    if (topOnly && !place.top) return false;
    if (!searchTokens.length) return true;
    const haystack = normalizeSearch([
      place.keywords, place.sourceKeywords, place.category, place.name, place.twitchTitle,
      place.twitchCategory, place.twitchKeywords,
    ].join(" "));
    return searchTokens.every((token) => haystack.includes(token));
  }), [places, searchTokens, selectedCategories, selectedCountries, topOnly]);

  useEffect(() => {
    let active = true;
    fetch("/api/places").then((response) => {
      if (!response.ok) throw new Error("A helyszínek nem tölthetők be");
      return response.json();
    }).then((data: Place[]) => {
      if (!active) return;
      setPlaces(data);
      setSelectedCategories(unique(data.map((place) => place.category)));
      setSelectedCountries(unique(data.map((place) => place.country)));
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const endpoint = window.location.hostname.endsWith("github.io")
      ? "https://zedthecyclist-map.naaaaaagz.chatgpt.site/api/live" : "/api/live";
    fetch(endpoint).then((response) => response.ok ? response.json() : { online: false })
      .then((payload: { online?: boolean }) => { if (active) setOnline(Boolean(payload.online)); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !places.length) return;
    let cancelled = false;
    let detachMapWakeups = () => {};
    import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !mapContainer.current) return;
      const map = new maplibregl.Map({
        container: mapContainer.current,
        style: MAP_STYLE,
        center: [13.9, 47.8], zoom: 4, minZoom: 2, maxZoom: 17,
        attributionControl: false, fadeDuration: 0,
        maxTileCacheZoomLevels: 8,
        cancelPendingTileRequestsWhileZooming: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

      let prefetchTimer = 0;
      const scheduleTilePrefetch = () => {
        window.clearTimeout(prefetchTimer);
        prefetchTimer = window.setTimeout(() => prefetchTileRing(map), 140);
      };
      const wakeMap = () => requestAnimationFrame(() => requestAnimationFrame(() => {
        if (cancelled) return;
        map.resize();
        map.triggerRepaint();
        scheduleTilePrefetch();
      }));
      const handleVisibility = () => { if (document.visibilityState === "visible") wakeMap(); };
      const resizeObserver = new ResizeObserver(wakeMap);
      resizeObserver.observe(mapContainer.current);
      window.addEventListener("load", wakeMap);
      window.addEventListener("pageshow", wakeMap);
      document.addEventListener("visibilitychange", handleVisibility);
      map.on("moveend", scheduleTilePrefetch);
      map.on("idle", scheduleTilePrefetch);
      detachMapWakeups = () => {
        window.clearTimeout(prefetchTimer);
        resizeObserver.disconnect();
        window.removeEventListener("load", wakeMap);
        window.removeEventListener("pageshow", wakeMap);
        document.removeEventListener("visibilitychange", handleVisibility);
        map.off("moveend", scheduleTilePrefetch);
        map.off("idle", scheduleTilePrefetch);
      };

      map.on("load", () => {
        if (cancelled) return;
        mapLoadingRef.current?.classList.remove("visible");

        for (let count = 2; count <= places.length; count += 1) {
          const icon = makeClusterIcon(count);
          if (icon) map.addImage(`cluster-${count}`, icon, { pixelRatio: 2 });
        }
        const star = makeTopStar();
        if (star) map.addImage("top-star", star, { pixelRatio: 2 });
        map.addSource("clips", {
          type: "geojson", data: placesToGeoJson(places), cluster: true, clusterMaxZoom: 16, clusterRadius: 32,
        });
        map.addLayer({
          id: "clip-clusters", type: "symbol", source: "clips", filter: ["has", "point_count"],
          layout: { "icon-image": ["concat", "cluster-", ["to-string", ["get", "point_count"]]], "icon-allow-overlap": true },
        });
        map.addLayer({
          id: "clip-points", type: "circle", source: "clips",
          filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "top"], false]],
          paint: {
            "circle-radius": ["case", ["get", "linked"], 5, 4],
            "circle-color": ["case", ["get", "linked"], "#bd5cff", "#7c9299"],
            "circle-stroke-color": "#07141c", "circle-stroke-width": 1.5,
          },
        });
        map.addLayer({
          id: "top-points", type: "symbol", source: "clips",
          filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "top"], true]],
          layout: { "icon-image": "top-star", "icon-size": 1, "icon-allow-overlap": true },
        });

        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: "clip-map-tooltip" });
        const bindPointLayer = (layerId: string) => {
          map.on("mouseenter", layerId, (event) => {
            map.getCanvas().style.cursor = "pointer";
            const feature = event.features?.[0];
            if (!feature || feature.geometry.type !== "Point") return;
            popup.setLngLat(feature.geometry.coordinates as [number, number])
              .setText(String(feature.properties?.name ?? "Névtelen klip")).addTo(map);
          });
          map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; popup.remove(); });
          map.on("click", layerId, (event) => {
            const id = Number(event.features?.[0]?.properties?.id);
            const place = places.find((item) => item.id === id);
            if (place?.clipUrl) setSelected(place);
          });
        };
        bindPointLayer("clip-points"); bindPointLayer("top-points");
        map.on("mouseenter", "clip-clusters", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "clip-clusters", () => { map.getCanvas().style.cursor = ""; });
        map.on("click", "clip-clusters", (event) => {
          const feature = event.features?.[0];
          if (!feature || feature.geometry.type !== "Point") return;
          const clusterId = Number(feature.properties?.cluster_id);
          const pointCount = Number(feature.properties?.point_count ?? 2);
          (map.getSource("clips") as GeoJSONSource).getClusterExpansionZoom(clusterId).then((zoom) => {
            const targetZoom = detailedClusterZoom(pointCount, map.getZoom(), zoom);
            const duration = Math.min(900, 480 + Math.abs(targetZoom - map.getZoom()) * 55);
            map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom: targetZoom, duration });
          }).catch(() => {});
        });

        fetch(COUNTRY_BORDERS_URL).then((response) => response.ok ? response.json() : null).then((geoJson) => {
          if (cancelled || !geoJson || map.getSource("country-borders")) return;
          map.addSource("country-borders", { type: "geojson", data: geoJson });
          map.addLayer({
            id: "country-borders", type: "line", source: "country-borders",
            paint: { "line-color": "#86a8b3", "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1.1, 8, 1.6, 14, 2], "line-opacity": 0.68 },
          }, "clip-clusters");
        }).catch(() => {});

        setMapReady(true);
        wakeMap();
      });
    });
    return () => {
      cancelled = true;
      detachMapWakeups();
      mapRef.current?.remove(); mapRef.current = null;
    };
  }, [places]);

  useEffect(() => {
    const source = mapRef.current?.getSource("clips") as GeoJSONSource | undefined;
    if (!mapReady || !source) return;
    source.setData(placesToGeoJson(visiblePlaces));
  }, [mapReady, visiblePlaces]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !visiblePlaces.length) return;
    const timeout = window.setTimeout(() => {
      if (visiblePlaces.length === 1) {
        map.easeTo({ center: [visiblePlaces[0].longitude, visiblePlaces[0].latitude], zoom: 14, duration: 650 });
        return;
      }
      const west = Math.min(...visiblePlaces.map((place) => place.longitude));
      const east = Math.max(...visiblePlaces.map((place) => place.longitude));
      const south = Math.min(...visiblePlaces.map((place) => place.latitude));
      const north = Math.max(...visiblePlaces.map((place) => place.latitude));
      const maxZoom = visiblePlaces.length <= 4 ? 13 : visiblePlaces.length <= 20 ? 11 : 7;
      map.fitBounds([[west, south], [east, north]], { padding: 54, maxZoom, duration: 650 });
    }, searchTokens.length ? 260 : 0);
    return () => window.clearTimeout(timeout);
  }, [mapReady, searchTokens.length, visiblePlaces]);

  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setSelected(null);
    document.addEventListener("keydown", close); document.body.classList.add("modal-open");
    return () => { document.removeEventListener("keydown", close); document.body.classList.remove("modal-open"); };
  }, [selected]);

  const toggleFilter = (value: string, current: string[], update: (values: string[]) => void) =>
    update(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const parent = typeof window === "undefined" ? "localhost" : window.location.hostname;
  const clipId = selected ? getClipId(selected.clipUrl) : "";

  return (
    <main className="site-shell">
      <header className="site-header">
        <div className="identity">
          <div className="wordmark" aria-label="ZedTheCyclist"><span>Zed</span><em>The</em><span>Cyclist</span></div>
          <small>Zarándoklatai</small>
        </div>
        <a className="twitch-button" href={TWITCH_URL} target="_blank" rel="noreferrer">Twitch profil</a>
        {online && (
          <a className="live-button" href={TWITCH_URL} target="_blank" rel="noreferrer">
            <span className="live-led" aria-hidden="true" />LIVE
          </a>
        )}
      </header>

      <div className="filter-area">
        <div className="search-box">
          <span className="search-icon" aria-hidden="true" />
          <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Balaton, ijesztés, macska, ..." aria-label="Keresés a klipek között" />
          {searchQuery && <button className="search-clear" onClick={() => setSearchQuery("")} aria-label="Keresés törlése">×</button>}
        </div>
        <button className="filter-button" onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen} aria-controls="filters-panel">
          <span className="filter-icon" aria-hidden="true"><i /><i /><i /></span>Szűrők
        </button>
        {filtersOpen && (
          <>
            <button className="filter-dismiss" onClick={() => setFiltersOpen(false)} aria-label="Szűrők bezárása" />
            <section className="filters-panel" id="filters-panel" aria-label="Térképszűrők">
              <div className="filter-section">
                <h2>Kiemelt klipek</h2>
                <div className="filter-options single-option">
                  <label><input type="checkbox" checked={topOnly} onChange={() => setTopOnly((value) => !value)} />
                    <span>Csak TOP klipek <small>({topCount})</small></span></label>
                </div>
              </div>
              <div className="filter-section">
                <h2>Kategória</h2>
                <div className="filter-options">
                  <label className="select-all-option">
                    <input type="checkbox" checked={selectedCategories.length === categories.length}
                      onChange={() => setSelectedCategories(selectedCategories.length === categories.length ? [] : categories)} />
                    <span>ÖSSZES</span>
                  </label>
                  {categories.map((category) => (
                    <label key={category}><input type="checkbox" checked={selectedCategories.includes(category)}
                      onChange={() => toggleFilter(category, selectedCategories, setSelectedCategories)} />
                      <span>{category} <small>({categoryCounts[category]})</small></span></label>
                  ))}
                </div>
              </div>
              <div className="filter-section countries-section">
                <h2>Országok</h2>
                <div className="filter-options country-options">
                  <label className="select-all-option">
                    <input type="checkbox" checked={selectedCountries.length === countries.length}
                      onChange={() => setSelectedCountries(selectedCountries.length === countries.length ? [] : countries)} />
                    <span>ÖSSZES</span>
                  </label>
                  {countries.map((country) => (
                    <label key={country}><input type="checkbox" checked={selectedCountries.includes(country)}
                      onChange={() => toggleFilter(country, selectedCountries, setSelectedCountries)} />
                      <span>{countryNameHu(country)} <small>({countryCounts[country]})</small></span></label>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      <div ref={mapContainer} className="map" aria-label="ZedTheCyclist klipjeinek interaktív térképe"
        data-visible-count={visiblePlaces.length} />
      <div ref={mapLoadingRef} className="map-loading" role="status" aria-label="Térkép betöltése">
        <span className="map-loading-spinner" aria-hidden="true" />
      </div>

      {selected && clipId && (
        <div className="modal-backdrop">
          <button className="modal-dismiss" onClick={() => setSelected(null)} aria-label="Klip bezárása" />
          <section className="clip-modal" role="dialog" aria-modal="true" aria-labelledby="clip-modal-title">
            <div className="modal-heading">
              <h2 id="clip-modal-title">{selected.name}</h2>
              <div className="modal-actions">
                {selected.top && <span className="top-badge">TOP</span>}
                <button className="close-button" onClick={() => setSelected(null)} aria-label="Klip bezárása"><span /><span /></button>
              </div>
            </div>
            <ClipPlayer key={clipId} clipId={clipId} parent={parent} title={selected.twitchTitle || selected.name} />
          </section>
        </div>
      )}
    </main>
  );
}
