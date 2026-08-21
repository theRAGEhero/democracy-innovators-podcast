import type { Metadata } from 'next'

import { ContactForm } from '@/components/ContactForm'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Contact the Democracy Innovators Podcast team.',
  alternates: { canonical: '/contact' },
}

export default function ContactPage() {
  return (
    <main className="inner-page contact-page">
      <header className="page-intro contact-intro">
        <p className="section-label">Contact</p>
        <h1>Send a note to the editors.</h1>
        <p>Questions, guest suggestions, corrections and collaboration ideas for the Democracy Innovators archive.</p>
      </header>
      <section className="contact-layout">
        <div className="contact-copy">
          <p className="section-label">Editorial inbox</p>
          <h2>Useful context helps us respond faster.</h2>
          <p>Tell us which episode, person, project or topic your message relates to. Do not send sensitive personal information through this form.</p>
          <a href="mailto:ale@9minuti.it">ale@9minuti.it</a>
        </div>
        <ContactForm />
      </section>
    </main>
  )
}
