export default function Loading() {
  return (
    <main className="inner-page route-loading" aria-busy="true" aria-live="polite">
      <p className="section-label">Loading…</p>
      <div className="skeleton-stack" aria-hidden="true">
        <span className="skeleton skeleton-title" />
        <span className="skeleton skeleton-line" />
        <span className="skeleton skeleton-line short" />
      </div>
    </main>
  )
}
