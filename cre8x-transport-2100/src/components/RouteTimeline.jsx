import { Check } from "lucide-react";
import { ModeIcon } from "./UI";
export default function RouteTimeline({ segments, currentIndex = -1 }) {
  return (
    <ol className="route-timeline">
      {segments.map((segment, i) => (
        <li
          key={`${segment.mode}-${i}`}
          className={`${segment.mode} ${currentIndex === i ? "current" : ""} ${currentIndex > i ? "completed" : ""}`}
        >
          <span className="timeline-icon">
            {currentIndex > i ? (
              <Check size={18} />
            ) : (
              <ModeIcon mode={segment.mode} size={18} />
            )}
          </span>
          <div>
            <div className="timeline-title">
              <h3>{segment.name}</h3>
              <span>{segment.minutes} min</span>
            </div>
            <p>{segment.stop}</p>
            <span className="timeline-status">
              {currentIndex === i
                ? "You are here"
                : currentIndex > i
                  ? "Completed"
                  : segment.status}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
