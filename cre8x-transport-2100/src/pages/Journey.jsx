import { useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Heart,
  Lock,
  MapPin,
  Ticket as TicketIcon,
  X,
} from "lucide-react";
import {
  readJourney,
  journeyQuery,
  formatFare,
  departureDay,
  formatDay,
  withStartTimes,
} from "../data/journeys";
import { ModeIcon } from "../components/UI";
import JourneyMap from "../components/JourneyMap";
import BookingModal from "../components/BookingModal";
import TicketModal from "../components/TicketModal";
import { useBooking } from "../utils/booking";
import DestinationArt from "../components/DestinationArt";
import "./Journey.css";

// Recommended is not offered on this page; the healthy choice leads the list.
const HIDDEN_STYLES = ["recommended"];
const TOP_STYLE = "healthy";

const departureDate = () => formatDay(departureDay());

function Metric({ value, unit, label, shortLabel }) {
  return (
    <span className="jm-metric">
      <strong>
        {value}
        {unit && <small> {unit}</small>}
      </strong>
      <small>
        {shortLabel ? (
          <>
            <span className="jm-long">{label}</span>
            <span className="jm-short">{shortLabel}</span>
          </>
        ) : (
          label
        )}
      </small>
    </span>
  );
}

function transferLabel(count) {
  return count === 1 ? "Transfer" : "Transfers";
}

