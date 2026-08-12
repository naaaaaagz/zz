"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

type Place = {
  id: number;
  name: string;
  clipUrl: string;
  category: string;
  latitude: number;
  longitude: number;
  twitchTitle: string;
};

function getClipId(url: string) {
  return url.match(/\/clip\/([^/?#]+)/)?.[1] ?? "";
}

export default function Home() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
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

      const bounds = leaflet.latLngBounds([]);

      places.forEach((place) => {
        const point: [number, number] = [place.latitude, place.longitude];
        bounds.extend(point);

        const marker = leaflet.circleMarker(point, {
          radius: place.clipUrl ? 5.5 : 4.5,
          color: "#07141c",
          weight: 2,
          fillColor: place.clipUrl ? "#51e3d8" : "#7c9299",
          fillOpacity: 1,
          bubblingMouseEvents: false,
        });

        marker.bindTooltip(place.name || "Untitled clip", {
          direction: "top",
          offset: [0, -8],
          opacity: 1,
        });

        if (place.clipUrl) marker.on("click", () => setSelected(place));
        marker.addTo(map);
      });

      if (bounds.isValid()) map.fitBounds(bounds.pad(0.06), { maxZoom: 7 });
      requestAnimationFrame(() => map.invalidateSize());
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
                src={`https://clips.twitch.tv/embed?clip=${encodeURIComponent(clipId)}&parent=${encodeURIComponent(parent)}&autoplay=true&muted=true`}
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
