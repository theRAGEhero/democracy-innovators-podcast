import { getEpisode, getEpisodes, getEpisodeContext } from '@/lib/content'
import { RelatedEpisodes } from '@/components/RelatedEpisodes'
import { ShareLinks } from '@/components/ShareLinks'
import { Comments } from '@/components/Comments'
import { TranscriptTabs } from '@/components/TranscriptTabs'
import { normalizeChapters, chapterJsonLd, buildTranscriptChapters, videoObjectJsonLd } from '@/lib/chapters'
import { embedYouTube, extractCastopodEpisodeUrl, extractYouTubeId, rewriteSupportLinks } from '@/lib/embeds'
import { annotateSpeakers } from '@/lib/speakers'
import { transcriptLinks } from '@/lib/links'
import { breadcrumbJsonLd, metaDescription } from '@/lib/seo'
import Image from 'next/image'
import { MobileEpisodeBar } from '@/components/MobileEpisodeBar'
import { getServerSideURL } from '@/lib/getURL'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PlayEpisodeButton } from '@/components/PlayEpisodeButton'
import { PlayFromQuery } from '@/components/PlayFromQuery'
import { AskArchiveButton } from '@/components/Chatbot'

export const revalidate = 3600

export async function generateStaticParams() {
  const { docs } = await getEpisodes()
  return docs.map((episode) => ({ slug: episode.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const episode = await getEpisode((await params).slug)
  if (!episode) return { robots: { index: false, follow: false } }
  const description = metaDescription(episode.excerpt)
  return {
    title: episode.title,
    description,
    alternates: { canonical: `/episode/${episode.slug}` },
    openGraph: {
      type: 'article',
      title: episode.title,
      description,
      url: `/episode/${episode.slug}`,
      publishedTime: episode.publishedAt || undefined,
      images: episode.featureImageUrl
        ? [{ url: episode.featureImageUrl, alt: `${episode.title} cover art` }]
        : undefined,
    },
    twitter: episode.featureImageUrl ? { images: [episode.featureImageUrl] } : undefined,
  }
}

export default async function EpisodePage({ params }: { params: Promise<{ slug: string }> }) {
  const episode = await getEpisode((await params).slug)
  if (!episode) notFound()

  const guests = (episode.guests || []).filter((guest) => typeof guest === 'object')
  const topics = (episode.topics || []).filter((topic) => typeof topic === 'object')
  const organizations = (episode.organizations || []).filter((organization) => typeof organization === 'object')
  const projects = (episode.projects || []).filter((project) => typeof project === 'object')
  const chapters = normalizeChapters(episode.chapters)
  const episodeUrl = `${getServerSideURL()}/episode/${episode.slug}`
  const { related, previous, next } = await getEpisodeContext(episode)
  const { html: chapteredHtml, toc } = buildTranscriptChapters(rewriteSupportLinks(embedYouTube(episode.html || '')), episode.chapters)
  // After the chapter pass, never before: buildTranscriptChapters locates its
  // anchors on a normalised copy of the transcript in which the timestamp
  // digits count, so rewriting the speaker line first can shift the offsets.
  const { html: transcriptHtml, speakers } = annotateSpeakers(chapteredHtml, guests.map((guest) => guest.name))
  const usefulLinks = [
    ...guests.flatMap((guest) => guest.officialLinks?.map((link) => ({ label: link.label || guest.name, url: link.url })) || []),
    ...transcriptLinks(episode.html),
    ...organizations.filter((organization) => organization.website).map((organization) => ({ label: organization.name, url: organization.website! })),
    ...projects.filter((project) => project.website).map((project) => ({ label: project.name, url: project.website! })),
  ].filter((link, index, links) => links.findIndex((item) => item.url === link.url) === index)
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'PodcastEpisode',
    name: episode.title,
    description: episode.excerpt,
    datePublished: episode.publishedAt,
    url: episodeUrl,
    image: episode.featureImageUrl || undefined,
    inLanguage: 'en',
    partOfSeries: {
      '@type': 'PodcastSeries',
      name: 'Democracy Innovators Podcast',
      url: getServerSideURL(),
    },
    ...(guests.length
      ? {
          actor: guests.map((guest) => ({
            '@type': 'Person',
            name: guest.name,
            url: `${getServerSideURL()}/people/${guest.slug}`,
          })),
        }
      : {}),
    ...(topics.length ? { about: topics.map((topic) => topic.name) } : {}),
    ...(chapters.length ? { hasPart: chapterJsonLd(chapters, episodeUrl) } : {}),
  }
  const youtubeId = extractYouTubeId(episode.videoUrl, episode.html)
  const castopodUrl = extractCastopodEpisodeUrl(episode.html)
  const playerEpisode = episode.audioUrl ? { id: episode.id, slug: episode.slug, title: episode.title, audioUrl: episode.audioUrl, coverUrl: episode.squareCoverUrl || episode.featureImageUrl, castopodUrl, chapters } : null
  const jsonLd: object[] = [
    schema,
    breadcrumbJsonLd([
      { name: 'Home', url: getServerSideURL() },
      { name: 'Episodes', url: `${getServerSideURL()}/episodes` },
      { name: episode.title, url: episodeUrl },
    ]),
  ]
  if (youtubeId) {
    jsonLd.push(
      videoObjectJsonLd({
        youtubeId,
        name: episode.title,
        description: episode.excerpt,
        uploadDate: episode.publishedAt,
        episodeUrl,
        chapters,
      }),
    )
  }

  return (
    <main className="episode-page">
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd.length === 1 ? jsonLd[0] : jsonLd) }}
        type="application/ld+json"
      />
      <Link className="back-link" href="/episodes">← All episodes</Link>
      <header className="episode-hero">
        <div className="episode-heading">
          <p className="section-label">Podcast conversation</p>
          <h1>{episode.title}</h1>
          <p className="episode-deck">{episode.excerpt}</p>
          {guests.length ? (
            <div className="entity-links">
              {guests.map((guest) => (
                <Link href={`/people/${guest.slug}`} key={guest.id}>{guest.name}</Link>
              ))}
            </div>
          ) : null}
          <div className="episode-hero-actions">
            {playerEpisode ? <PlayEpisodeButton className="primary-button" episode={playerEpisode} label="Play episode" /> : castopodUrl ? <a className="primary-button" href={castopodUrl} rel="noreferrer" target="_blank">Listen in Castopod ↗</a> : null}
            <AskArchiveButton />
          </div>
        </div>
        {episode.featureImageUrl ? (
          <Image
            alt={`${episode.title} cover art`}
            className="episode-cover"
            src={episode.featureImageUrl}
            width={1280}
            height={720}
            priority
            sizes="(max-width: 900px) 100vw, 760px"
          />
        ) : null}
      </header>

      {topics.length ? (
        <aside className="topic-strip" aria-label="Episode topics">
          <span>Filed under</span>
          {topics.map((topic) => <Link href={`/topics/${topic.slug}`} key={topic.id}>{topic.name}</Link>)}
        </aside>
      ) : null}

      <section className="transcript-layout">
        <aside className="transcript-aside">
          <p className="section-label">Transcript</p>
          <p>Automatically transcribed and lightly formatted. It may contain errors.</p>
          <p>Use “Ask the archive” to explore this conversation with cited answers.</p>
          <TranscriptTabs toc={toc} episode={playerEpisode} speakers={speakers} links={usefulLinks} />
          <AskArchiveButton className="aside-ask-button" />
          <ShareLinks title={episode.title} url={episodeUrl} />
        </aside>
        <article className={`episode-content${playerEpisode ? ' has-native-audio' : ''}`} dangerouslySetInnerHTML={{ __html: transcriptHtml }} id="episode-player" />
      </section>
      <RelatedEpisodes related={related} previous={previous} next={next} />
      <Comments episodeId={episode.id} />
      <PlayFromQuery episode={playerEpisode} />
      <MobileEpisodeBar episode={playerEpisode} title={episode.title} url={episodeUrl} />
    </main>
  )
}