export default function Journey() {
  const [params, setParams] = useSearchParams();
  const booking = useBooking();
  const location = useLocation();
  const navigate = useNavigate();
  const locked = Boolean(booking);
  // Once paid, the route is fixed to what was booked whatever the URL says.
  const journey = readJourney(
    booking ? new URLSearchParams(booking.query) : params,
  );
  const { from, to, walking } = journey;
  const routes = journey.options
    .filter((o) => !HIDDEN_STYLES.includes(o.id))
    .sort((a, b) => (b.id === TOP_STYLE) - (a.id === TOP_STYLE));
  const selected =
    routes.find((o) => o.id === journey.selected.id) || routes[0];
  // A booked journey keeps the date and time it was booked for.
  const base = booking?.departureMinutes;
  const steps = withStartTimes(selected.segments, base);
  const query = journeyQuery(from.name, to.name, selected.id, walking);
  const optionsRef = useRef(null);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [saved, setSaved] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [cancelled, setCancelled] = useState(location.state?.cancelled ?? null);

  // The "cancelled" notice arrives through navigation state; clear it from
  // history so a refresh doesn't bring it back.
  useEffect(() => {
    if (location.state?.cancelled) {
      navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: null,
      });
    }
  }, [location, navigate]);

  const choose = (style) =>
    !locked && setParams(journeyQuery(from.name, to.name, style, walking));

  // On phones the routes sit in a sideways carousel. Scroll it (never the page)
  // so that a card is centred.
  const centreCard = (card, behavior = "smooth") => {
    const list = optionsRef.current;
    if (!card || !list || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo({
      left: card.offsetLeft - (list.clientWidth - card.clientWidth) / 2,
      behavior,
    });
  };

  // Keep the chosen route in view.
  useEffect(() => {
    centreCard(optionsRef.current?.querySelector(".jm-route.selected"));
  }, [selected.id]);

  // The indicator dots follow whichever card is nearest the middle of the
  // carousel. The first and last cards can never reach the middle, so scrolling
  // all the way to either end counts as showing that card.
  const trackVisibleCard = (event) => {
    const list = event.currentTarget;
    const cards = [...list.querySelectorAll(".jm-route")];
    const atStart = list.scrollLeft < 4;
    const atEnd = list.scrollLeft > list.scrollWidth - list.clientWidth - 4;
    if (atStart || atEnd) {
      setVisibleIndex(atStart ? 0 : cards.length - 1);
      return;
    }
    const middle = list.scrollLeft + list.clientWidth / 2;
    const distance = (card) =>
      Math.abs(card.offsetLeft + card.clientWidth / 2 - middle);
    setVisibleIndex(
      cards.reduce(
        (best, card, i) => (distance(card) < distance(cards[best]) ? i : best),
        0,
      ),
    );
  };

  return (
    <div className="inner-page jm-page page-enter">
      <div className="jm-layout">
        <div className="jm-left">
          <Link className="back-link" to="/" aria-label="Back to planner">
            <ArrowLeft size={16} /> Back
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
              Depart at {booking ? booking.departure : "09:00"}{" "}
              <i aria-hidden="true">·</i>
              <span className="jm-date">
                {booking
                  ? booking.date.replace(/ \d{4}$/, "")
                  : departureDate()}
              </span>
            </span>
          </div>

          {cancelled && (
            <p className="jm-banner cancelled" role="status">
              <span>
                Journey {cancelled} was cancelled. No refund was issued.
              </span>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setCancelled(null)}
              >
                <X size={18} />
              </button>
            </p>
          )}
          {booking && (
            <div className="jm-banner booked">
              <Lock size={20} aria-hidden="true" />
              <p>
                <strong>Journey booked · {booking.reference}</strong>
                Your route is locked. You can only track it now, or cancel it
                from Live Map (no refund).
              </p>
              <button type="button" onClick={() => setTicketOpen(true)}>
                <TicketIcon size={18} /> View ticket
              </button>
            </div>
          )}

          <section className="jm-choices" aria-labelledby="jm-choices-title">
            <h2 id="jm-choices-title">Select your journey</h2>
            <fieldset
              className="jm-options"
              ref={optionsRef}
              onScroll={trackVisibleCard}
            >
              <legend className="jm-visually-hidden">Journey options</legend>
              {routes.map((option) => {
                const isSelected = selected.id === option.id;
                const chain = option.segments.filter(
                  (s, i, all) => !(s.mode === "walk" && i === all.length - 1),
                );
                return (
                  <article
                    key={option.id}
                    className={`jm-route ${option.id} ${isSelected ? "selected" : ""} ${locked && !isSelected ? "locked" : ""}`}
                  >
                    <label className="jm-route-pick">
                      <input
                        type="radio"
                        name="journey-style"
                        value={option.id}
                        checked={isSelected}
                        disabled={locked && !isSelected}
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
                          <span className="jm-highlight">
                            {option.highlight}
                          </span>
                        )}
                        <span className="jm-radio" aria-hidden="true" />
                      </span>
                      <span className="jm-route-metrics">
                        <Metric
                          value={option.duration}
                          unit="min"
                          label="Total travel time"
                          shortLabel="Travel time"
                        />
                        <Metric
                          value={formatFare(option.cost)}
                          label="Estimated fare"
                          shortLabel="Est. fare"
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
                            {i > 0 && (
                              <ArrowRight size={14} aria-hidden="true" />
                            )}
                            <ModeIcon mode={s.mode} size={22} />
                          </span>
                        ))}
                      </span>
                    </div>
                  </article>
                );
              })}
            </fieldset>
            <div className="jm-dots" role="group" aria-label="Choose a journey">
              {routes.map((option, i) => (
                <button
                  key={option.id}
                  type="button"
                  className={i === visibleIndex ? "active" : ""}
                  aria-label={`Show ${option.label}, option ${i + 1} of ${routes.length}`}
                  aria-current={i === visibleIndex ? "true" : undefined}
                  onClick={() =>
                    centreCard(
                      optionsRef.current?.querySelectorAll(".jm-route")[i],
                    )
                  }
                />
              ))}
            </div>
          </section>
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
                shortLabel="Travel time"
              />
              <Metric
                value={formatFare(selected.cost)}
                label="Estimated fare"
                shortLabel="Est. fare"
              />
              <Metric
                value={selected.transfers}
                label={transferLabel(selected.transfers)}
              />
            </div>
          </JourneyMap>

          <section
            className="jm-details"
            id="journey-details"
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
                      <span
                        className={`jm-step-status ${step.delayMinutes > 0 ? "delayed" : ""}`}
                      >
                        {step.delayMinutes > 0
                          ? `Delayed +${step.delayMinutes} min`
                          : step.status}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <aside className="jm-destination">
                <DestinationArt src={to.image} alt={`${to.name} destination`} />
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
              {booking ? (
                <Link className="jm-start" to={`/tracking?${query}`}>
                  Track journey <ArrowRight size={20} />
                </Link>
              ) : (
                <button
                  type="button"
                  className="jm-start"
                  aria-haspopup="dialog"
                  onClick={() => setBookingOpen(true)}
                >
                  Start journey <ArrowRight size={20} />
                </button>
              )}
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
      <BookingModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        from={from}
        to={to}
        steps={steps}
        route={selected}
        query={query}
        trackHref={`/tracking?${query}`}
      />
      <TicketModal
        open={ticketOpen}
        booking={booking}
        onClose={() => setTicketOpen(false)}
        trackHref={`/tracking?${query}`}
      />
    </div>
  );
}
