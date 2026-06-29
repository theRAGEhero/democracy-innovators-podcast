import { AudioLines, Heart, Podcast, RadioTower } from 'lucide-react'

const platforms = [
  {
    href: 'https://podcasts.apple.com/us/podcast/democracy-innovators-podcast/id1806614367',
    icon: Podcast,
    label: 'Apple',
  },
  {
    href: 'https://open.spotify.com/show/7e1DjGuFaHZlgDc6e7xmnr',
    icon: AudioLines,
    label: 'Spotify',
  },
  {
    href: 'https://podcast.democracyinnovators.com/@podcast',
    icon: RadioTower,
    label: 'Fediverse',
  },
  {
    href: 'https://www.paypal.com/ncp/payment/7KCR9XBSCQVMG',
    icon: Heart,
    label: 'Donate',
  },
]

export function MobilePlatformBar() {
  return (
    <nav aria-label="Listen on podcast platforms" className="mobile-platform-bar">
      {platforms.map(({ href, icon: Icon, label }) => (
        <a href={href} key={label} rel="noopener noreferrer" target="_blank">
          <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
          <span>{label}</span>
        </a>
      ))}
    </nav>
  )
}
