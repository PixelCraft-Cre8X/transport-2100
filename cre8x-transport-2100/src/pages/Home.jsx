import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Mic,
  Sparkles,
  X,
  MapPin,
  ShieldCheck,
  Zap,
} from "lucide-react";
import JourneyPlannerCard from "../components/JourneyPlannerCard";
import { SectionHeader, TransportModeCard, ModeIcon } from "../components/UI";
import { networkStatus, transportModes } from "../data/network";
import { journeyQuery } from "../data/journeys";
// Drop replacement JPGs into src/assets/images/ using these exact filenames.
// Existing PNG artwork is supported too; with no files, the CSS glow remains.
const heroAssets = import.meta.glob(
  "../assets/{images/,}hero-colombo-2100-*.{jpg,png}",
  { eager: true, query: "?url", import: "default" },
);
const desktop =
  heroAssets["../assets/images/hero-colombo-2100-desktop.jpg"] ||
  heroAssets["../assets/hero-colombo-2100-desktop.png"];
const mobile =
  heroAssets["../assets/images/hero-colombo-2100-mobile.jpg"] ||
  heroAssets["../assets/hero-colombo-2100-mobile.png"] ||
  desktop;
export default function Home() {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [activeMode, setActiveMode] = useState(null);
  return (
    <div className="home-page page-enter">
      <section className="hero-section">
        {desktop && (
          <picture className="hero-image">
            <source media="(max-width: 600px)" srcSet={mobile} />
            <img
              src={desktop}
              alt="Colombo in 2100 with elevated SkyRail, electric buses, and air taxis along the ocean"
            />
          </picture>
        )}
        <div className="hero-shade" />
        <div className="hero-layout">
          <div className="hero-copy">
            <div className="hero-kicker">
              <span className="status-dot" /> SRI LANKA, 2100{" "}
              <span className="kicker-line" />
            </div>
            <h1>
              Your island.
              <br />
              Your journey.
              <br />
              <span>Reimagined.</span>
            </h1>
            <p>
              From city streets to open skies.
              <br />
              One connected way to move.
            </p>
            <div className="hero-tags">
              <span>
                <Zap size={14} /> All electric
              </span>
              <span>
                <ShieldCheck size={14} /> Seamlessly connected
              </span>
            </div>
            <div className="hero-caption">
              <MapPin size={13} /> COLOMBO COASTAL CORRIDOR{" "}
              <span>6.9271° N · 79.8612° E</span>
            </div>
          </div>
          <JourneyPlannerCard />
        </div>
      </section>
      <div className="quick-destinations">
        <span>Find your next stop</span>
        {["Colombo Fort", "Port City", "Kandy", "Airport"].map((name) => (
          <Link key={name} to={`/journey?${journeyQuery("Maharagama", name)}`}>
            <MapPin size={13} />
            {name}
            <ArrowUpRight size={13} />
          </Link>
        ))}
      </div>
      <section className="transport-section">
        <SectionHeader
          eyebrow="A NEW ERA OF MOBILITY"
          title="Different ways. One connected island."
        >
          <span className="section-note">
            Built around you. Powered by tomorrow.
          </span>
        </SectionHeader>
        <div className="transport-grid">
          {transportModes.map((mode) => (
            <TransportModeCard
              key={mode.id}
              mode={mode}
              onSelect={() =>
                setActiveMode(activeMode === mode.id ? null : mode.id)
              }
            />
          ))}
        </div>
        {activeMode && (
          <div className="mode-detail" role="status">
            <ModeIcon mode={activeMode} />
            <p>
              <strong>
                {transportModes.find((m) => m.id === activeMode).name}
              </strong>{" "}
              · {transportModes.find((m) => m.id === activeMode).status}.{" "}
              {activeMode === "road"
                ? "Smart Roads support buses with adaptive traffic signals and safer connections."
                : "Compare this service in your journey options."}
            </p>
            <button
              className="icon-button"
              aria-label="Close transport information"
              onClick={() => setActiveMode(null)}
            >
              <X size={18} />
            </button>
          </div>
        )}
      </section>
      <div className="home-bottom">
        <section className="assistant-card">
          <div className="assistant-orb">
            <Sparkles size={27} />
          </div>
          <div>
            <span className="eyebrow">MEET YOUR TRAVEL COMPANION</span>
            <h2>A little guidance. A world of possibilities.</h2>
            <p>Wherever you’re headed, Journey AI is here to help.</p>
          </div>
          <button
            className="button assistant-button"
            onClick={() => setAssistantOpen(true)}
          >
            <Mic size={17} /> Ask Journey AI <ArrowUpRight size={16} />
          </button>
        </section>
        <section className="network-panel">
          <div className="network-heading">
            <h2>Network pulse</h2>
            <span className="tiny-live">
              <span className="status-dot" /> ALL SYSTEMS ONLINE
            </span>
          </div>
          <div className="network-grid">
            {networkStatus.map((item) => (
              <div key={item.id}>
                <ModeIcon mode={item.id} size={18} />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.status}</small>
                </span>
                <span className="status-dot" />
              </div>
            ))}
          </div>
          <span className="network-disclaimer">
            Simulated network status · Competition concept
          </span>
        </section>
      </div>
      {assistantOpen && (
        <div className="modal-backdrop" onClick={() => setAssistantOpen(false)}>
          <div
            className="assistant-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assistant-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setAssistantOpen(false);
              if (e.key === "Tab") {
                e.preventDefault();
                e.currentTarget.querySelector("button").focus();
              }
            }}
          >
            <span className="assistant-orb">
              <Mic size={28} />
            </span>
            <span className="badge violet">JOURNEY AI · PREVIEW</span>
            <h2 id="assistant-title">Your next travel companion.</h2>
            <p>
              Voice-powered journey planning is coming soon. For now, use the
              journey planner to explore your connected island.
            </p>
            <button
              autoFocus
              className="button primary"
              onClick={() => setAssistantOpen(false)}
            >
              Back to exploring <ArrowRight size={17} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
