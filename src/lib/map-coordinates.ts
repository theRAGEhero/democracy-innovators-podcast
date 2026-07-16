export type Coordinates = { latitude: number; longitude: number }

const COUNTRY_CENTROIDS: Record<string, Coordinates> = {
  AT: { latitude: 47.6, longitude: 14.2 },
  BE: { latitude: 50.6, longitude: 4.5 },
  BR: { latitude: -10.8, longitude: -52.9 },
  CH: { latitude: 46.8, longitude: 8.2 },
  CZ: { latitude: 49.8, longitude: 15.5 },
  DE: { latitude: 51.2, longitude: 10.4 },
  DK: { latitude: 56.1, longitude: 10.0 },
  EE: { latitude: 58.7, longitude: 25.0 },
  ES: { latitude: 40.4, longitude: -3.7 },
  EU: { latitude: 50.85, longitude: 4.35 },
  FR: { latitude: 46.2, longitude: 2.2 },
  GB: { latitude: 54.2, longitude: -2.5 },
  GL: { latitude: 18.0, longitude: 8.0 },
  IL: { latitude: 31.0, longitude: 35.0 },
  IS: { latitude: 64.9, longitude: -18.6 },
  IT: { latitude: 42.8, longitude: 12.8 },
  JP: { latitude: 36.2, longitude: 138.3 },
  NL: { latitude: 52.2, longitude: 5.3 },
  NZ: { latitude: -41.0, longitude: 174.0 },
  PL: { latitude: 52.0, longitude: 19.1 },
  PT: { latitude: 39.6, longitude: -8.0 },
  RS: { latitude: 44.0, longitude: 20.8 },
  SE: { latitude: 62.0, longitude: 15.0 },
  SK: { latitude: 48.7, longitude: 19.7 },
  US: { latitude: 39.8, longitude: -98.6 },
}

const PLACE_COORDINATES: Array<[RegExp, Coordinates]> = [
  [/southampton/i, { latitude: 50.91, longitude: -1.4 }],
  [/paris/i, { latitude: 48.86, longitude: 2.35 }],
  [/brussels/i, { latitude: 50.85, longitude: 4.35 }],
  [/bonn/i, { latitude: 50.74, longitude: 7.1 }],
  [/rome|aquino|frosinone/i, { latitude: 41.9, longitude: 12.5 }],
  [/san francisco/i, { latitude: 37.77, longitude: -122.42 }],
  [/davis/i, { latitude: 38.54, longitude: -121.74 }],
  [/lisbon/i, { latitude: 38.72, longitude: -9.14 }],
  [/new york|nyu/i, { latitude: 40.71, longitude: -74.01 }],
  [/new haven|yale/i, { latitude: 41.31, longitude: -72.93 }],
  [/boulder/i, { latitude: 40.02, longitude: -105.27 }],
  [/berlin/i, { latitude: 52.52, longitude: 13.4 }],
  [/milan/i, { latitude: 45.46, longitude: 9.19 }],
  [/houston/i, { latitude: 29.76, longitude: -95.37 }],
  [/cambridge|boston/i, { latitude: 42.37, longitude: -71.11 }],
  [/washington/i, { latitude: 38.9, longitude: -77.04 }],
  [/barcelona/i, { latitude: 41.39, longitude: 2.17 }],
  [/prešov|presov/i, { latitude: 49.0, longitude: 21.24 }],
  [/birmingham/i, { latitude: 52.49, longitude: -1.89 }],
  [/vienna/i, { latitude: 48.21, longitude: 16.37 }],
  [/wellington/i, { latitude: -41.29, longitude: 174.78 }],
  [/fort collins/i, { latitude: 40.59, longitude: -105.08 }],
  [/prague/i, { latitude: 50.08, longitude: 14.44 }],
  [/tallinn/i, { latitude: 59.44, longitude: 24.75 }],
  [/turin/i, { latitude: 45.07, longitude: 7.69 }],
  [/harrogate/i, { latitude: 53.99, longitude: -1.54 }],
  [/munich/i, { latitude: 48.14, longitude: 11.58 }],
  [/reykjavik/i, { latitude: 64.15, longitude: -21.94 }],
  [/hertogenbosch|eindhoven/i, { latitude: 51.69, longitude: 5.3 }],
  [/geneva/i, { latitude: 46.2, longitude: 6.14 }],
  [/florence/i, { latitude: 43.77, longitude: 11.26 }],
  [/tokyo|tama/i, { latitude: 35.68, longitude: 139.76 }],
  [/auckland/i, { latitude: -36.85, longitude: 174.76 }],
  [/jersey city/i, { latitude: 40.72, longitude: -74.04 }],
]

export function coordinatesFor(input: { iso2?: string | null; place?: string | null; country?: string | null }) {
  const place = input.place || ''
  const placeMatch = PLACE_COORDINATES.find(([pattern]) => pattern.test(place))
  if (placeMatch) return placeMatch[1]

  const iso2 = (input.iso2 || '').trim().toUpperCase()
  if (iso2 && COUNTRY_CENTROIDS[iso2]) return COUNTRY_CENTROIDS[iso2]

  const country = (input.country || '').trim().toLowerCase()
  if (country === 'global') return { latitude: 0, longitude: 0 }
  if (country === 'europe') return COUNTRY_CENTROIDS.EU
  if (country === 'uk') return COUNTRY_CENTROIDS.GB
  if (country === 'usa') return COUNTRY_CENTROIDS.US

  return null
}

export function projectPoint(longitude: number, latitude: number) {
  return {
    x: ((longitude + 180) / 360) * 100,
    y: ((90 - latitude) / 180) * 50,
  }
}
