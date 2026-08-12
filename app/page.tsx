"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Place = {
  id: number;
  name: string;
  clipUrl: string;
  category: string;
  latitude: number;
  longitude: number;
  twitchTitle: string;
};

const MAP_STYLE = {
  version: 8 as const,
  glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
  sources: {
    carto: {
      type: "raster" as const,
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [{ id: "carto", type: "raster" as const, source: "carto" }],
};

function getClipId(url: string) {
  return url.match(/\/clip\/([^/?#]+)/)?.[1] ?? "";
}

export default function Home() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

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
        setStatus("ready");
      })
      .catch(() => active && setStatus("error"));

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !places.length) return;

    let cancelled = false;

    import("maplibre-gl").then((maplibregl) => {
      if (cancelled || !mapContainer.current) return;

      const map = new maplibregl.Map({
        container: mapContainer.current,
        style: MAP_STYLE,
        center: [13.9, 47.8],
        zoom: 4.35,
        minZoom: 2,
        maxZoom: 18,
        attributionControl: false,
      });

      mapRef.current = map;
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "bottom-right",
      );
      map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        "bottom-left",
      );

      map.on("load", () => {
        map.addSource("places", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: places.map((place) => ({
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [place.longitude, place.latitude],
              },
              properties: place,
            })),
          },
          cluster: true,
          clusterMaxZoom: 11,
          clusterRadius: 42,
        });

        map.addLayer({
          id: "clusters-glow",
          type: "circle",
          source: "places",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "rgba(57, 211, 210, 0.14)",
            "circle-radius": ["step", ["get", "point_count"], 27, 20, 34, 80, 43],
            "circle-blur": 0.35,
          },
        });

        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "places",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#142e3a",
            "circle-radius": ["step", ["get", "point_count"], 18, 20, 23, 80, 29],
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#46dfd6",
          },
        });

        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "places",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 12,
            "text-font": ["Open Sans Bold"],
          },
          paint: { "text-color": "#dffffd" },
        });

        map.addLayer({
          id: "unclustered-point-glow",
          type: "circle",
          source: "places",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "rgba(74, 226, 213, 0.22)",
            "circle-radius": 13,
            "circle-blur": 0.45,
          },
        });

        map.addLayer({
          id: "unclustered-point",
          type: "circle",
          source: "places",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "#51e3d8",
            "circle-radius": 5.5,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#07141c",
          },
        });

        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 12,
          className: "clip-hover-popup",
        });

        map.on("mouseenter", "unclustered-point", (event) => {
          map.getCanvas().style.cursor = "pointer";
          const feature = event.features?.[0];
          if (!feature || feature.geometry.type !== "Point") return;
          const coordinates = [...feature.geometry.coordinates] as [number, number];
          const name = String(feature.properties?.name ?? "Untitled clip");
          popup.setLngLat(coordinates).setText(name).addTo(map);
        });

        map.on("mouseleave", "unclustered-point", () => {
          map.getCanvas().style.cursor = "";
          popup.remove();
        });

        map.on("mouseenter", "clusters", () => {
          map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", "clusters", () => {
          map.getCanvas().style.cursor = "";
        });

        map.on("click", "clusters", async (event: MapMouseEvent) => {
          const feature = map.queryRenderedFeatures(event.point, { layers: ["clusters"] })[0];
          if (!feature || feature.geometry.type !== "Point") return;
          const clusterId = Number(feature.properties?.cluster_id);
          const source = map.getSource("places") as maplibregl.GeoJSONSource;
          const zoom = await source.getClusterExpansionZoom(clusterId);
          map.easeTo({
            center: feature.geometry.coordinates as [number, number],
            zoom,
          });
        });

        map.on("click", "unclustered-point", (event) => {
          const properties = event.features?.[0]?.properties as Place | undefined;
          if (properties?.clipUrl) setSelected(properties);
        });
      });
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [places]);

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

  const parent = typeof window === "undefined" ? "localhost" : window.location.hostname;
  const clipId = selected ? getClipId(selected.clipUrl) : "";

  return (
    <main className="site-shell">
      <header className="site-header">
        <a className="brand" href="https://www.twitch.tv/zedthecyclist" target="_blank" rel="noreferrer">
          <span className="brand-mark" aria-hidden="true"><span>Z</span></span>
          <span className="brand-copy">
            <strong>ZedTheCyclist</strong>
            <small>pilgrimage archive</small>
          </span>
        </a>
        <div className="place-count" aria-live="polite">
          <span className={`status-dot ${status}`} />
          {status === "loading" && "Loading the journey…"}
          {status === "ready" && `${places.length} moments mapped`}
          {status === "error" && "The map data could not be loaded"}
        </div>
      </header>

      <div ref={mapContainer} className="map" aria-label="Interactive map of ZedTheCyclist clips" />

      <aside className="map-hint">
        <span className="mouse-icon" aria-hidden="true" />
        <span><strong>Explore the ride</strong>Hover for a name · click to watch</span>
      </aside>

      {selected && clipId && (
        <div className="modal-backdrop">
          <button
            className="modal-dismiss"
            onClick={() => setSelected(null)}
            aria-label="Close clip"
          />
          <section
            className="clip-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clip-modal-title"
          >
            <div className="modal-heading">
              <div>
                <p>From the road</p>
                <h2 id="clip-modal-title">{selected.name}</h2>
              </div>
              <button className="close-button" onClick={() => setSelected(null)} aria-label="Close clip">
                <span />
                <span />
              </button>
            </div>
            <div className="player-frame">
              <iframe
                src={`https://clips.twitch.tv/embed?clip=${encodeURIComponent(clipId)}&parent=${encodeURIComponent(parent)}&autoplay=true&muted=false`}
                title={selected.twitchTitle || selected.name}
                allow="autoplay; fullscreen"
                allowFullScreen
              />
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
