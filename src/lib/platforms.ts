// Single source for the podcast's external channels. Previously these URLs
// lived only in the /listen page, so the episode action sheet had a different
// (shorter) idea of where the show can be heard.

/** Our own redirect, so the donation address lives in one place.
 *  See src/app/(frontend)/paypal/route.ts. */
export const supportUrl = '/paypal'
export const fediverseProfile = 'https://podcast.democracyinnovators.com/@podcast'
export const podcastFeed = 'https://podcast.democracyinnovators.com/@podcast/feed.xml'

export type PlatformLink = { label: string; href: string; hint?: string }

export const listenPlatforms: PlatformLink[] = [
  { label: 'Apple Podcasts', href: 'https://podcasts.apple.com/us/podcast/democracy-innovators-podcast/id1806614367', hint: 'Podcast app' },
  { label: 'Spotify', href: 'https://open.spotify.com/show/7e1DjGuFaHZlgDc6e7xmnr', hint: 'Podcast app' },
  { label: 'YouTube', href: 'https://www.youtube.com/@DemocracyInnovatorsPodcast', hint: 'Video' },
  { label: 'Fediverse (Castopod)', href: fediverseProfile, hint: 'Open web' },
  { label: 'Podcast RSS feed', href: podcastFeed, hint: 'Feed' },
]

/** The three channels worth surfacing inside an episode, in listening order. */
export const episodeListenPlatforms: PlatformLink[] = listenPlatforms.filter((platform) =>
  ['Spotify', 'Apple Podcasts', 'Fediverse (Castopod)'].includes(platform.label),
)

// Mastodon has no universal share endpoint — every instance owns its own — so
// the Fediverse target goes through mastodonshare.com, which asks the reader
// for their instance and then hands off to it.
export function shareTargets(title: string, url: string): PlatformLink[] {
  const text = `${title} ${url}`
  return [
    { label: 'Telegram', href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}` },
    { label: 'Fediverse', href: `https://mastodonshare.com/?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}` },
    { label: 'Bluesky', href: `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}` },
    { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
    { label: 'Email', href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}` },
  ]
}
