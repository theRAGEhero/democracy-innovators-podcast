import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'About', description: 'About Democracy Innovators Podcast and its editorial mission.', alternates: { canonical: '/about' } }

export default function AboutPage() {
  return <main className="inner-page"><header className="page-intro"><p className="section-label">Independent · Curious · Rigorous</p><h1>About the podcast</h1><p>Democracy Innovators is an independent publication exploring democracy, governance and civic technology through conversations with people doing the work.</p></header><div className="profile-grid"><section><p className="section-label">Mission</p><h2>Document practical democratic innovation.</h2><p>We share the experience of civic hackers, public innovators, researchers and reformers developing new forms of participation and collective decision-making.</p></section><aside><p className="section-label">Editors</p><p>Founded by Alessandro Oppo and Carlo Michaelis in 2025.</p><a href="mailto:ale@9minuti.it">Contact the podcast</a></aside></div></main>
}
