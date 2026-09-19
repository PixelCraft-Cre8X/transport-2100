import { useEffect, useRef } from "react";
import { MapPin, Navigation, LocateFixed } from "lucide-react";
import "mapbox-gl/dist/mapbox-gl.css";
import { mapRoutePoints } from "../data/journeys";
import { ModeIcon } from "./UI";
import routePreview from "../assets/route-preview-map.png";

export default function MapPanel({
  from,
  to,
  selected,
  compact = false,
  progress = 0.34,
}) {
  const mapRef = useRef(null);
  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    const canvas = mapRef.current?.querySelector(".mapbox-canvas");
    let map;
    let active = true;
    if (!token || !canvas) return undefined;
    import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (!active) return;
      mapboxgl.accessToken = token;
      map = new mapboxgl.Map({
        container: canvas,
        style: "mapbox://styles/mapbox/dark-v11",
        center: from.coordinates,
        zoom: compact ? 8 : 9.3,
        attributionControl: false,
      });
      map.on("load", () =>
        map.fitBounds([from.coordinates, to.coordinates], {
          padding: 70,
          duration: 0,
        }),
      );
    });
    return () => {
      active = false;
      map?.remove();
    };
  }, [from, to, compact]);
  const segments = mapRoutePoints(from, to, selected.segments);
  return (
    <div
      className={`map-panel ${compact ? "compact" : ""}`}
      ref={mapRef}
      role="img"
      aria-label={`Illustrated route map from ${from.name} to ${to.name}`}
    >
      <div className="mapbox-canvas" />
      <img src={routePreview} alt="" className="map-texture" />
      <div className="map-grid" />
      <div className="map-water-label">INDIAN OCEAN</div>
      <div className="map-city city-colombo">COLOMBO</div>
      <div className="map-city city-galle">GALLE</div>
      <div className="map-route-lines">
        {segments.map((segment, i) => (
          <div
            key={i}
            className={`map-route-line ${segment.mode}`}
            style={{ "--route-index": i, "--route-count": segments.length }}
          />
        ))}
      </div>
      <div className="map-marker start" style={{ left: "24%", top: "66%" }}>
        <span>
          <LocateFixed size={13} />
        </span>
        <small>{from.name}</small>
      </div>
      <div
        className="map-marker destination-marker"
        style={{ left: "75%", top: "25%" }}
      >
        <span>
          <MapPin size={14} />
        </span>
        <small>{to.name}</small>
      </div>
      <div
        className="map-vehicle"
        style={{
          left: `${24 + progress * 51}%`,
          top: `${66 - progress * 41}%`,
        }}
      >
        <ModeIcon
          mode={
            selected.segments.find((s) => s.mode !== "walk")?.mode || "rail"
          }
          size={15}
        />
      </div>
      <div className="map-controls">
        <button aria-label="Center route">
          <Navigation size={15} />
        </button>
        <button aria-label="Map options">
          <span>+</span>
        </button>
        <button aria-label="Zoom out">
          <span>−</span>
        </button>
      </div>
      <div className="map-legend">
        {selected.segments
          .filter((s, i, a) => a.findIndex((x) => x.mode === s.mode) === i)
          .map((segment) => (
            <span key={segment.mode}>
              <i className={segment.mode} />
              <ModeIcon mode={segment.mode} size={13} />
            </span>
          ))}
      </div>
      <div className="map-powered">
        {import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
          ? "MAPBOX READY"
          : "SIMULATED MAP"}{" "}
        <span>·</span> 2100 NETWORK
      </div>
    </div>
  );
}
