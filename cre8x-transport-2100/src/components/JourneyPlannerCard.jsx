import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownUp,
  ArrowRight,
  LocateFixed,
  MapPin,
  Circle,
} from "lucide-react";
import { journeyQuery } from "../data/journeys";
import { locations } from "../data/network";
import GlassSelect from "./GlassSelect";
export default function JourneyPlannerCard() {
  const [from, setFrom] = useState("Maharagama");
  const [to, setTo] = useState("Galle");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  function submit(event) {
    event.preventDefault();
    if (from === to) {
      setMessage("Choose a destination different from your starting point.");
      return;
    }
    navigate(`/journey?${journeyQuery(from, to, "recommended", "include")}`);
  }
  return (
    <form className="planner glass-panel" onSubmit={submit}>
      <div className="planner-heading">
        <span className="eyebrow">LET’S GET YOU THERE</span>
      </div>
      <h2>Where to next?</h2>
      <p>One journey. Every way to move.</p>
      <div className="location-fields">
        <label className="location-field">
          <Circle size={17} />
          <span>
            <span className="field-label">FROM</span>
            <GlassSelect
              aria-label="Starting location"
              className="location-select"
              options={locations.map((location) => ({
                label: location.name,
                value: location.name,
              }))}
              value={from}
              onChange={(value) => {
                if (value === to) {
                  setMessage("Choose a starting point different from your destination.");
                  return;
                }
                setFrom(value);
                setMessage("");
              }}
            />
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
            <GlassSelect
              aria-label="Destination"
              className="location-select"
              options={locations.map((location) => ({
                label: location.name,
                value: location.name,
              }))}
              value={to}
              onChange={(value) => {
                if (value === from) {
                  setMessage("Choose a destination different from your starting point.");
                  return;
                }
                setTo(value);
                setMessage("");
              }}
            />
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
