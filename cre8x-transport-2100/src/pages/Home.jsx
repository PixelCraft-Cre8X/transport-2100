import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ArrowUpRight, Check, MapPin, X } from "lucide-react";
import JourneyPlannerCard from "../components/JourneyPlannerCard";
import { SectionHeader, TransportModeCard, ModeIcon } from "../components/UI";
import { journeyQuery } from "../data/journeys";
import { locations, networkStatus, transportModes } from "../data/network";

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

const initialQuickDestinations = [
  "Colombo Fort",
  "Galle",
  "Kandy",
  "Airport",
];

export default function Home() {
  const { onOpenAI } = useOutletContext();
  const [quickDestinations, setQuickDestinations] = useState(
    initialQuickDestinations,
  );
  const [draftDestinations, setDraftDestinations] = useState(
    initialQuickDestinations,
  );
  const [editorOpen, setEditorOpen] = useState(false);

  function openDestinationEditor() {
    setDraftDestinations(quickDestinations);
    setEditorOpen(true);
  }

  function toggleDestination(name) {
    setDraftDestinations((current) =>
      current.includes(name)
        ? current.filter((destination) => destination !== name)
        : current.length < 4
          ? [...current, name]
          : current,
    );
  }

  function saveDestinations() {
    if (draftDestinations.length !== 4) return;
    setQuickDestinations(draftDestinations);
    setEditorOpen(false);
  }

  return (
    <div className="home-page page-enter">
      <section className="hero-section">
        {desktop && (
          <picture className="hero-image">
            <source media="(max-width: 767px)" srcSet={mobile} />
            <img
              src={desktop}
              alt="Colombo in 2100 with elevated SkyRail, electric buses, and air taxis along the ocean"
            />
          </picture>
        )}
        <div className="hero-shade" />
        <div className="hero-layout">
          <div className="hero-copy">
            <h1>Welcome to MoveOne.</h1>
            <p>Smarter journeys, all in one place.</p>
          </div>
          <JourneyPlannerCard />
        </div>
      </section>

      <section className="quick-destinations" aria-labelledby="quick-destinations-title">
        <div className="quick-heading">
          <div>
            <span className="eyebrow">START WITH A FAMILIAR ROUTE</span>
            <h2 id="quick-destinations-title">Quick destinations</h2>
          </div>
          <button className="quick-change" type="button" onClick={openDestinationEditor}>
            Change
          </button>
        </div>
        <div className="quick-destination-list">
          {quickDestinations.map((name) => (
            <Link
              key={name}
              className="quick-destination-button"
              to={`/journey?${journeyQuery("Maharagama", name)}`}
            >
              <span className="quick-destination-icon">
                <MapPin size={16} />
              </span>
              <span className="quick-destination-copy">
                <strong>{name}</strong>
                <small>From Maharagama</small>
              </span>
              <ArrowUpRight size={14} />
            </Link>
          ))}
        </div>
      </section>

      <section className="transport-section">
        <SectionHeader eyebrow="TRANSPORT OPTIONS" title="Ways to move" />
        <div className="transport-grid">
          {transportModes
            .filter((mode) => mode.id !== "road")
            .map((mode) => (
              <TransportModeCard key={mode.id} mode={mode} />
            ))}
        </div>
      </section>

      <div className="home-bottom">
        <section className="assistant-card">
          <div className="assistant-orb" aria-hidden="true">
            <ModeIcon mode="sparkles" size={27} />
          </div>
          <div>
            <span className="eyebrow">JOURNEY AI</span>
            <h2>Plan your trip with voice.</h2>
          </div>
          <button className="button assistant-button" type="button" onClick={onOpenAI}>
            Ask Journey AI <ArrowUpRight size={16} />
          </button>
        </section>

        <section className="network-panel" aria-labelledby="network-status-title">
          <div className="network-heading">
            <h2 id="network-status-title">Network status</h2>
            <span className="tiny-live">ALL SYSTEMS ONLINE</span>
          </div>
          <div className="network-grid">
            {networkStatus.map((item) => (
              <div key={item.id} className="network-status-item">
                <ModeIcon mode={item.id} size={18} />
                <strong>{item.name}</strong>
                <span className="status-dot" aria-label="Online" />
              </div>
            ))}
          </div>
        </section>
      </div>

      {editorOpen && (
        <QuickDestinationEditor
          draftDestinations={draftDestinations}
          onToggle={toggleDestination}
          onSave={saveDestinations}
          onCancel={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}

function QuickDestinationEditor({
  draftDestinations,
  onToggle,
  onSave,
  onCancel,
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <section
        className="destination-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="destination-editor-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="destination-editor-header">
          <div>
            <span className="eyebrow">PERSONALISE YOUR SHORTCUTS</span>
            <h2 id="destination-editor-title">Quick destinations</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close destination editor" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>
        <p className="destination-editor-help">
          Choose exactly four places to keep close at hand.
        </p>
        <div className="destination-choice-list">
          {locations.map((location) => {
            const selected = draftDestinations.includes(location.name);
            const unavailable = !selected && draftDestinations.length >= 4;
            return (
              <button
                key={location.name}
                className={`destination-choice ${selected ? "selected" : ""}`}
                type="button"
                aria-pressed={selected}
                disabled={unavailable}
                onClick={() => onToggle(location.name)}
              >
                <MapPin size={16} />
                <span>{location.name}</span>
                <span className="choice-check">{selected && <Check size={14} />}</span>
              </button>
            );
          })}
        </div>
        <div className="destination-editor-actions">
          <button className="button secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="button primary" type="button" disabled={draftDestinations.length !== 4} onClick={onSave}>
            Save destinations
          </button>
        </div>
      </section>
    </div>
  );
}
