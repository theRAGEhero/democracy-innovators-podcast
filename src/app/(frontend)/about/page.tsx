import fs from 'node:fs'
import path from 'node:path'

import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { getEpisodes } from '@/lib/content'

export const metadata: Metadata = {
  title: 'About',
  description: 'About Democracy Innovators Podcast, its editorial mission and the two people who make it.',
  alternates: { canonical: '/about' },
}

// Portraits are optional on purpose. A missing file falls back to a monogram
// plate rather than a broken image, so the page is never wrong while it waits
// for a photograph — drop the file in and it simply appears.
const PHOTO_DIR = path.join(process.cwd(), 'public', 'about')
const photo = (file: string) => (fs.existsSync(path.join(PHOTO_DIR, file)) ? `/about/${file}` : null)

type Editor = {
  name: string
  initials: string
  role: string
  blurb: string
  file: string
  links: { label: string; href: string }[]
}

const editors: Editor[] = [
  {
    name: 'Alessandro Oppo',
    initials: 'AO',
    role: 'Host and founder',
    blurb:
      'Builds civic technology, hosts the conversations and keeps the archive. Based in Italy, working across '
      + 'participation tools, open government and the stubborn problem of getting people into a decision.',
    file: 'alessandro-oppo.jpg',
    links: [
      { label: 'LinkedIn', href: 'https://www.linkedin.com/in/alessandro-aygun-suleyman-oppo/' },
      { label: 'alexoppo.com', href: 'https://alexoppo.com' },
    ],
  },
  {
    name: 'Carlo Michaelis',
    initials: 'CM',
    role: 'Co-founder',
    blurb:
      'Came to the podcast from the question that has followed him since a school politics lesson in Germany: '
      + 'if a hundred people can meet and decide together, what do eighty million do instead?',
    file: 'carlo-michaelis.jpg',
    links: [{ label: 'LinkedIn', href: 'https://www.linkedin.com/in/carlo-michaelis/' }],
  },
]

function Portrait({ src, initials, name }: { src: string | null; initials: string; name: string }) {
  return (
    <div className="editor-portrait">
      {src ? (
        <Image alt={`${name}`} src={src} width={360} height={360} sizes="(max-width: 620px) 40vw, 180px" />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </div>
  )
}

export default async function AboutPage() {
  const { totalDocs } = await getEpisodes(1)

  return (
    <main className="inner-page">
      <header className="page-intro">
        <p className="section-label">Independent · Curious · Rigorous</p>
        <h1>About the podcast</h1>
        <p>
          Democracy Innovators is an independent publication exploring democracy, governance and civic
          technology through conversations with the people doing the work — {totalDocs} of them so far, each
          published with a full transcript you can search, quote and cite to the second.
        </p>
      </header>

      <div className="profile-grid">
        <section>
          <p className="section-label">Mission</p>
          <h2>Document practical democratic innovation.</h2>
          <p>
            We share the experience of civic hackers, public innovators, researchers and reformers developing
            new forms of participation and collective decision-making. Not commentary about democracy in the
            abstract, but the specifics: what was built, who used it, what broke, and what would be done
            differently next time.
          </p>
          <p>
            Every episode is transcribed and indexed, so the archive answers questions rather than merely
            storing them. Nothing here is sponsored or placed, and no guest pays or is paid to appear.
          </p>
        </section>
        <aside>
          <p className="section-label">The archive</p>
          <div>
            <span>{totalDocs} conversations</span>
            <span>Published since March 2025</span>
            <span>Full transcripts, chapters and citations</span>
          </div>
          <a href="mailto:ale@9minuti.it">Contact the podcast</a>
        </aside>
      </div>

      <section className="about-people">
        <p className="section-label">The editors</p>
        <div className="editor-grid">
          {editors.map((editor) => (
            <article className="editor-card" key={editor.name}>
              <Portrait src={photo(editor.file)} initials={editor.initials} name={editor.name} />
              <div className="editor-body">
                <h3>{editor.name}</h3>
                <p className="editor-role">{editor.role}</p>
                <p>{editor.blurb}</p>
                {editor.links.length ? (
                  <div className="entity-links">
                    {editor.links.map((link) => (
                      <a href={link.href} key={link.href} rel="me noreferrer" target="_blank">
                        {link.label} ↗
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="about-elsewhere">
        <p className="section-label">Elsewhere</p>
        <a className="blog-card" href="https://alexoppo.com" rel="noreferrer" target="_blank">
          <div className="blog-card-image">
            {photo('alexoppo.jpg') ? (
              <Image alt="" src={photo('alexoppo.jpg')!} width={640} height={420} sizes="(max-width: 900px) 100vw, 320px" />
            ) : (
              <span aria-hidden="true">AO</span>
            )}
          </div>
          <div className="blog-card-body">
            <h3>alexoppo.com</h3>
            <p>
              Alessandro&rsquo;s own site: essays on civic technology and democratic innovation, write-ups of
              the projects behind them, and a long series on blockchains and history.
            </p>
            <span className="text-link">Read the blog ↗</span>
          </div>
        </a>
      </section>

      <section className="about-next">
        <p className="section-label">Start listening</p>
        <div className="hero-actions">
          <Link className="primary-button" href="/episodes">Browse the episodes</Link>
          <Link className="text-link" href="/listen">Find us on your podcast app ↗</Link>
        </div>
      </section>
    </main>
  )
}
