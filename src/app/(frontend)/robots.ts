import { getServerSideURL } from '@/lib/getURL'
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const origin = getServerSideURL()
  return { rules: [{ userAgent: '*', allow: '/', disallow: ['/admin/', '/api/'] }, { userAgent: 'OAI-SearchBot', allow: '/' }], sitemap: `${origin}/sitemap.xml` }
}
