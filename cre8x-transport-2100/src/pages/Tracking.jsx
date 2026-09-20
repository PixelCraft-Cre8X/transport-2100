import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Clock3,
  MapPin,
  Pause,
  Play,
  Share2,
  ShieldCheck,
  Volume2,
  Wind,
} from "lucide-react";
import {
  readJourney,
  journeyQuery,
  formatFare,
  clockTime,
  withStartTimes,
} from "../data/journeys";
import { ModeIcon, SmartRoadPanel } from "../components/UI";
import RouteTimeline from "../components/RouteTimeline";
import TrackingMap from "../components/TrackingMap";
import "./Tracking.css";

const START_PROGRESS = 0.14;
const TICK_MS = 1000;
const TICK_STEP = 0.006;

function nextStepText(segments, index, destination) {
  if (index >= segments.length - 1) return `Welcome to ${destination}`;
  const rides = segments
    .slice(index + 1)
    .filter((s) => s.mode !== "walk").length;
  if (rides > 0) {
    return `Then ${rides} transfer${rides > 1 ? "s" : ""} to ${destination}`;
  }
  return `Then a short walk to ${destination}`;
}

export default function Tracking() {
  const [params] = useSearchParams();
  const { from, to, selected, walking } = readJourney(params);
  const segments = withStartTimes(selected.segments);
  const [progress, setProgress] = useState(START_PROGRESS);
  const [playing, setPlaying] = useState(true);
  const [voice, setVoice] = useState(false);
  const [shared, setShared] = useState(false);

  const running = playing && progress < 1;
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(
      () => setProgress((value) => Math.min(1, value + TICK_STEP)),
      TICK_MS,
    );
    return () => clearInterval(timer);
  }, [running]);

  const duration = selected.duration;
  const elapsed = progress * duration;
  const arrived = progress >= 1;
  const currentIndex = Math.max(
    0,
    segments.findLastIndex((s) => s.start <= elapsed),
  );
  const current = segments[currentIndex];
  const segmentEnd = current.start + current.minutes;
  const minutesToNext = Math.max(1, Math.ceil(segmentEnd - elapsed));
  const previousCurrentIndex = useRef(currentIndex);
  const previousArrived = useRef(arrived);
  const remaining = Math.max(0, Math.round(duration - elapsed));
  const arrival = clockTime(duration);
  const walkingNow = current.mode === "walk";
  const query = journeyQuery(from.name, to.name, selected.id, walking);

  const announceCurrent = useEffectEvent(() => {
    const speech = window.speechSynthesis;
    if (!speech) return;

    speech.cancel();
    speech.speak(
      new SpeechSynthesisUtterance(
        `Next stop, ${current.stop}, in ${minutesToNext} minutes.`,
      ),
    );
  });

  const toggleVoice = () => {
    const speech = window.speechSynthesis;
    setVoice((on) => {
      if (!on && speech) {
        speech.cancel();
        const announcement = new SpeechSynthesisUtterance(
          arrived
            ? `You've arrived in ${to.name}.`
            : `Next stop, ${current.stop}, in ${minutesToNext} minutes.`,
        );
        if (arrived) announcement.onend = () => setVoice(false);
        speech.speak(announcement);
      } else if (on && speech) {
        speech.cancel();
      }
      return !on;
    });
  };
  useEffect(() => {
    const segmentChanged = previousCurrentIndex.current !== currentIndex;
    previousCurrentIndex.current = currentIndex;
    if (!voice || !segmentChanged) return;
    announceCurrent();
  }, [voice, currentIndex]);

  useEffect(() => {
    const arrivedNow = arrived && !previousArrived.current;
    previousArrived.current = arrived;
    const speech = window.speechSynthesis;
    if (!voice || !arrivedNow || !speech) return;

    speech.cancel();
    const announcement = new SpeechSynthesisUtterance(
      `You've arrived in ${to.name}.`,
    );
    announcement.onend = () => setVoice(false);
    speech.speak(announcement);
  }, [voice, arrived, to.name]);

  const share = async () => {
    const data = {
      title: `My journey to ${to.name}`,
      url: window.location.href,
    };
    try {
      if (navigator.share) await navigator.share(data);
      else await navigator.clipboard.writeText(data.url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      // Sharing was cancelled or clipboard access was refused; nothing to report.
    }
  };

  return (
    <div className="inner-page tk-page page-enter">
      <header className="tk-header">
        <Link
          className="back-link"
          to={`/journey?${query}`}
          aria-label="Back to route details"
        >
          <ArrowLeft size={16} /> Back
        </Link>
        <div className="tk-title">
          <h1>On your way to {to.name}.</h1>
        </div>
        <div className="tk-header-actions">
          <button className="icon-button" aria-label="Journey notifications">
            <Bell size={18} />
          </button>
          <span className="tk-live">
            <span className="status-dot" />{" "}
            {arrived ? "Arrived" : "Live tracking"}
          </span>
          <time className="tk-clock">
            {clockTime(elapsed, { seconds: true })}
          </time>
        </div>
      </header>

      <div className="tk-layout">
        <TrackingMap
          from={from}
          to={to}
          segments={segments}
          progress={progress}
          currentIndex={currentIndex}
          minutesToNext={minutesToNext}
          arrival={arrival}
          emissionsSaved={selected.emissionsSaved}
        />

        <aside className="tk-panel" aria-label="Journey progress">
          <div className="tk-panel-top">
            <span className="eyebrow">YOUR JOURNEY · LIVE</span>
            <span className="tk-panel-tools">
              <button
                className="icon-button"
                aria-label={running ? "Pause simulation" : "Play simulation"}
                disabled={arrived}
                onClick={() => setPlaying((value) => !value)}
              >
                {running ? <Pause size={16} /> : <Play size={16} />}
              </button>
            </span>
          </div>

          <div className="tk-riding">
            <span className={`tk-riding-icon ${current.mode}`}>
              <ModeIcon mode={current.mode} size={30} />
            </span>
            <div>
              <span>
                {arrived
                  ? "Journey complete"
                  : walkingNow
                    ? "Currently walking"
                    : "Currently riding"}
              </span>
              <h2>
                {arrived
                  ? `Arrived in ${to.name}`
                  : walkingNow
                    ? "On foot"
                    : current.name.split(" · ")[0]}
              </h2>
              {!arrived && (
                <p>
                  <span className="status-dot" />{" "}
                  {current.delayMinutes > 0
                    ? `Delayed +${current.delayMinutes} min`
                    : "On schedule"}{" "}
                  · {minutesToNext} min to next stop
                </p>
              )}
            </div>
            <Link className="tk-details-link" to={`/journey?${query}`}>
              View details <ArrowRight size={16} />
            </Link>
          </div>

          <div className="tk-next">
            <span className="tk-next-icon">
              <MapPin size={22} />
            </span>
            <div>
              <span>Next stop</span>
              <strong>{arrived ? to.name : current.stop}</strong>
              <small>{nextStepText(segments, currentIndex, to.name)}</small>
            </div>
            <time>{arrived ? arrival : clockTime(segmentEnd)}</time>
          </div>

          <dl className="tk-stats">
            <div>
              <dt>Arrives in</dt>
              <dd>
                {remaining} <small>min</small>
              </dd>
            </div>
            <div>
              <dt>ETA</dt>
              <dd>{arrival}</dd>
            </div>
            <div>
              <dt>Fare</dt>
              <dd>{formatFare(selected.cost)}</dd>
            </div>
          </dl>

          <div className="tk-progress">
            <div>
              <span>Journey progress</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div
              className="tk-track"
              role="progressbar"
              aria-label="Journey progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            >
              <span style={{ width: `${progress * 100}%` }} />
              <i style={{ left: `${progress * 100}%` }} />
            </div>
          </div>

          <RouteTimeline
            segments={selected.segments}
            currentIndex={arrived ? segments.length : currentIndex}
          />

          <div className="tk-actions">
            <button
              type="button"
              className="tk-action"
              aria-pressed={voice}
              onClick={toggleVoice}
            >
              <Volume2 size={18} /> {voice ? "Voice on" : "Voice guidance"}
            </button>
            <button type="button" className="tk-action" onClick={share}>
              <Share2 size={18} /> {shared ? "Link copied" : "Share trip"}
            </button>
          </div>
        </aside>
      </div>
      <section className="tk-lower" aria-label="Smart road intelligence">
        <SmartRoadPanel />
        <div className="system-stats">
          <div>
            <ShieldCheck size={20} />
            <span>
              <strong>98%</strong>
              <small>Route safety</small>
            </span>
          </div>
          <div>
            <Wind size={20} />
            <span>
              <strong>Clean air</strong>
              <small>Low emissions corridor</small>
            </span>
          </div>
          <div>
            <Clock3 size={20} />
            <span>
              <strong>On time</strong>
              <small>All connections</small>
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
