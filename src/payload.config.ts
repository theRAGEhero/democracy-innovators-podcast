import { sqliteAdapter } from '@payloadcms/db-sqlite'
import sharp from 'sharp'
import path from 'path'
import { buildConfig, PayloadRequest } from 'payload'
import { fileURLToPath } from 'url'

import { Categories } from './collections/Categories'
import { ArchiveChunks } from './collections/ArchiveChunks'
import { Comments } from './collections/Comments'
import { ContactSubmissions } from './collections/ContactSubmissions'
import { Episodes } from './collections/Episodes'
import { Guests } from './collections/Guests'
import { MapPoints } from './collections/MapPoints'
import { Media } from './collections/Media'
import { Organizations } from './collections/Organizations'
import { ApiLimits } from './collections/ApiLimits'
import { PageViews } from './collections/PageViews'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Projects } from './collections/Projects'
import { Sources } from './collections/Sources'
import { Topics } from './collections/Topics'
import { Users } from './collections/Users'
import { Footer } from './Footer/config'
import { Header } from './Header/config'
import { plugins } from './plugins'
import { defaultLexical } from '@/fields/defaultLexical'
import { getServerSideURL } from './lib/getURL'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  defaultMaxTextLength: 2_000_000,
  admin: {
    components: {
      // The `BeforeLogin` component renders a message that you see while logging into your admin panel.
      // Feel free to delete this at any time. Simply remove the line below.
      beforeLogin: ['@/components/BeforeLogin'],
      // The `BeforeDashboard` component renders the 'welcome' block that you see after logging into your admin panel.
      // Feel free to delete this at any time. Simply remove the line below.
      beforeDashboard: ['@/components/BeforeDashboard'],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
    user: Users.slug,
    livePreview: {
      breakpoints: [
        {
          label: 'Mobile',
          name: 'mobile',
          width: 375,
          height: 667,
        },
        {
          label: 'Tablet',
          name: 'tablet',
          width: 768,
          height: 1024,
        },
        {
          label: 'Desktop',
          name: 'desktop',
          width: 1440,
          height: 900,
        },
      ],
    },
  },
  // This config helps us configure global or default features that the other editors can inherit
  editor: defaultLexical,
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL || '',
    },
    // Use committed migrations rather than dev auto-push. Push's table-recreate
    // flow conflicts with libSQL on the shared relationships table (it retries
    // CREATE INDEX for indexes that already exist), which breaks `next dev`.
    //
    // The exception is the integration suite: it runs against a fresh empty
    // file, where there is no existing index to collide with, and the committed
    // migrations are incremental ALTERs that cannot build a schema from zero —
    // so push is the only way tables ever appear there. Set by vitest.setup.ts.
    push: process.env.PAYLOAD_SCHEMA_PUSH === 'true',
  }),
  collections: [
    Episodes,
    ArchiveChunks,
    MapPoints,
    Guests,
    Topics,
    Projects,
    Organizations,
    Sources,
    ContactSubmissions,
    Comments,
    PageViews,
    ApiLimits,
    Pages,
    Posts,
    Media,
    Categories,
    Users,
  ],
  cors: [getServerSideURL()].filter(Boolean),
  globals: [Header, Footer],
  plugins,
  secret: process.env.PAYLOAD_SECRET,
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  jobs: {
    access: {
      run: ({ req }: { req: PayloadRequest }): boolean => {
        // Allow logged in users to execute this endpoint (default)
        if (req.user) return true

        const secret = process.env.CRON_SECRET
        if (!secret) return false

        // If there is no logged in user, then check
        // for the Vercel Cron secret to be present as an
        // Authorization header:
        const authHeader = req.headers.get('authorization')
        return authHeader === `Bearer ${secret}`
      },
    },
    tasks: [],
  },
})
