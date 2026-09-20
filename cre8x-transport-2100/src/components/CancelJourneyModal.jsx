import { TriangleAlert } from "lucide-react";
import { formatFare } from "../data/journeys";
import Modal from "./Modal";
import "./Ticket.css";

const TITLE_ID = "cancel-journey-title";

/** Confirms cancelling a booking and states plainly that nothing is refunded. */
export default function CancelJourneyModal({
  open,
  booking,
  onClose,
  onConfirm,
}) {
  if (!open || !booking) return null;
  return (
    <Modal onClose={onClose} labelledBy={TITLE_ID} className="cj-dialog">
      <div className="bk-body cj-body">
        <span className="cj-icon">
          <TriangleAlert size={30} />
        </span>
        <h2 id={TITLE_ID}>Cancel this journey?</h2>
        <p>
          Booking {booking.reference} · {booking.from} → {booking.to},{" "}
          {booking.date} at {booking.departure}. Your ticket and seats will be
          released.
        </p>
        <p className="cj-warning" role="note">
          <strong>No refund.</strong> The {formatFare(booking.total)} you paid
          will not be returned if you cancel.
        </p>
        <div className="cj-actions">
          <button type="button" className="bk-primary" onClick={onClose}>
            Keep my journey
          </button>
          <button type="button" className="cj-danger" onClick={onConfirm}>
            Cancel journey
          </button>
        </div>
      </div>
    </Modal>
  );
}
