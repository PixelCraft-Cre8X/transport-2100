import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownUp,
  ArrowRight,
  LocateFixed,
  MapPin,
  Circle,
  Footprints,
} from "lucide-react";
import { locations } from "../data/network";
import { journeyQuery } from "../data/journeys";
export default function JourneyPlannerCard() {
  const [from, setFrom] = useState("Maharagama");
  const [to, setTo] = useState("Galle");
  const [walking, setWalking] = useState("include");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  function submit(event) {
    event.preventDefault();
    if (from === to) {
      setMessage("Choose a destination different from your starting point.");
      return;
    }
    navigate(`/journey?${journeyQuery(from, to, "recommended", walking)}`);
  }
  return (
    <form className="planner glass-panel" onSubmit={submit}>
      <div className="planner-heading">
        <span className="eyebrow">LET’S GET YOU THERE</span>
        <span className="tiny-live">
          <span className="status-dot" /> CONNECTED
        </span>
      </div>
      <h2>Where to next?</h2>
      <p>One journey. Every way to move.</p>
      <div className="location-fields">
        <label className="location-field">
          <Circle size={17} />
          <span>
            <span className="field-label">FROM</span>
            <select
              aria-label="Starting location"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setMessage("");
              }}
            >
              {locations.map((l) => (
                <option key={l.name}>{l.name}</option>
              ))}
            </select>
          </span>
        </label>
        <button
          className="swap-button"
          type="button"
          aria-label="Swap starting point and destination"
          onClick={() => {
            setFrom(to);
            setTo(from);
          }}
        >
          <ArrowDownUp size={16} />
        </button>
        <label className="location-field destination">
          <MapPin size={19} />
          <span>
            <span className="field-label">TO</span>
            <select
              aria-label="Destination"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setMessage("");
              }}
            >
              {locations.map((l) => (
                <option key={l.name}>{l.name}</option>
              ))}
            </select>
          </span>
        </label>
      </div>
      <button
        className="location-shortcut"
        type="button"
        onClick={() => {
          setFrom("Maharagama");
          setMessage(
            "Demo location set to Maharagama. Device location is not used.",
          );
        }}
      >
        <LocateFixed size={14} /> Use current location <span>Demo</span>
      </button>
      <label className="walking-preference">
        <Footprints size={16} />
        <span>Walking preference</span>
        <select
          aria-label="Walking preference"
          value={walking}
          onChange={(e) => setWalking(e.target.value)}
        >
          <option value="include">Include walks</option>
          <option value="low">Minimize walking</option>
        </select>
      </label>
      <button className="button primary" type="submit">
        Plan journey <ArrowRight size={18} />
      </button>
      <p className="planner-footnote">A smarter route, tailored to you.</p>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
    </form>
  );
}
