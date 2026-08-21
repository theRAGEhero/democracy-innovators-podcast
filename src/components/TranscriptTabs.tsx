'use client'

import { useState } from 'react'

import { ChapterIndex } from './ChapterIndex'
import type { PlayerEpisode } from './PlayerProvider'
import type { TocEntry } from '@/lib/chapters'
import type { Speaker } from '@/lib/speakers'

type UsefulLink = { label: string; url: string }

// The transcript sidebar used to stack five blocks and run far past the fold.
// On desktop they become tabs; below 900px the aside is a plain stacked column
// again (CSS unhides every panel), which also keeps the chapter bottom sheet
// reachable from the mobile dock.
export function TranscriptTabs({
  toc,
  episode,
  speakers,
  links,
}: {
  toc: TocEntry[]
  episode: PlayerEpisode | null
  speakers: Speaker[]
  links: UsefulLink[]
}) {
  const tabs = [
    toc.length ? { id: 'chapters', label: 'Chapters' } : null,
    speakers.length ? { id: 'voices', label: 'Voices' } : null,
    links.length ? { id: 'links', label: 'Links' } : null,
  ].filter((tab): tab is { id: string; label: string } => tab !== null)
  const [active, setActive] = useState(tabs[0]?.id ?? 'chapters')

  if (!tabs.length) return null
  const current = tabs.some((tab) => tab.id === active) ? active : tabs[0].id

  return (
    <div className="transcript-tabs-wrap">
      <div className="transcript-tabs" role="tablist" aria-label="Episode reference">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={current === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {toc.length ? (
        <div className="transcript-panel" id="panel-chapters" role="tabpanel" aria-labelledby="tab-chapters" hidden={current !== 'chapters'}>
          <ChapterIndex toc={toc} episode={episode} />
        </div>
      ) : null}

      {speakers.length ? (
        <div className="transcript-panel" id="panel-voices" role="tabpanel" aria-labelledby="tab-voices" hidden={current !== 'voices'}>
          <div className="speaker-key">
            <p className="section-label">Voices</p>
            <ul>
              {speakers.map((speaker) => (
                <li data-speaker={speaker.slot} key={speaker.name}>
                  {speaker.name}
                  <span>{speaker.turns}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {links.length ? (
        <div className="transcript-panel" id="panel-links" role="tabpanel" aria-labelledby="tab-links" hidden={current !== 'links'}>
          <div className="useful-links">
            <p className="section-label">From the conversation</p>
            {links.map((link) => (
              <a href={link.url} key={link.url} rel="noreferrer" target="_blank">{link.label} ↗</a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
