import { mockApi } from './demo/mockApi'

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

async function realApi<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: json === undefined ? rest.headers : { 'Content-Type': 'application/json', ...rest.headers },
    body: json === undefined ? rest.body : JSON.stringify(json),
  }).catch(() => {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0)
  })
  const data = await res.json().catch(() => ({}))
  // Session expired or account disabled mid-use: let the auth provider send the user back to the login page.
  if (res.status === 401 && !path.startsWith('/auth/login')) window.dispatchEvent(new Event('cratelog:unauthorized'))
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? res.statusText, res.status)
  return data as T
}

/** True for the static GitHub Pages build, where the API is replaced by an in-browser mock. */
export const IS_DEMO = import.meta.env.VITE_DEMO === 'true'

export const api: typeof realApi = IS_DEMO ? mockApi : realApi

export interface User {
  id: number
  email: string
  name: string
  role: 'admin' | 'user'
  currency: string
  shareCollection: number
  shareWishlist: number
  shareActivity: number
  /** Comma-separated ids of the shops to show search links for (see SHOPS in Market.tsx). */
  shops: string
}

export interface AdminUser extends Omit<User, 'shareCollection' | 'shareWishlist' | 'shareActivity' | 'shops'> {
  disabled: number
  createdAt: string
}

export const GRADES = ['M', 'NM', 'VG+', 'VG', 'G+', 'G', 'F', 'P'] as const
export type Grade = (typeof GRADES)[number]

export interface Copy {
  copyId: number
  releaseId: number
  title: string
  artist: string
  year: number | null
  country: string | null
  label: string | null
  catno: string | null
  format: string
  barcode: string | null
  /** Track titles joined into one string, for searching. */
  tracks: string | null
  hasCover: number
  mediaCondition: Grade | null
  sleeveCondition: Grade | null
  notes: string | null
  addedAt: string
  collectionIds: number[]
  forSale: number
  askingPrice: number | null
  priceCurrency: string | null
  /** Who added the copy, and who else owns it, if anyone. */
  ownerId: number
  coOwnerId: number | null
  ownerName: string
  coOwnerName: string | null
}

export interface SearchResult {
  id: number
  artist: string
  title: string
  year: number | null
  country: string | null
  format: string
  label: string | null
  catno: string | null
  barcode: string | null
  thumb: string | null
}

export interface SearchResponse {
  results: SearchResult[]
  page: number
  pages: number
  items: number
}

export interface ReleaseDetail {
  id: number
  masterId: number | null
  title: string
  artist: string
  year: number | null
  country: string | null
  label: string | null
  catno: string | null
  barcode: string | null
  format: string
  genres: string[]
  styles: string[]
  tracklist: Array<{ position: string; title: string; duration: string }>
  notes: string | null
  hasCover: number
}

export interface Trivia {
  /** The album's Wikipedia article, the artist's, or facts worked out from the record's own data. */
  source: 'album' | 'artist' | 'data'
  facts: string[]
  /** The Wikipedia article, for the two Wikipedia sources. */
  title: string | null
  url: string | null
}

export type OwnedCopy = Pick<Copy, 'copyId' | 'mediaCondition' | 'sleeveCondition' | 'notes' | 'addedAt' | 'collectionIds' | 'forSale' | 'askingPrice' | 'priceCurrency' | 'ownerId' | 'coOwnerId' | 'ownerName' | 'coOwnerName'>

export type WishItem = Omit<Copy, 'copyId' | 'mediaCondition' | 'sleeveCondition' | 'collectionIds' | 'forSale' | 'askingPrice' | 'priceCurrency' | 'ownerId' | 'coOwnerId' | 'ownerName' | 'coOwnerName'> & { wishId: number }

export interface Status {
  owned: Record<number, number>
  wishlisted: number[]
}

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'MXN', 'BRL', 'NZD', 'SEK', 'DKK', 'ZAR', 'NOK']

export interface CollectionTotals {
  records: number
  forSale: number
}

export interface CollectionGroup {
  id: number
  name: string
  count: number
}

export interface Counted {
  label: string
  count: number
}

export interface Stats {
  copies: number
  releases: number
  wishlist: number
  forSale: number
  byDecade: Counted[]
  byFormat: Counted[]
  byGenre: Counted[]
  byCountry: Counted[]
  topArtists: Counted[]
  topLabels: Counted[]
  addedByMonth: Counted[]
  recent: Array<{ releaseId: number; title: string; artist: string; hasCover: number }>
  value: { currency: string; estimated: number; pricedReleases: number; totalReleases: number }
  forSaleValue: Array<{ currency: string; total: number; count: number }>
}
