import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  CornerDownRight,
  Download,
  Info,
  Share2,
  Wallet,
  X,
} from "lucide-react";
import { formatFare } from "../data/journeys";
import { qrMatrix, renderTicketPng } from "../utils/ticketImage";
import { seatSummary } from "../utils/booking";
import logo from "../assets/logo.png";
import "./Ticket.css";

const QUIET = 4;

function TicketQR({ booking }) {
  const matrix = useMemo(() => qrMatrix(booking), [booking]);
  const size = matrix.length + QUIET * 2;
  const path = matrix
    .flatMap((row, r) =>
      row.map((dark, c) => (dark ? `M${c + QUIET} ${r + QUIET}h1v1h-1z` : "")),
    )
    .join("");
  return (
    <div className="tc-qr">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`QR code for booking ${booking.reference}`}
        shapeRendering="crispEdges"
      >
        <rect width={size} height={size} fill="#fff" />
        <path d={path} fill="#0a1626" />
      </svg>
      <span className="tc-qr-badge">
        <img src={logo} alt="" />
      </span>
    </div>
  );
}

/** The confirmed-booking ticket with download and share actions. */
export default function Ticket({ booking, titleId, onClose, children }) {
  const [status, setStatus] = useState("");
  const say = (message) => setStatus(message);

  const blob = () => renderTicketPng(booking, logo);

  const download = async () => {
    try {
      const png = await blob();
      const url = URL.createObjectURL(png);
      const link = document.createElement("a");
      link.href = url;
      link.download = `moveone-ticket-${booking.reference}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      say("Ticket saved as an image.");
    } catch {
      say("Couldn't create the ticket image. Please try again.");
    }
  };

  const share = async () => {
    const summary = `My moveone journey ${booking.from} → ${booking.to}, ${booking.date} at ${booking.departure}. Booking ${booking.reference}.`;
    try {
      const file = new File(
        [await blob()],
        `moveone-ticket-${booking.reference}.png`,
        {
          type: "image/png",
        },
      );
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "moveone ticket",
          text: summary,
        });
        say("Ticket shared.");
      } else if (navigator.share) {
        await navigator.share({ title: "moveone ticket", text: summary });
        say("Ticket shared.");
      } else {
        await navigator.clipboard.writeText(summary);
        say("Ticket details copied to the clipboard.");
      }
    } catch (error) {
      if (error?.name !== "AbortError")
        say("Sharing isn't available right now.");
    }
  };

  const seatLines = seatSummary(booking);

  return (
    <div className="tc">
      <header className="tc-header">
        <span className="tc-check">
          <Check size={34} />
        </span>
        <div>
          <h2 id={titleId} tabIndex={-1}>
            Booking Confirmed!
          </h2>
          <p>Your journey to {booking.to} is all set.</p>
          <small>Ticket for {booking.email} · demo, no email is sent</small>
        </div>
        <button
          type="button"
          className="bk-close"
          aria-label="Close ticket"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>

      <article className="tc-ticket" aria-label="Journey ticket">
        <div className="tc-brand">
          <span className="tc-logo">
            <img src={logo} alt="" />
            <span>
              moveone
              <small>THE WAY FORWARD.</small>
            </span>
          </span>
          <span className="tc-ticket-title">Journey Ticket</span>
          <span className="tc-badge">CONFIRMED</span>
        </div>

        <div className="tc-route">
          <div className="tc-cities">
            <div>
              <small>FROM</small>
              <strong>{booking.from}</strong>
            </div>
            <ArrowRight size={24} aria-hidden="true" />
            <div className="end">
              <small>TO</small>
              <strong>{booking.to}</strong>
            </div>
          </div>
          <dl className="tc-times">
            <div>
              <CalendarDays size={20} aria-hidden="true" />
              <dt>Date</dt>
              <dd>{booking.date}</dd>
            </div>
            <div>
              <Clock3 size={20} aria-hidden="true" />
              <dt>Departure</dt>
              <dd>{booking.departure}</dd>
            </div>
            <div>
              <CornerDownRight size={20} aria-hidden="true" />
              <dt>Arrival</dt>
              <dd>{booking.arrival}</dd>
            </div>
          </dl>
        </div>

        <div className="tc-tear" aria-hidden="true" />

        <div className="tc-body">
          <dl className="tc-details">
            <div>
              <dt>Passenger</dt>
              <dd>
                {booking.name}
                {booking.passengers > 1 && (
                  <span className="tc-more">
                    + {booking.passengers - 1} more passenger
                    {booking.passengers > 2 ? "s" : ""}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>Seat No.</dt>
              <dd className="big">
                {seatLines.map((line) => (
                  <span key={line.label ?? "seats"}>
                    {line.label && <small>{line.label}</small>}
                    {line.text}
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt>Service</dt>
              <dd>
                {booking.services.map((service) => (
                  <span key={service.name}>{service.name}</span>
                ))}
              </dd>
            </div>
          </dl>

          <figure className="tc-scan">
            <TicketQR booking={booking} />
            <figcaption>
              Scan this QR code
              <br />
              at boarding and transfers
            </figcaption>
          </figure>

          <dl className="tc-details right">
            <div>
              <dt>Booking ID</dt>
              <dd>{booking.reference}</dd>
            </div>
            <div>
              <dt>Total Fare</dt>
              <dd className="big">{formatFare(booking.total)}</dd>
            </div>
          </dl>
        </div>
      </article>

      <div className="tc-actions">
        <button type="button" onClick={download}>
          <Download size={20} /> Download Ticket
        </button>
        <button type="button" onClick={share}>
          <Share2 size={20} /> Share Ticket
        </button>
        <button
          type="button"
          onClick={() =>
            say("Wallet passes aren't available in this demo yet.")
          }
        >
          <Wallet size={20} /> Add to Wallet
        </button>
      </div>
      <p className="tc-status" role="status">
        {status}
      </p>

      <aside className="tc-info" aria-label="Important information">
        <Info size={22} aria-hidden="true" />
        <div>
          <strong>Important Information</strong>
          <ul>
            <li>
              Arrive at the departure point at least 10 minutes before
              departure.
            </li>
            <li>Keep your QR code ready for scanning.</li>
            <li>
              Your route is locked after payment. Track it on Live Map, or
              cancel there (cancelled journeys are not refunded).
            </li>
          </ul>
        </div>
        <span className="tc-script">Have a great journey!</span>
      </aside>

      <div className="tc-footer">{children}</div>
    </div>
  );
}
