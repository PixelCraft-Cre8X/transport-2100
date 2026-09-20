import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Modal from "./Modal";
import Ticket from "./Ticket";

const TITLE_ID = "ticket-modal-title";

/** Reopens a confirmed booking's ticket. `trackHref` adds a link to Live Map. */
export default function TicketModal({ open, booking, onClose, trackHref }) {
  if (!open || !booking) return null;
  return (
    <Modal onClose={onClose} labelledBy={TITLE_ID} className="tc-dialog">
      <div className="bk-body">
        <Ticket booking={booking} titleId={TITLE_ID} onClose={onClose}>
          <button type="button" className="bk-primary" onClick={onClose}>
            Done
          </button>
          {trackHref && (
            <Link className="bk-secondary" to={trackHref}>
              Track journey <ArrowRight size={18} />
            </Link>
          )}
        </Ticket>
      </div>
    </Modal>
  );
}
