import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Footprints,
  Heart,
  MapPin,
} from "lucide-react";
import {
  readJourney,
  journeyQuery,
  formatFare,
  withStartTimes,
} from "../data/journeys";
import { ModeIcon } from "../components/UI";
import JourneyMap from "../components/JourneyMap";
import Switch from "../components/Switch";
import DestinationArt from "../components/DestinationArt";
import "./Journey.css";

function departureDate() {
  const day = new Date();
  day.setDate(day.getDate() + 1);
  const weekday = day.toLocaleDateString("en-US", { weekday: "short" });
  const month = day.toLocaleDateString("en-US", { month: "short" });
  return `${weekday}, ${day.getDate()} ${month}`;
}

function Metric({ value, unit, label }) {
  return (
    <span className="jm-metric">
      <strong>
        {value}
        {unit && <small> {unit}</small>}
      </strong>
      <small>{label}</small>
    </span>
  );
}

function transferLabel(count) {
  return count === 1 ? "Transfer" : "Transfers";
}

export default function Journey() {
  const [params, setParams] = useSearchParams();
  const journey = readJourney(params);
  const { from, to, walking } = journey;
  const { options: routes, selected } = journey;
  const steps = withStartTimes(selected.segments);
  const query = journeyQuery(from.name, to.name, selected.id, walking);
  const detailsRef = useRef(null);
  const [saved, setSaved] = useState(false);

  const choose = (style) =>
    setParams(journeyQuery(from.name, to.name, style, walking));
  const showDetails = (style) => {
    choose(style);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  const includeWalking = walking === "include";

  return (
    <div className="inner-page jm-page page-enter">
      <div className="jm-layout">
        <div className="jm-left">
          <Link className="back-link" to="/">
            <ArrowLeft size={16} /> Back to planner
          </Link>
          <header className="jm-heading">
            <p className="eyebrow">YOUR ISLAND, YOUR WAY</p>
            <h1>
              {from.name} <ArrowRight aria-label="to" /> {to.name}
            </h1>
          </header>

          <div className="jm-toolbar">
            <span>
              <CalendarDays size={20} />
              Depart at 09:00 <i aria-hidden="true">·</i>
              <span className="jm-date">{departureDate()}</span>
            </span>
            <span className="jm-toggle-row">
              <Footprints size={20} />
              <span id="jm-walking-label">Include walking</span>
              <Switch
                checked={includeWalking}
                labelledBy="jm-walking-label"
                onChange={(on) =>
                  setParams(
                    journeyQuery(
                      from.name,
                      to.name,
                      selected.id,
                      on ? "include" : "low",
                    ),
                  )
                }
              />
            </span>
          </div>

          <fieldset className="jm-options">
            <legend>
              <h2>Select your journey</h2>
            </legend>
            {routes.map((option) => {
              const isSelected = selected.id === option.id;
              const chain = option.segments.filter(
                (s, i, all) => !(s.mode === "walk" && i === all.length - 1),
              );
              return (
                <article
                  key={option.id}
                  className={`jm-route ${option.id} ${isSelected ? "selected" : ""}`}
                >
                  <label className="jm-route-pick">
                    <input
                      type="radio"
                      name="journey-style"
                      value={option.id}
                      checked={isSelected}
                      onChange={() => choose(option.id)}
                    />
                    <span className="jm-route-head">
                      <span className="jm-route-icon">
                        <ModeIcon mode={option.icon} size={24} />
                      </span>
                      <span className="jm-route-title">
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                      {option.highlight && (
                        <span className="jm-highlight">{option.highlight}</span>
                      )}
                      <span className="jm-radio" aria-hidden="true" />
                    </span>
                    <span className="jm-route-metrics">
                      <Metric
                        value={option.duration}
                        unit="min"
                        label="Total travel time"
                      />
                      <Metric
                        value={formatFare(option.cost)}
                        label="Estimated fare"
                      />
                      <Metric
                        value={option.transfers}
                        label={transferLabel(option.transfers)}
                      />
                    </span>
                  </label>
                  <div className="jm-route-foot">
                    <span className="jm-chain" aria-label="Modes of travel">
                      {chain.map((s, i) => (
                        <span key={`${s.mode}-${i}`}>
                          {i > 0 && <ArrowRight size={14} aria-hidden="true" />}
                          <ModeIcon mode={s.mode} size={22} />
                        </span>
                      ))}
                    </span>
                    <button
                      type="button"
                      className="jm-link"
                      onClick={() => showDetails(option.id)}
                    >
                      View details <ArrowRight size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
          </fieldset>
        </div>

        <div className="jm-right">
          <JourneyMap
            from={from}
            to={to}
            segments={steps}
            fullMapHref={`/tracking?${query}`}
          >
            <div className="jm-stats">
              <Metric
                value={selected.duration}
                unit="min"
                label="Total travel time"
              />
              <Metric value={formatFare(selected.cost)} label="Estimated fare" />
              <Metric
                value={selected.transfers}
                label={transferLabel(selected.transfers)}
              />
            </div>
          </JourneyMap>

          <section
            className="jm-details"
            id="journey-details"
            ref={detailsRef}
            aria-label="Journey details"
          >
            <h2>Journey details</h2>
            <div className="jm-details-body">
              <ol className="jm-steps">
                {steps.map((step, i) => {
                  const last = i === steps.length - 1;
                  return (
                    <li key={`${step.mode}-${i}`} className={step.mode}>
                      <span className="jm-step-icon">
                        {last ? (
                          <MapPin size={20} />
                        ) : (
                          <ModeIcon mode={step.mode} size={20} />
                        )}
                      </span>
                      <span className="jm-step-time">
                        {step.time}
                        <i aria-hidden="true" />
                      </span>
                      <span className="jm-step-name">
                        <strong>{step.name}</strong>
                        <small>{step.minutes} min</small>
                      </span>
                      <span className="jm-step-status">{step.status}</span>
                    </li>
                  );
                })}
              </ol>
              <aside className="jm-destination">
                <DestinationArt landmark={to.landmark} />
                <div>
                  <span>Arrive at</span>
                  <strong>{to.name}</strong>
                  <p>{to.tagline}</p>
                  <Link to="/" className="jm-outline-button">
                    View destination <ArrowUpRight size={16} />
                  </Link>
                </div>
              </aside>
            </div>
            <div className="jm-actions">
              <Link className="jm-start" to={`/tracking?${query}`}>
                Start journey <ArrowRight size={20} />
              </Link>
              <button
                type="button"
                className={`jm-save ${saved ? "saved" : ""}`}
                aria-pressed={saved}
                onClick={() => setSaved((value) => !value)}
              >
                <Heart size={22} fill={saved ? "currentColor" : "none"} />
                {saved ? "Journey saved" : "Save journey"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
