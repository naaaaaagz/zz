"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Bounds, LatLng, LayerGroup, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

const TWITCH_URL = "https://www.twitch.tv/zedthecyclist";
const COUNTRY_BORDERS_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_boundary_lines_land.geojson";

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
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
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
    import("leaflet").then((leaflet) => {
      if (cancelled || !mapContainer.current) return;
      const map = leaflet.map(mapContainer.current, {
        center: [47.8, 13.9], zoom: 4, minZoom: 2, maxZoom: 18,
        zoomControl: false, attributionControl: false,
      });
      mapRef.current = map;
      leaflet.control.zoom({ position: "bottomright" }).addTo(map);
      leaflet.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);

      const addBufferedTileLayer = (url: string, attribution = "", options: { subdomains?: string; maxNativeZoom?: number } = {}) => {
        const tileLayer = leaflet.tileLayer(url, { maxZoom: 20, keepBuffer: 4, updateWhenIdle: false, attribution, ...options });
        const bufferedLayer = tileLayer as typeof tileLayer & { _getTiledPixelBounds(center: LatLng): Bounds };
        const getVisiblePixelBounds = bufferedLayer._getTiledPixelBounds.bind(bufferedLayer);
        bufferedLayer._getTiledPixelBounds = (center) => {
          const visibleBounds = getVisiblePixelBounds(center);
          const edgeBuffer = bufferedLayer.getTileSize();
          return leaflet.bounds(visibleBounds.min.subtract(edgeBuffer), visibleBounds.max.add(edgeBuffer));
        };
        tileLayer.addTo(map);
      };
      addBufferedTileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        { subdomains: "abcd" },
      );
      addBufferedTileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
        "", { maxNativeZoom: 16 },
      );

      map.createPane("countryBorders");
      const borderPane = map.getPane("countryBorders");
      if (borderPane) borderPane.style.zIndex = "350";
      fetch(COUNTRY_BORDERS_URL).then((response) => response.ok ? response.json() : null).then((geoJson) => {
        if (!cancelled && geoJson) leaflet.geoJSON(geoJson, {
          pane: "countryBorders", interactive: false,
          style: { color: "#86a8b3", weight: 1.65, opacity: 0.68, fillOpacity: 0 },
        }).addTo(map);
      }).catch(() => {});

      const clusters = leaflet.markerClusterGroup({
        maxClusterRadius: (zoom) => zoom >= 15 ? 18 : zoom >= 10 ? 24 : 32,
        showCoverageOnHover: false, zoomToBoundsOnClick: true, spiderfyOnMaxZoom: true,
        removeOutsideVisibleBounds: true,
        iconCreateFunction: (cluster) => {
          const count = cluster.getChildCount();
          const size = count >= 100 ? 42 : count >= 10 ? 36 : 31;
          return leaflet.divIcon({
            className: "clip-cluster-wrapper", html: `<span class="clip-cluster">${count}</span>`, iconSize: [size, size],
          });
        },
      });
      clusters.addTo(map);
      markerLayerRef.current = clusters;
      const bounds = leaflet.latLngBounds(places.map((place) => [place.latitude, place.longitude] as [number, number]));
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.06), { maxZoom: 7 });
      requestAnimationFrame(() => map.invalidateSize());
      setMapReady(true);
    });
    return () => {
      cancelled = true; mapRef.current?.remove(); mapRef.current = null; markerLayerRef.current = null;
    };
  }, [places]);

  useEffect(() => {
    if (!mapReady || !markerLayerRef.current) return;
    let cancelled = false;
    import("leaflet").then((leaflet) => {
      if (cancelled || !markerLayerRef.current) return;
      markerLayerRef.current.clearLayers();
      for (const place of visiblePlaces) {
        const markerType = place.top ? "top" : place.clipUrl ? "clip" : "unlinked";
        const size = place.top ? 17 : place.clipUrl ? 12 : 10;
        const marker = leaflet.marker([place.latitude, place.longitude], {
          icon: leaflet.divIcon({
            className: "clip-marker-wrapper", html: `<span class="clip-marker ${markerType}"></span>`,
            iconSize: [size, size], iconAnchor: [size / 2, size / 2],
          }),
          keyboard: Boolean(place.clipUrl), bubblingMouseEvents: false,
        });
        marker.bindTooltip(place.name || "Untitled clip", {
          direction: "top", offset: [0, place.top ? -10 : -8], opacity: 1,
        });
        if (place.clipUrl) marker.on("click", () => setSelected(place));
        markerLayerRef.current.addLayer(marker);
      }
    });
    return () => { cancelled = true; };
  }, [mapReady, visiblePlaces]);

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
            <span className="live-led" aria-hidden="true" />ONLINE
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
            {selected.keywords && <p className="modal-keywords">{selected.keywords}</p>}
          </section>
        </div>
      )}
    </main>
  );
}
