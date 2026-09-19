import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Footprints,
  Accessibility,
  Volume2,
  HeartHandshake,
  Check,
  ArrowUpRight,
} from "lucide-react";
import {
  readJourney,
  journeyQuery,
  formatFare,
  arrivalTime,
} from "../data/journeys";
import {
  Badge,
  ModeIcon,
  SectionHeader,
  SmartRoadPanel,
} from "../components/UI";
import RouteTimeline from "../components/RouteTimeline";
import MapPanel from "../components/MapPanel";
export default function Journey() {
  const [params, setParams] = useSearchParams();
  const { from, to, walking, options, selected } = readJourney(params);
  const query = journeyQuery(from.name, to.name, selected.id, walking);
  return (
    <div className="inner-page page-enter">
      <Link className="back-link" to="/">
        <ArrowLeft size={16} /> Back to planner
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR ISLAND, YOUR WAY</p>
          <h1>
            {from.name} <ArrowRight /> {to.name}
          </h1>
          <p>One seamless journey. Choose what matters to you.</p>
        </div>
        <Badge>
          <span className="status-dot" /> Network connected
        </Badge>
      </div>
      <div className="journey-toolbar">
        <span>
          <Clock3 size={16} /> Depart at 09:00 <Badge>Demo journey</Badge>
        </span>
        <label>
          <Footprints size={16} />
          <select
            aria-label="Route walking preference"
            value={walking}
            onChange={(e) =>
              setParams(
                journeyQuery(
                  from.name,
                  to.name,
                  selected.id === "healthy" && e.target.value === "low"
                    ? "recommended"
                    : selected.id,
                  e.target.value,
                ),
              )
            }
          >
            <option value="include">Include walking</option>
            <option value="low">Minimize walking</option>
          </select>
        </label>
      </div>
      <div className="journey-layout">
        <section className="route-options">
          <SectionHeader title="Find your kind of journey">
            <span className="muted">{options.length} smart routes</span>
          </SectionHeader>
          <div className="options-list">
            {options.map((option) => (
              <button
                key={option.id}
                className={`route-option ${selected.id === option.id ? "selected" : ""}`}
                aria-pressed={selected.id === option.id}
                onClick={() =>
                  setParams(
                    journeyQuery(from.name, to.name, option.id, walking),
                  )
                }
              >
                <div className="option-top">
                  <span className={`option-icon ${option.id}`}>
                    <ModeIcon mode={option.icon} />
                  </span>
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                  <span className="selection-dot">
                    {selected.id === option.id && <Check size={12} />}
                  </span>
                </div>
                <div className="option-metrics">
                  <strong>
                    {option.duration}
                    <small> min</small>
                  </strong>
                  <span>{formatFare(option.cost)}</span>
                  <span>
                    <Footprints size={13} /> {option.walk} min walk
                  </span>
                </div>
                <div className="option-bottom">
                  <span className="mode-chain">
                    {option.segments.map((s, i) => (
                      <span key={i}>
                        <ModeIcon mode={s.mode} size={16} />
                        {i < option.segments.length - 1 && <span>›</span>}
                      </span>
                    ))}
                  </span>
                  <span>{option.comfort} comfort</span>
                  <Badge
                    tone={
                      option.id === "eco" || option.id === "healthy"
                        ? "green"
                        : ""
                    }
                  >
                    {option.tag}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        </section>
        <section className="journey-detail" aria-label="Selected route details">
          <div className="detail-heading">
            <span className="eyebrow">YOUR JOURNEY AT A GLANCE</span>
            <Badge>{selected.label}</Badge>
          </div>
          <div className="summary-metrics">
            <div>
              <strong>
                {selected.duration}
                <small> min</small>
              </strong>
              <span>Total travel time</span>
            </div>
            <div>
              <strong>{arrivalTime(selected.duration)}</strong>
              <span>Estimated arrival</span>
            </div>
            <div>
              <strong>{formatFare(selected.cost)}</strong>
              <span>Estimated fare</span>
            </div>
            <div>
              <strong>{selected.transfers}</strong>
              <span>Transfers</span>
            </div>
          </div>
          <div className="preview-map">
            <MapPanel from={from} to={to} selected={selected} compact />
            <Link to={`/tracking?${query}`} className="map-preview-link">
              Explore route <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="timeline-heading">
            <h2>Every step, connected.</h2>
            <span>
              {from.name} → {to.name}
            </span>
          </div>
          <RouteTimeline segments={selected.segments} />
          <SmartRoadPanel />
          <div className="accessibility-badges">
            {selected.walk <= 4 && (
              <span>
                <Footprints size={14} /> Low walking
              </span>
            )}
            <span>
              <Accessibility size={14} /> Step-free
            </span>
            <span>
              <Volume2 size={14} /> Voice-ready
            </span>
            {selected.walk <= 4 && (
              <span>
                <HeartHandshake size={14} /> Elderly friendly
              </span>
            )}
          </div>
          <Link className="button primary" to={`/tracking?${query}`}>
            Start tracking <ArrowRight size={18} />
          </Link>
          <p className="detail-footnote">
            Simulated services and fares for Sri Lanka, 2100.
          </p>
        </section>
      </div>
    </div>
  );
}
