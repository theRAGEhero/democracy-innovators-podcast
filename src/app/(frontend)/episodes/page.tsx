import { EpisodeRow } from '@/components/EpisodeRow'
import { getEpisodes } from '@/lib/content'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Episodes',
  description: 'Browse every Democracy Innovators Podcast conversation and transcript.',
}

export const revalidate = 3600

export default async function EpisodesPage() {
  const { docs: episodes } = await getEpisodes()
  return (
    <main className="inner-page">
      <header className="page-intro">
        <p className="section-label">Archive · {episodes.length} conversations</p>
        <h1>Episodes</h1>
        <p>Interviews and field notes from people building new forms of democratic practice.</p>
      </header>
      <div className="episode-list archive-list">
        {episodes.map((episode, index) => (
          <EpisodeRow episode={episode} index={index} key={episode.id} />
        ))}
      </div>
    </main>
  )
}
