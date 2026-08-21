'use client'

import type { ReactNode } from 'react'
import { PlayerProvider } from './PlayerProvider'
import { ArchiveAssistantProvider } from './Chatbot'

export function FrontendExperience({ children }: { children: ReactNode }) {
  return <PlayerProvider><ArchiveAssistantProvider>{children}</ArchiveAssistantProvider></PlayerProvider>
}
