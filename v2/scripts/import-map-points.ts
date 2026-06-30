import path from 'node:path'

import 'dotenv/config'
import config from '@payload-config'
import { getPayload } from 'payload'
import XLSX from 'xlsx'

import { coordinatesFor } from '@/lib/map-coordinates'

type SheetRow = Record<string, string | number | boolean | null | undefined>

type Payload = Awaited<ReturnType<typeof getPayload>>

function value(row: SheetRow, key: string) {
  const raw = row[key]
  return raw === null || raw === undefined ? '' : String(raw).trim()
}

function slugify(input: string) {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function splitSourceUrls(input: string) {
  return input
    .split(/[;\n]+/)
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url) => ({ url }))
}

async function findEpisode(payload: Payload, title: string) {
  if (!title) return undefined
  const result = await payload.find({ collection: 'episodes', depth: 0, limit: 1, where: { title: { equals: title } } })
  return result.docs[0]?.id
}

async function upsertProject(payload: Payload, projectOrg: string, description: string) {
  const name = projectOrg.split('/').map((part) => part.trim()).filter(Boolean)[0]
  if (!name || name.toLowerCase() === 'global') return undefined
  const slug = slugify(name)
  const existing = await payload.find({ collection: 'projects', depth: 0, limit: 1, where: { slug: { equals: slug } } })
  if (existing.docs[0]) {
    await payload.update({ collection: 'projects', id: existing.docs[0].id, data: { description: existing.docs[0].description || description }, overrideAccess: true })
    return existing.docs[0].id
  }
  const created = await payload.create({ collection: 'projects', data: { name, slug, description }, overrideAccess: true })
  return created.id
}

async function upsertMapPoint(payload: Payload, slug: string, data: Record<string, unknown>) {
  const existing = await payload.find({ collection: 'map-points', depth: 0, limit: 1, where: { slug: { equals: slug } } })
  if (existing.docs[0]) return payload.update({ collection: 'map-points', id: existing.docs[0].id, data: data as never, overrideAccess: true })
  return payload.create({ collection: 'map-points', data: { slug, ...data } as never, overrideAccess: true })
}

async function main() {
  const workbookPath = process.argv[2]
  if (!workbookPath) throw new Error('Usage: npm run map:import -- /path/to/dataset.xlsx')

  const workbook = XLSX.readFile(path.resolve(workbookPath))
  const sheet = workbook.Sheets.Episode_Geo_Time_Data
  if (!sheet) throw new Error('Sheet Episode_Geo_Time_Data was not found.')

  const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: '' })
  const payload = await getPayload({ config })
  let imported = 0
  let skipped = 0

  for (const row of rows) {
    const episodeNo = value(row, 'episode_no')
    const episodeTitle = value(row, 'episode_title')
    const subject = value(row, 'guest_or_row_subject')
    const projectOrg = value(row, 'project_org')
    const sourceUrls = splitSourceUrls(value(row, 'source_urls'))
    const confidence = value(row, 'map_confidence') || 'Medium'
    const episode = await findEpisode(payload, episodeTitle)

    const personCoords = coordinatesFor({
      iso2: value(row, 'person_iso2'),
      country: value(row, 'person_map_country'),
      place: value(row, 'person_place_or_affiliation'),
    })
    if (subject && personCoords) {
      const slug = slugify(`person-${episodeNo}-${subject}`)
      await upsertMapPoint(payload, slug, {
        title: subject,
        kind: 'person',
        country: value(row, 'person_map_country') || value(row, 'person_country_primary'),
        iso2: value(row, 'person_iso2'),
        cityOrPlace: value(row, 'person_place_or_affiliation'),
        latitude: personCoords.latitude,
        longitude: personCoords.longitude,
        confidence,
        episodeNo,
        episodeTitle,
        timeLabel: value(row, 'published_date') || value(row, 'episode_year'),
        researchNotes: value(row, 'research_notes'),
        needsVerification: value(row, 'needs_verification'),
        sourceUrls,
        episode,
      })
      imported += 1
    } else {
      skipped += 1
    }

    const projectCoords = coordinatesFor({
      iso2: value(row, 'project_iso2'),
      country: value(row, 'project_map_country'),
      place: value(row, 'project_city_or_hq'),
    })
    if (projectOrg && projectCoords) {
      const project = await upsertProject(payload, projectOrg, value(row, 'research_notes'))
      const slug = slugify(`project-${episodeNo}-${projectOrg}`)
      await upsertMapPoint(payload, slug, {
        title: projectOrg,
        kind: 'project',
        country: value(row, 'project_map_country') || value(row, 'project_country_primary'),
        iso2: value(row, 'project_iso2'),
        cityOrPlace: value(row, 'project_city_or_hq'),
        latitude: projectCoords.latitude,
        longitude: projectCoords.longitude,
        confidence,
        episodeNo,
        episodeTitle,
        timeLabel: value(row, 'project_founded_or_key_year') || value(row, 'published_date') || value(row, 'episode_year'),
        researchNotes: value(row, 'research_notes'),
        needsVerification: value(row, 'needs_verification'),
        sourceUrls,
        episode,
        project,
      })
      imported += 1
    }
  }

  payload.logger.info(`Map import complete: ${imported} map points upserted, ${skipped} rows skipped for missing coordinates.`)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
