import { Accessibility, ArrowRight, Footprints } from "lucide-react";
import { formatFare } from "../data/journeys";
import { ModeIcon } from "./UI";

export default function JourneyAIRecommendation({
  journey,
  accepted,
  busy,
  onView,
  onStart,
}) {
  const { route, from, to, modes, intent } = journey;
  const walks = route.segments.filter(({ mode }) => mode === "walk");
  const stepFree =
    walks.length > 0 &&
    walks.every(({ status }) => status === "Step-free path");

  return (
    <article
      className="journey-ai-recommendation glass-card"
      aria-label={accepted ? "Selected journey" : "Recommended journey"}
    >
      <div className="journey-ai-route-label">
        <ModeIcon mode={route.icon} size={17} />
        <strong>{route.label}</strong>
        {accepted && <span className="journey-ai-selected">Selected</span>}
      </div>
      <div className="journey-ai-modes">
        {modes
          .filter(({ id }) => id !== "walk")
          .map(({ id, short }, index) => (
            <span key={id}>
              {index > 0 && <ArrowRight size={13} aria-hidden="true" />}
              <ModeIcon mode={id} size={18} />
              {short}
            </span>
          ))}
      </div>
      <p className="journey-ai-route-places">
        {from.name} <span aria-label="to">→</span> {to.name}
      </p>
      <dl className="journey-ai-metrics">
        <div>
          <dt>Travel time</dt>
          <dd>
            {route.duration}
            <small> min</small>
          </dd>
        </div>
        <div>
          <dt>Fare</dt>
          <dd>{formatFare(route.cost)}</dd>
        </div>
        <div>
          <dt>Transfers</dt>
          <dd>{route.transfers}</dd>
        </div>
        {route.walk > 0 && (
          <div>
            <dt>Walking</dt>
            <dd>
              {route.walk}
              <small> min</small>
            </dd>
          </div>
        )}
      </dl>
      <div className="journey-ai-accessibility">
        {route.walk <= 4 && (
          <span>
            <Footprints size={13} aria-hidden="true" />
            {intent.walking === "low" ? "Reduced walking" : "Low walking"}
          </span>
        )}
        {stepFree && (
          <span>
            <Accessibility size={14} aria-hidden="true" /> Step-free paths
          </span>
        )}
      </div>
      <div className="journey-ai-navigation">
        <button
          className="button primary"
          type="button"
          disabled={busy}
          onClick={onView}
        >
          View journey <ArrowRight size={16} aria-hidden="true" />
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={busy}
          onClick={onStart}
        >
          Start trip
        </button>
      </div>
    </article>
  );
}
