import { shareTargets, supportUrl } from '@/lib/platforms'

// Desktop/tablet share row. The mobile bar (MobileEpisodeBar) covers ≤620px,
// where this block is hidden by CSS.
export function ShareLinks({ title, url }: { title: string; url: string }) {
  const targets = shareTargets(title, url)

  return (
    <aside className="share-links" aria-label="Share this episode">
      <p className="section-label">Share</p>
      <div className="share-links-row">
        {targets.map((target) => (
          <a href={target.href} key={target.label} rel="noreferrer" target="_blank">
            {target.label}
          </a>
        ))}
        <a className="share-support" href={supportUrl} rel="noreferrer" target="_blank">
          Support the podcast ↗
        </a>
      </div>
    </aside>
  )
}
