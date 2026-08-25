import fs from 'node:fs'
import path from 'node:path'

// The Nextcloud share where the episode folders live: the SRT files uploaded
// for each recording, alongside audio, covers and notes.
//
// 🔒 READ-ONLY, and not by convention — by rule. Nothing in this module or its
// callers may write, rename, move or delete anything under this root, nor put a
// temporary file there. It is someone's working share, not our storage. Every
// function here opens files for reading and nothing else.
//
// Lifted out of scripts/import-chapters.ts so that the Castopod importer can
// reach the same files without duplicating the folder-naming rules.

export const NEXTCLOUD_ROOT =
  '/var/lib/docker/volumes/nextcloud_nextcloud_data/_data/data/alex/files/Podcast'
export const SUBDIRS = ['Episodes', 'ITA - Episodes', '_Archive']

export const FOLDER_ALIASES: Record<string, string> = {
  'rober bjarnason': 'robert-bjarnason-about-the-citizens-foundation-and-how-technology-supports-participatory-democracy',
  'helene landemore': 'helene',
  'max bugani': 'massimo-bugani-and-the-rousseau-platform-a-democratic-experiment',
  'seth and cecile': 'cecile-green-seth-frey-on-the-commoning-standard-and-the-role-of-self-governance-for-democracy',
}

export function subjectFromFolder(folderName: string): string {
  const withoutNumber = folderName.replace(/^\s*(ITA\s*)?\d+\s*-\s*/i, '').trim()
  return withoutNumber.split(' - ')[0].trim()
}

// READ-ONLY: locates the best .srt in a folder. Prefers complete/verbatim
// variants (raw/original) since we match by content across the whole timeline.
export function findSrtFile(dir: string): string | undefined {
  const srts = fs.readdirSync(dir).filter((f) => /\.srt$/i.test(f))
  if (!srts.length) return undefined
  const rank = (name: string) => {
    const n = name.toLowerCase()
    if (/\braw\b/.test(n)) return 0
    if (/original/.test(n)) return 1
    if (/cleaned/.test(n)) return 2
    if (/edit/.test(n)) return 3
    return 4
  }
  const withSize = srts.map((f) => {
    const full = path.join(dir, f)
    return { full, rank: rank(f), size: fs.statSync(full).size }
  })
  withSize.sort((a, b) => a.rank - b.rank || b.size - a.size)
  return withSize[0].full
}

export type SrtFolder = { subject: string; dir: string; srt?: string }

/**
 * Every episode folder under the share, with its subject and best SRT.
 *
 * Folders are named "57 - Ryan Koch" or "06 - Josef Lentsch - Political Tech
 * Summit"; the leading number and any trailing qualifier are dropped to leave
 * the subject, which is what matches an episode.
 */
export function scanSrtFolders(root = NEXTCLOUD_ROOT): SrtFolder[] {
  const found: SrtFolder[] = []
  for (const sub of SUBDIRS) {
    const base = path.join(root, sub)
    if (!fs.existsSync(base)) continue
    for (const folder of fs.readdirSync(base)) {
      const dir = path.join(base, folder)
      if (!fs.statSync(dir).isDirectory()) continue
      found.push({ subject: subjectFromFolder(folder), dir, srt: findSrtFile(dir) })
    }
  }
  return found
}
