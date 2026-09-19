import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  Clock3,
  MapPin,
  Pause,
  Play,
  Radio,
  ShieldCheck,
  Volume2,
  Wind,
} from "lucide-react";
import {
  readJourney,
  journeyQuery,
  formatFare,
  arrivalTime,
} from "../data/journeys";
import { Badge, ModeIcon, SmartRoadPanel } from "../components/UI";
import RouteTimeline from "../components/RouteTimeline";
import MapPanel from "../components/MapPanel";
import { smartAlerts } from "../data/network";

export default function Tracking() {
  const [params] = useSearchParams();
  const { from, to, selected, walking } = readJourney(params);
  const [progress, setProgress] = useState(0.34);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(
      () => setProgress((value) => (value >= 0.86 ? 0.34 : value + 0.01)),
      1400,
    );
    return () => clearInterval(timer);
  }, [playing]);
  const currentIndex =
    progress < 0.34
      ? 0
      : progress < 0.58
        ? Math.min(1, selected.segments.length - 1)
        : Math.min(2, selected.segments.length - 1);
  const firstRide =
    selected.segments.find((s) => s.mode !== "walk") || selected.segments[0];
  return (
    <div className="tracking-page page-enter">
      <div className="tracking-header">
        <Link
          className="back-link"
          to={`/journey?${journeyQuery(from.name, to.name, selected.id, walking)}`}
        >
          <ArrowLeft size={16} /> Back to route details
        </Link>
        <div>
          <p className="eyebrow">
            <span className="status-dot" /> LIVE JOURNEY
          </p>
          <h1>On your way to {to.name}.</h1>
          <p>Tracking your connected journey from {from.name}.</p>
        </div>
        <div className="tracking-actions">
          <button className="icon-button" aria-label="Journey notifications">
            <Bell size={18} />
          </button>
          <Badge>
            <Radio size={13} /> Live simulation
          </Badge>
        </div>
      </div>
      <div className="tracking-layout">
        <section className="tracking-map-wrap">
          <MapPanel
            from={from}
            to={to}
            selected={selected}
            progress={progress}
          />
          <div className="map-status-pill glass-card">
            <span className="status-dot" /> Route updating <span>·</span> last
            synced just now
          </div>
        </section>
        <aside className="tracking-card glass-panel">
          <div className="tracking-card-top">
            <span className="eyebrow">YOUR JOURNEY · LIVE</span>
            <button
              className="icon-button"
              aria-label={playing ? "Pause simulation" : "Play simulation"}
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
          </div>
          <div className="tracking-hero">
            <div className="vehicle-icon">
              <ModeIcon mode={firstRide.mode} size={27} />
            </div>
            <div>
              <span className="tiny-label">CURRENTLY RIDING</span>
              <h2>{firstRide.name.split(" · ")[0]}</h2>
              <p>
                <span className="status-dot" /> On schedule · 4 min to next stop
              </p>
            </div>
          </div>
          <div className="tracking-destination">
            <span>
              <MapPin size={16} /> NEXT STOP
            </span>
            <strong>{firstRide.stop}</strong>
            <span>
              Then{" "}
              {selected.transfers
                ? `${selected.transfers} transfer${selected.transfers > 1 ? "s" : ""}`
                : "straight through"}{" "}
              to {to.name}
            </span>
          </div>
          <div className="eta-row">
            <div>
              <span>ARRIVES IN</span>
              <strong>
                {Math.max(8, Math.round(selected.duration * (1 - progress)))}{" "}
                <small>min</small>
              </strong>
            </div>
            <div>
              <span>ETA</span>
              <strong>
                {arrivalTime(
                  Math.max(8, Math.round(selected.duration * (1 - progress))),
                )}
              </strong>
            </div>
            <div>
              <span>FARE</span>
              <strong>{formatFare(selected.cost)}</strong>
            </div>
          </div>
          <div className="progress-label">
            <span>Journey progress</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="journey-progress">
            <span style={{ width: `${progress * 100}%` }} />
            <i style={{ left: `${progress * 100}%` }} />
          </div>
          <RouteTimeline
            segments={selected.segments}
            currentIndex={currentIndex}
          />
          <div className="tracking-actions-row">
            <button className="button secondary">
              <Volume2 size={16} /> Voice guidance
            </button>
            <button className="button secondary">
              <ShareIcon /> Share trip
            </button>
          </div>
        </aside>
      </div>
      <section className="tracking-lower">
        <div>
          <div className="tracking-section-title">
            <span className="eyebrow">NETWORK INTELLIGENCE</span>
            <h2>Everything is moving with you.</h2>
          </div>
          <div className="alert-grid">
            {smartAlerts.map((alert) => (
              <div className="smart-alert glass-card" key={alert.mode}>
                <span className={`alert-icon ${alert.mode}`}>
                  <ModeIcon mode={alert.mode} size={18} />
                </span>
                <div>
                  <strong>{alert.title}</strong>
                  <p>{alert.description}</p>
                </div>
                <Check size={15} />
              </div>
            ))}
          </div>
        </div>
        <div className="tracking-side-info">
          <SmartRoadPanel />
          <div className="system-stats glass-card">
            <div>
              <ShieldCheck size={18} />
              <span>
                <strong>98%</strong>
                <small>Route safety</small>
              </span>
            </div>
            <div>
              <Wind size={18} />
              <span>
                <strong>Clean air</strong>
                <small>Low emissions corridor</small>
              </span>
            </div>
            <div>
              <Clock3 size={18} />
              <span>
                <strong>On time</strong>
                <small>All connections</small>
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
function ShareIcon() {
  return (
    <span className="share-icon">
      <ArrowRight size={14} />
    </span>
  );
}
