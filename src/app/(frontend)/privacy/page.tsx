import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy & Cookies',
  description: 'Privacy and cookie information for Democracy Innovators Podcast.',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyPage() {
  return (
    <main className="inner-page">
      <header className="page-intro">
        <p className="section-label">Privacy &amp; Cookies</p>
        <h1>A small, privacy-conscious publication.</h1>
        <p>
          We collect only the information needed to operate comments, administration, security,
          newsletter subscriptions and the optional chatbot. We do not use advertising or
          marketing trackers.
        </p>
      </header>
      <article className="episode-content">
        <h2>Newsletter</h2>
        <p>
          If you subscribe, your email address and subscription status are processed by our
          existing Ghost publication at democracyinnovators.com. Ghost sends the confirmation and
          newsletter emails and provides an unsubscribe link. Newsletter subscription is optional
          and based on your consent.
        </p>

        <h2>Public comments</h2>
        <p>
          When you submit a comment, the name and message you provide are stored for publication
          and moderation. Your email address is required but kept private — it is never shown
          publicly and is used only to notify our editors of the comment and, if needed, to contact
          you about it.
        </p>

        <h2>Administration</h2>
        <p>Administrative sessions use secure cookies and are restricted to authorized editors.</p>

        <h2>Chatbot</h2>
        <p>
          Questions sent to the chatbot are processed by the configured AI provider. Do not submit
          sensitive personal information.
        </p>

        <h2>Cookies &amp; local storage</h2>
        <p>
          We keep our use of cookies to a minimum. We do not set any advertising, analytics or
          cross-site tracking cookies. The items below are either strictly necessary or a
          convenience preference, so no consent banner is required to allow them — the notice you
          see is informational only.
        </p>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>payload-token</code>
              </td>
              <td>Essential cookie (editors only)</td>
              <td>
                Keeps authorized editors signed in to the administration panel. Not set for
                ordinary visitors.
              </td>
            </tr>
            <tr>
              <td>
                <code>theme</code>
              </td>
              <td>Functional (browser local storage)</td>
              <td>Remembers your light or dark appearance preference on your own device.</td>
            </tr>
            <tr>
              <td>
                <code>cookie-notice-dismissed</code>
              </td>
              <td>Functional (browser local storage)</td>
              <td>Remembers that you have closed the cookie notice so it is not shown again.</td>
            </tr>
            <tr>
              <td>Ghost newsletter</td>
              <td>Third-party (on the subscribe page)</td>
              <td>
                The newsletter sign-up on our subscribe page is provided by Ghost
                (democracyinnovators.com) and may set its own cookies when you interact with it.
              </td>
            </tr>
            <tr>
              <td>Podcast &amp; media embeds</td>
              <td>Third-party (on some episode pages)</td>
              <td>
                Embedded audio or video players (for example the podcast player, Spotify or
                YouTube) may set their own cookies once loaded. These are governed by the
                respective provider&rsquo;s privacy policy.
              </td>
            </tr>
          </tbody>
        </table>

        <h2>Visitor statistics</h2>
        <p>
          We keep a simple, aggregate count of how many times each page is viewed. This counter is
          built into the site itself: it does not use cookies, does not store your IP address, and
          cannot identify or follow individual visitors. It only increases a running total per
          page.
        </p>

        <h2>Managing cookies</h2>
        <p>
          You can view and delete cookies and clear local storage at any time through your browser
          settings, and you can configure your browser to block cookies. Because the items above
          are essential or functional only, blocking them will not prevent you from reading the
          site, though the administration panel and your saved theme preference may not work as
          expected.
        </p>

        <h2>Contact</h2>
        <p>
          Messages sent through the contact form are stored for editorial follow-up and may also be
          delivered by email to the editors. For privacy questions or newsletter withdrawal
          requests, contact ale [at] 9minuti [dot] it.
        </p>

        <p>
          <em>Last updated: 19 July 2026.</em>
        </p>
      </article>
    </main>
  )
}
