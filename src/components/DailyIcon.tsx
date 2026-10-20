/**
 * The daily challenge's mark on the launch screen.
 *
 * A globe for the global board: its meridians turn for a few seconds on load
 * (under five, so no pause control is needed) and again while the link is
 * hovered or focused; reduced motion keeps it still. Once every attempt for
 * the day is played, it becomes a check mark.
 */
export function DailyIcon({ done }: { done: boolean }) {
  if (done) {
    return (
      <svg viewBox="0 0 24 24" className="daily-icon" aria-hidden="true" data-done="true">
        <circle cx="12" cy="12" r="10.25" fill="currentColor" />
        <path d="M7.2 12.4l3.2 3.2 6.4-6.8" fill="none" stroke="var(--canvas)" strokeWidth="2.2" strokeLinecap="square" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="daily-icon globe" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M3.6 7h16.8M3.6 17h16.8" strokeWidth="1.1" />
        <ellipse className="meridian meridian-a" cx="12" cy="12" rx="10" ry="10" />
        <ellipse className="meridian meridian-b" cx="12" cy="12" rx="10" ry="10" />
      </g>
    </svg>
  );
}
