import type { Episode } from '@/payload-types'

// What to print beside an episode in a list.
//
// This used to be the row's position, so the newest episode was always "01" and
// /episodes restarted the count on every page. The real number comes from the
// podcast feed, and three cases have to be told apart:
//
//   * the main series, 1-62 and counting
//   * the Italian channel, which numbers itself from 1 and would otherwise
//     masquerade as the main series' first three
//   * the introductory trailer, which has no number at all and should show
//     nothing rather than a borrowed one

export function episodeLabel(
  episode: Pick<Episode, 'episodeNumber' | 'episodeSeries'>,
): string | null {
  const number = episode.episodeNumber
  if (typeof number !== 'number' || !Number.isFinite(number) || number < 1) return null
  const padded = String(Math.floor(number)).padStart(2, '0')
  return episode.episodeSeries === 'ita' ? `IT ${padded}` : padded
}
