"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const TWITCH_URL = "https://www.twitch.tv/zedthecyclist";
const MAP_STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const COUNTRY_BORDERS_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_boundary_lines_land.geojson";

type Place = {
  id: number; name: string; clipUrl: string; category: string;
  sourceKeywords: string; keywords: string; latitude: number; longitude: number;
  twitchTitle: string; country: string; clipDate: string; top: boolean;
  twitchCategory: string; twitchKeywords: string;
};

function getClipId(url: string) { return url.match(/\/clip\/([^/?#]+)/)?.[1] ?? ""; }
function unique(values: string[]) { return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)); }
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
        id: place.id, name: place.name || "Untitled clip", linked: Boolean(place.clipUrl), top: place.top,
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
  const countries = useMemo(() => unique(places.map((place) => place.country)), [places]);
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
      if (!response.ok) throw new Error("Unable to load places");
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
    let initialLoadingTimer = 0;
    import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !mapContainer.current) return;
      const map = new maplibregl.Map({
        container: mapContainer.current,
        style: MAP_STYLE_URL,
        center: [13.9, 47.8], zoom: 4, minZoom: 2, maxZoom: 17,
        attributionControl: false, fadeDuration: 0,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

      const hideInitialLoading = () => mapLoadingRef.current?.classList.remove("visible");
      initialLoadingTimer = window.setTimeout(hideInitialLoading, 5000);
      map.once("idle", () => { window.clearTimeout(initialLoadingTimer); hideInitialLoading(); });

      map.on("load", () => {
        if (cancelled) return;
        const style = map.getStyle();
        for (const layer of style.layers ?? []) {
          if (layer.type !== "symbol") continue;
          const textField = layer.layout?.["text-field"];
          if (typeof textField === "string" && textField.includes("{name}")) {
            map.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", "name_en"], ["get", "name"]]);
          }
        }

        map.addSource("clips", {
          type: "geojson", data: placesToGeoJson(places), cluster: true, clusterMaxZoom: 16, clusterRadius: 32,
        });
        map.addLayer({
          id: "clip-clusters", type: "circle", source: "clips", filter: ["has", "point_count"],
          paint: {
            "circle-color": "#2b203f", "circle-radius": ["step", ["get", "point_count"], 16, 10, 18, 100, 21],
            "circle-stroke-color": "#dc97ff", "circle-stroke-width": 2,
            "circle-blur": 0.03, "circle-opacity": 0.96,
          },
        });
        map.addLayer({
          id: "clip-cluster-count", type: "symbol", source: "clips", filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 11, "text-allow-overlap": true },
          paint: { "text-color": "#ffffff", "text-halo-color": "rgba(7,17,24,.55)", "text-halo-width": 0.6 },
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
        const star = makeTopStar();
        if (star) map.addImage("top-star", star, { pixelRatio: 2 });
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
              .setText(String(feature.properties?.name ?? "Untitled clip")).addTo(map);
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
          (map.getSource("clips") as GeoJSONSource).getClusterExpansionZoom(clusterId).then((zoom) => {
            map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom, duration: 520 });
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
      });
    });
    return () => {
      cancelled = true; window.clearTimeout(initialLoadingTimer);
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
        <a className="twitch-button" href={TWITCH_URL} target="_blank" rel="noreferrer">Visit on Twitch</a>
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
            placeholder="Balaton, jumpscare, macska, ..." aria-label="Search clips" />
          {searchQuery && <button className="search-clear" onClick={() => setSearchQuery("")} aria-label="Clear search">×</button>}
        </div>
        <button className="filter-button" onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen} aria-controls="filters-panel">
          <span className="filter-icon" aria-hidden="true"><i /><i /><i /></span>Filters
        </button>
        {filtersOpen && (
          <>
            <button className="filter-dismiss" onClick={() => setFiltersOpen(false)} aria-label="Close filters" />
            <section className="filters-panel" id="filters-panel" aria-label="Map filters">
              <div className="filter-section">
                <h2>Top clip-ek</h2>
                <div className="filter-options single-option">
                  <label><input type="checkbox" checked={topOnly} onChange={() => setTopOnly((value) => !value)} />
                    <span>Csak TOP clip-ek <small>({topCount})</small></span></label>
                </div>
              </div>
              <div className="filter-section">
                <h2>Category</h2>
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
                <h2>Countries</h2>
                <div className="filter-options country-options">
                  <label className="select-all-option">
                    <input type="checkbox" checked={selectedCountries.length === countries.length}
                      onChange={() => setSelectedCountries(selectedCountries.length === countries.length ? [] : countries)} />
                    <span>ÖSSZES</span>
                  </label>
                  {countries.map((country) => (
                    <label key={country}><input type="checkbox" checked={selectedCountries.includes(country)}
                      onChange={() => toggleFilter(country, selectedCountries, setSelectedCountries)} />
                      <span>{country} <small>({countryCounts[country]})</small></span></label>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      <div ref={mapContainer} className="map" aria-label="Interactive map of ZedTheCyclist clips"
        data-visible-count={visiblePlaces.length} />
      <div ref={mapLoadingRef} className="map-loading visible" role="status" aria-label="Loading map">
        <span className="map-loading-spinner" aria-hidden="true" />
      </div>

      {selected && clipId && (
        <div className="modal-backdrop">
          <button className="modal-dismiss" onClick={() => setSelected(null)} aria-label="Close clip" />
          <section className="clip-modal" role="dialog" aria-modal="true" aria-labelledby="clip-modal-title">
            <div className="modal-heading">
              <h2 id="clip-modal-title">{selected.name}</h2>
              <div className="modal-actions">
                {selected.top && <span className="top-badge">TOP</span>}
                <button className="close-button" onClick={() => setSelected(null)} aria-label="Close clip"><span /><span /></button>
              </div>
            </div>
            <ClipPlayer key={clipId} clipId={clipId} parent={parent} title={selected.twitchTitle || selected.name} />
          </section>
        </div>
      )}
    </main>
  );
}
