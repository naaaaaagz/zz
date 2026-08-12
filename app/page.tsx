"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

type Place = {
  id: number;
  name: string;
  clipUrl: string;
  category: string;
  latitude: number;
  longitude: number;
  twitchTitle: string;
  country: string;
};

function getClipId(url: string) {
  return url.match(/\/clip\/([^/?#]+)/)?.[1] ?? "";
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export default function Home() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [selected, setSelected] = useState<Place | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);

  const categories = useMemo(() => unique(places.map((place) => place.category)), [places]);
  const countries = useMemo(() => unique(places.map((place) => place.country)), [places]);
  const visiblePlaces = useMemo(
    () =>
      places.filter(
        (place) =>
          selectedCategories.includes(place.category) && selectedCountries.includes(place.country),
      ),
    [places, selectedCategories, selectedCountries],
  );

  useEffect(() => {
    let active = true;

    fetch("/api/places")
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load places");
        return response.json();
      })
      .then((data: Place[]) => {
        if (!active) return;
        setPlaces(data);
        setSelectedCategories(unique(data.map((place) => place.category)));
        setSelectedCountries(unique(data.map((place) => place.country)));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !places.length) return;

    let cancelled = false;

    import("leaflet").then((leaflet) => {
      if (cancelled || !mapContainer.current) return;

      const map = leaflet.map(mapContainer.current, {
        center: [47.8, 13.9],
        zoom: 4,
        minZoom: 2,
        maxZoom: 18,
        zoomControl: false,
        attributionControl: false,
      });

      mapRef.current = map;
      markerLayerRef.current = leaflet.layerGroup().addTo(map);
      leaflet.control.zoom({ position: "bottomright" }).addTo(map);
      leaflet.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);
      leaflet
        .tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
          subdomains: "abcd",
          maxZoom: 20,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        })
        .addTo(map);

      const bounds = leaflet.latLngBounds(
        places.map((place) => [place.latitude, place.longitude] as [number, number]),
      );
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.06), { maxZoom: 7 });
      requestAnimationFrame(() => map.invalidateSize());
      setMapReady(true);
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, [places]);

  useEffect(() => {
    if (!mapReady || !markerLayerRef.current) return;
    let cancelled = false;

    import("leaflet").then((leaflet) => {
      if (cancelled || !markerLayerRef.current) return;
      markerLayerRef.current.clearLayers();

      visiblePlaces.forEach((place) => {
        const marker = leaflet.circleMarker([place.latitude, place.longitude], {
          radius: place.clipUrl ? 5.5 : 4.5,
          color: "#07141c",
          weight: 2,
          fillColor: place.clipUrl ? "#bd5cff" : "#7c9299",
          fillOpacity: 1,
          bubblingMouseEvents: false,
        });

        marker.bindTooltip(place.name || "Untitled clip", {
          direction: "top",
          offset: [0, -8],
          opacity: 1,
        });

        if (place.clipUrl) marker.on("click", () => setSelected(place));
        marker.addTo(markerLayerRef.current!);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [mapReady, visiblePlaces]);

  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setSelected(null);
    document.addEventListener("keydown", close);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", close);
      document.body.classList.remove("modal-open");
    };
  }, [selected]);

  useEffect(() => {
    setPlayerReady(false);
    if (!selected) return;

    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setPlayerReady(true));
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [selected]);

  const toggleFilter = (
    value: string,
    current: string[],
    update: (values: string[]) => void,
  ) => update(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);

  const parent = typeof window === "undefined" ? "localhost" : window.location.hostname;
  const clipId = selected ? getClipId(selected.clipUrl) : "";

  return (
    <main className="site-shell">
      <header className="site-header">
        <div className="identity">
          <div className="wordmark" aria-label="ZedTheCyclist">
            <span>Zed</span><em>The</em><span>Cyclist</span>
          </div>
          <small>Zarándoklatai</small>
        </div>
        <a className="twitch-button" href="https://www.twitch.tv/zedthecyclist" target="_blank" rel="noreferrer">
          Visit on Twitch
        </a>
      </header>

      <div className="filter-area">
        <button
          className="filter-button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-controls="filters-panel"
        >
          <span className="filter-icon" aria-hidden="true"><i /><i /><i /></span>
          Filters
        </button>
        {filtersOpen && (
          <>
            <button className="filter-dismiss" onClick={() => setFiltersOpen(false)} aria-label="Close filters" />
            <section className="filters-panel" id="filters-panel" aria-label="Map filters">
              <div className="filter-section">
                <h2>Category</h2>
                <div className="filter-options">
                  {categories.map((category) => (
                    <label key={category}>
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(category)}
                        onChange={() => toggleFilter(category, selectedCategories, setSelectedCategories)}
                      />
                      <span>{category}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="filter-section countries-section">
                <h2>Countries</h2>
                <div className="filter-options country-options">
                  {countries.map((country) => (
                    <label key={country}>
                      <input
                        type="checkbox"
                        checked={selectedCountries.includes(country)}
                        onChange={() => toggleFilter(country, selectedCountries, setSelectedCountries)}
                      />
                      <span>{country}</span>
                    </label>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      <div
        ref={mapContainer}
        className="map"
        aria-label="Interactive map of ZedTheCyclist clips"
        data-visible-count={visiblePlaces.length}
      />

      <aside className="map-hint">
        <span className="mouse-icon" aria-hidden="true" />
        <span><strong>Explore the ride</strong>Hover for a name · click to watch</span>
      </aside>

      {selected && clipId && (
        <div className="modal-backdrop">
          <button className="modal-dismiss" onClick={() => setSelected(null)} aria-label="Close clip" />
          <section className="clip-modal" role="dialog" aria-modal="true" aria-labelledby="clip-modal-title">
            <div className="modal-heading">
              <div>
                <p>From the road</p>
                <h2 id="clip-modal-title">{selected.name}</h2>
              </div>
              <button className="close-button" onClick={() => setSelected(null)} aria-label="Close clip">
                <span /><span />
              </button>
            </div>
            <div className="player-frame">
              {playerReady && (
                <iframe
                  src={`https://clips.twitch.tv/embed?clip=${encodeURIComponent(clipId)}&parent=${encodeURIComponent(parent)}&autoplay=true&muted=true`}
                  title={selected.twitchTitle || selected.name}
                  allow="autoplay; fullscreen"
                  allowFullScreen
                />
              )}
            </div>
            {selected.twitchTitle && selected.twitchTitle !== selected.name && (
              <p className="twitch-title">{selected.twitchTitle}</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
