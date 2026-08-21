import type { Metadata } from 'next'
import { getServerSideURL } from './getURL'

const defaultOpenGraph: Metadata['openGraph'] = {
  type: 'website',
  description: 'Independent conversations about democracy, governance and civic technology.',
  images: [
    {
      url: `${getServerSideURL()}/og-default.jpg`,
      width: 1200,
      height: 630,
      alt: 'Democracy Innovators Podcast',
    },
  ],
  siteName: 'Democracy Innovators Podcast',
  title: 'Democracy Innovators Podcast',
}

export const mergeOpenGraph = (og?: Metadata['openGraph']): Metadata['openGraph'] => {
  return {
    ...defaultOpenGraph,
    ...og,
    images: og?.images ? og.images : defaultOpenGraph.images,
  }
}
