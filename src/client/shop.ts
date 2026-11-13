/**
 * Haszno Shop marketplace client — /api/v1/shop/* endpoints.
 *
 * Separate from HasznoClient to avoid touching the existing interface.
 * Uses the same HttpOptions (baseUrl, apiKey, fetch override for tests).
 *
 * Authentication: session cookie or Bearer token (haszno_...) from `haszno login`.
 */
import { readFileSync } from 'node:fs'
import { type HttpOptions, get, post, put, del, isShopToken } from './http.js'
import { resolveConnection } from './config.js'
import { HasznoApiError } from './error.js'

/** CLI version for User-Agent */
const CLI_VERSION = '0.3.0'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShopAttrDef {
  key: string
  label: string
  type: 'select' | 'number' | 'bool' | 'text' | string
  required?: boolean
  options?: Array<{ value: string; label: string } | string>
}

export interface ShopTaxonomySub {
  key: string
  label: string
  attrs: ShopAttrDef[]
}

export interface ShopTaxonomyCategory {
  key: string
  label: string
  emoji: string
  subcategories: ShopTaxonomySub[]
  attrs: ShopAttrDef[]
}

export interface ShopTaxonomy {
  categories: ShopTaxonomyCategory[]
  counties: string[]
}

export interface ShopAd {
  id: number
  title: string
  description: string | null
  category: string
  subcategory: string | null
  priceGross: number | null
  negotiable: boolean
  condition: string
  county: string
  city: string
  status: 'aktiv' | 'szunetel' | 'eladva' | 'torolve' | string
  reserved: boolean
  images: string[]
  attrs: Record<string, string | number | boolean>
  contactName: string | null
  contactPhone: string | null
  showPhone: boolean
  createdAt: string
  updatedAt: string
}

/** Seller's own ad — richer than the public AdSummary */
export interface ShopMyAd extends ShopAd {
  contactEmail: string
  resellable: boolean
  partnerCommissionPct: number
  inquiryCount?: number
  unreadInquiries?: number
  expiresAt?: string | null
  soldAt?: string | null
  soldPriceGross?: number | null
}

export interface ShopAdDetail extends ShopAd {
  viewCount?: number
  favoriteCount?: number
}

export interface ShopPriceHint {
  p25: number
  p75: number
  count: number
}

export interface ShopReservationAd {
  id: number
  title: string
  priceGross: number
  image: string | null
  status: string
}

export interface ShopReservation {
  id: number
  adId: number
  ad: ShopReservationAd
  status: 'fuggoben' | 'elfogadva' | 'elutasitva' | 'visszavonva' | 'teljesitve' | 'lejart' | string
  message: string | null
  offerPriceGross: number | null
  counterPriceGross?: number | null
  agreedPriceGross?: number | null
  buyerName: string
  buyerPhone: string | null
  buyerEmail: string | null
  sellerName: string
  sellerPhone: string | null
  sellerEmail: string | null
  heldUntil: string | null
  createdAt: string
  updatedAt: string
  decidedAt?: string | null
  soldPriceGross?: number | null
}

export interface ShopReservationSimple {
  id: number
  adId: number
  status: string
  offerPriceGross?: number | null
  counterPriceGross?: number | null
  agreedPriceGross?: number | null
  heldUntil: string | null
  createdAt: string
  updatedAt: string
  decidedAt: string | null
  soldPriceGross?: number | null
}

export interface ShopReservationMessage {
  id: number
  author: 'buyer' | 'seller' | string
  body: string
  createdAt: string
}

export interface ShopReservationReview {
  id: number
  author: 'buyer' | 'seller' | string
  rating: number
  comment: string | null
  createdAt: string
}

export interface ShopInquiryReply {
  id: number
  inquiryId: number
  message: string
  createdAt: string
}

export interface ShopSavedSearchFilters {
  q?: string
  cat?: string
  sub?: string
  min?: number
  max?: number
  county?: string
  cond?: string
  attrs?: Record<string, unknown>
}

export interface ShopSavedSearch {
  id: number
  name: string
  filters: ShopSavedSearchFilters
  alertEnabled: boolean
  lastAlertSentAt: string | null
  createdAt: string
}

export interface ShopDraft {
  payload: Record<string, unknown>
  updatedAt: string
}

export interface ShopUrlImportResult {
  title?: string
  description?: string
  price?: number | null
  images: string[]
  parsed: Record<string, unknown>
}

export interface ShopWatchResult {
  watched: boolean
}

export interface ShopApiToken {
  id: number
  name: string
  scope: string
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
}

export interface ShopSellerProfile {
  sellerType: 'maganszemely' | 'kereskedo' | null
  companyName: string | null
  companyAddress: string | null
  companyRegNumber: string | null
  declaredAt: string | null
}

export type ShopSellerProfileInput =
  | { sellerType: 'maganszemely' }
  | { sellerType: 'kereskedo'; companyName: string; companyAddress: string; companyRegNumber?: string | null }

export interface ShopInquiry {
  id: number
  adId: number
  adTitle?: string
  name: string
  email: string
  phone?: string | null
  message: string
  viaPartner?: string | null
  readAt: string | null
  createdAt: string
}

export interface ShopImageUploadResult {
  id: number
  url: string
}

export interface ShopFromPhotosResult {
  title?: string
  description?: string
  categoryId?: string
  subcategoryId?: string
  condition?: string
  suggestedPriceGross?: number
  attrs?: Record<string, string | number | boolean>
}

export interface ShopAdListResult {
  items: ShopAd[]
  total?: number
  page?: number
  pageSize?: number
}

export interface ShopReservationListResult {
  items: ShopReservation[]
}

export interface ShopFavoriteResult {
  ok: boolean
}

export interface ShopAdPostBody {
  category: string
  subcategory?: string | null
  title: string
  description: string
  priceGross: number | null
  negotiable: boolean
  condition: 'uj' | 'ujszeru' | 'hasznalt' | 'serult'
  /** Required (min 10 chars) when condition is 'hasznalt' or 'serult'. */
  defects?: string | null
  county: string
  city: string
  images: string[]
  attrs?: Record<string, string | number | boolean>
  contactName: string
  contactPhone?: string | null
  contactEmail: string
  showPhone: boolean
  resellable: boolean
  partnerCommissionPct: number
}

export interface ShopAdSearchParams {
  q?: string
  category?: string
  subcategory?: string
  minPrice?: number
  maxPrice?: number
  condition?: string
  county?: string
  city?: string
  sort?: 'newest' | 'price_asc' | 'price_desc'
  page?: number
}

export interface ShopLoginResult {
  token: string
  scope: string
  user: {
    email: string
    name: string
    shopName: string
  }
}

// ── Multipart upload helper ───────────────────────────────────────────────────

/**
 * Upload a single image file to the shop image endpoint (raw binary body).
 * The API reads c.req.arrayBuffer() and infers the MIME type from magic bytes.
 * Returns the uploaded image's numeric id and url.
 */
export async function uploadShopImage(
  filePath: string,
  opts: HttpOptions,
): Promise<ShopImageUploadResult> {
  const conn = resolveConnection(opts, process.env, opts.readConfig)
  const fetchFn = opts.fetch ?? fetch
  const fileContent = readFileSync(filePath)

  // Detect content-type from magic bytes (jpg / png / gif / webp; default to jpeg)
  let contentType = 'image/jpeg'
  if (fileContent[0] === 0x89 && fileContent[1] === 0x50) contentType = 'image/png'
  else if (fileContent[0] === 0x47 && fileContent[1] === 0x49) contentType = 'image/gif'
  else if (fileContent[0] === 0x52 && fileContent[1] === 0x49 && fileContent[8] === 0x57) contentType = 'image/webp'

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'User-Agent': `haszno-cli/${CLI_VERSION}`,
    Accept: 'application/json',
  }
  if (conn.apiKey) {
    if (isShopToken(conn.apiKey)) {
      headers['Authorization'] = `Bearer ${conn.apiKey}`
    } else {
      headers['x-api-key'] = conn.apiKey
    }
  }
  if (conn.basicAuth) {
    headers['Authorization'] = `Basic ${Buffer.from(conn.basicAuth).toString('base64')}`
  }

  const url = `${conn.baseUrl}/api/v1/shop/images`
  const response = await fetchFn(url, { method: 'POST', headers, body: fileContent })
  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const json = (await response.json()) as { error?: string }
      if (json.error) message = json.error
    } catch {
      /* ignore */
    }
    throw new HasznoApiError(response.status, message)
  }
  return response.json() as Promise<ShopImageUploadResult>
}

// ── CLI login helper ──────────────────────────────────────────────────────────

/**
 * Call POST /api/v1/auth/cli-login with no credentials.
 * Reuses the base URL from opts (or env / default).
 */
export async function cliLogin(
  body: { email: string; password: string; label?: string },
  opts: HttpOptions,
): Promise<ShopLoginResult> {
  const conn = resolveConnection({ baseUrl: opts.baseUrl }, process.env, () => ({}))
  const fetchFn = opts.fetch ?? fetch
  const url = `${conn.baseUrl}/api/v1/auth/cli-login`

  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': `haszno-cli/${CLI_VERSION}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const json = (await response.json()) as { error?: string }
      if (json.error) message = json.error
    } catch {
      /* ignore */
    }
    throw new HasznoApiError(response.status, message)
  }
  return response.json() as Promise<ShopLoginResult>
}

// ── Shop client ───────────────────────────────────────────────────────────────

export interface ShopHasznoClient {
  categories: {
    list(): Promise<ShopTaxonomyCategory[]>
  }
  ads: {
    search(params?: ShopAdSearchParams): Promise<ShopAdListResult>
    get(id: number): Promise<ShopAdDetail>
    priceHint(params?: { category?: string; subcategory?: string }): Promise<ShopPriceHint | null>
  }
  myAds: {
    list(): Promise<ShopMyAd[]>
    post(body: ShopAdPostBody): Promise<ShopMyAd>
    edit(id: number, body: Partial<ShopAdPostBody>): Promise<ShopMyAd>
    pause(id: number): Promise<ShopMyAd>
    activate(id: number): Promise<ShopMyAd>
    sold(id: number, body?: { soldPriceGross?: number }): Promise<ShopMyAd>
    renew(id: number): Promise<ShopMyAd>
    delete(id: number): Promise<ShopMyAd>
    uploadImage(filePath: string): Promise<ShopImageUploadResult>
    fromPhotos(imageIds: number[]): Promise<ShopFromPhotosResult>
  }
  inquiries: {
    listReceived(): Promise<ShopInquiry[]>
    send(adId: number, body: { name: string; email: string; phone?: string; message: string }): Promise<{ ok: boolean }>
    reply(id: number, message: string): Promise<{ reply: ShopInquiryReply }>
  }
  favorites: {
    list(): Promise<ShopAd[]>
    add(adId: number): Promise<ShopFavoriteResult>
    remove(adId: number): Promise<ShopFavoriteResult>
  }
  reservations: {
    create(
      adId: number,
      body: { message?: string; offerPriceGross?: number; phone?: string },
    ): Promise<{ reservation: ShopReservation }>
    list(params?: {
      role?: 'buyer' | 'seller'
      status?: string
      page?: number
    }): Promise<ShopReservationListResult>
    accept(id: number, body?: { heldUntil?: string | null }): Promise<{ reservation: ShopReservationSimple }>
    decline(id: number): Promise<{ reservation: ShopReservationSimple }>
    cancel(id: number): Promise<{ reservation: ShopReservationSimple }>
    complete(id: number, body?: { soldPriceGross?: number | null }): Promise<{ reservation: ShopReservationSimple }>
    counter(id: number, priceGross: number): Promise<{ reservation: ShopReservationSimple }>
    acceptCounter(id: number): Promise<{ reservation: ShopReservationSimple }>
    messages(id: number): Promise<{ items: ShopReservationMessage[] }>
    message(id: number, body: string): Promise<{ message: ShopReservationMessage }>
    review(id: number, rating: number, comment?: string): Promise<{ review: ShopReservationReview }>
  }
  savedSearches: {
    list(): Promise<ShopSavedSearch[]>
    add(params: { name: string; filters: ShopSavedSearchFilters; alertEnabled?: boolean }): Promise<ShopSavedSearch>
    remove(id: number): Promise<{ ok: boolean }>
  }
  watch: {
    watch(adId: number): Promise<ShopWatchResult>
    unwatch(adId: number): Promise<ShopWatchResult>
  }
  urlImport: {
    importUrl(url: string): Promise<ShopUrlImportResult>
  }
  draft: {
    show(): Promise<ShopDraft | null>
    save(payload: Record<string, unknown>): Promise<ShopDraft>
    clear(): Promise<{ ok: boolean }>
  }
  images: {
    removeBg(id: number): Promise<ShopImageUploadResult>
  }
  tokens: {
    list(): Promise<ShopApiToken[]>
    revoke(id: number): Promise<{ ok: boolean }>
    revokeCurrent(): Promise<{ ok: boolean }>
  }
  sellerProfile: {
    get(): Promise<ShopSellerProfile>
    set(body: ShopSellerProfileInput): Promise<ShopSellerProfile>
  }
}

const SORT_MAP: Record<string, string> = {
  newest: 'uj',
  price_asc: 'ar_nov',
  price_desc: 'ar_csokk',
}

export function createShopClient(opts: HttpOptions): ShopHasznoClient {
  const o = opts

  return {
    categories: {
      list: async () => {
        const taxonomy = await get<ShopTaxonomy>('/api/v1/shop/taxonomy', o)
        return taxonomy.categories
      },
    },

    ads: {
      search: (params = {}) => {
        const qs = new URLSearchParams()
        if (params.q) qs.set('q', params.q)
        if (params.category) qs.set('cat', params.category)
        if (params.subcategory) qs.set('sub', params.subcategory)
        if (params.minPrice != null) qs.set('min', String(params.minPrice))
        if (params.maxPrice != null) qs.set('max', String(params.maxPrice))
        if (params.condition) qs.set('cond', params.condition)
        if (params.county) qs.set('county', params.county)
        if (params.city) qs.set('city', params.city)
        if (params.sort) qs.set('sort', SORT_MAP[params.sort] ?? params.sort)
        if (params.page != null) qs.set('page', String(params.page))
        const suffix = qs.toString() ? `?${qs.toString()}` : ''
        return get(`/api/v1/shop/ads${suffix}`, o)
      },
      get: (id) => get(`/api/v1/shop/ads/${id}`, o),
      priceHint: async (params = {}) => {
        const qs = new URLSearchParams()
        if (params.category) qs.set('cat', params.category)
        if (params.subcategory) qs.set('sub', params.subcategory)
        const suffix = qs.toString() ? `?${qs.toString()}` : ''
        return get(`/api/v1/shop/assist/price-hint${suffix}`, o)
      },
    },

    myAds: {
      list: () => get('/api/v1/shop/my/ads', o),
      post: (body) => post('/api/v1/shop/ads', body, o),
      edit: async (id, partial) => {
        // PUT requires the full adInputSchema body — fetch current ad and merge
        const existing = await get<ShopMyAd>(`/api/v1/shop/my/ads/${id}`, o)
        const merged: ShopAdPostBody = {
          category: existing.category,
          subcategory: existing.subcategory ?? null,
          title: existing.title,
          description: existing.description ?? '',
          priceGross: existing.priceGross,
          negotiable: existing.negotiable,
          condition: existing.condition as ShopAdPostBody['condition'],
          county: existing.county,
          city: existing.city,
          images: existing.images,
          attrs: existing.attrs,
          contactName: existing.contactName ?? '',
          contactPhone: existing.contactPhone ?? null,
          contactEmail: existing.contactEmail,
          showPhone: existing.showPhone,
          resellable: existing.resellable,
          partnerCommissionPct: existing.partnerCommissionPct,
          ...partial,
        }
        return put(`/api/v1/shop/ads/${id}`, merged, o)
      },
      pause: (id) => post(`/api/v1/shop/ads/${id}/status`, { status: 'szunetel' }, o),
      activate: (id) => post(`/api/v1/shop/ads/${id}/status`, { status: 'aktiv' }, o),
      sold: (id, body = {}) => post(`/api/v1/shop/ads/${id}/sold`, body, o),
      renew: (id) => post(`/api/v1/shop/ads/${id}/renew`, null, o),
      delete: (id) => post(`/api/v1/shop/ads/${id}/status`, { status: 'torolve' }, o),
      uploadImage: (filePath) => uploadShopImage(filePath, o),
      fromPhotos: (imageIds) => post('/api/v1/shop/assist/from-photos', { imageIds }, o),
    },

    inquiries: {
      listReceived: async () => {
        const result = await get<{ items: ShopInquiry[]; total: number }>('/api/v1/shop/my/inquiries', o)
        return result.items
      },
      send: (adId, body) => post(`/api/v1/shop/ads/${adId}/inquiries`, body, o),
      reply: (id, message) => post(`/api/v1/shop/my/inquiries/${id}/reply`, { message }, o),
    },

    favorites: {
      list: () => get('/api/v1/shop/my/favorites', o),
      add: (adId) => put(`/api/v1/shop/ads/${adId}/favorite`, null, o),
      remove: (adId) => del(`/api/v1/shop/ads/${adId}/favorite`, o),
    },

    reservations: {
      create: (adId, body) => post(`/api/v1/shop/ads/${adId}/reservations`, body, o),
      list: (params = {}) => {
        const qs = new URLSearchParams()
        qs.set('role', params.role ?? 'buyer')
        if (params.status) qs.set('status', params.status)
        if (params.page != null) qs.set('page', String(params.page))
        return get(`/api/v1/shop/my/reservations?${qs.toString()}`, o)
      },
      accept: (id, body = {}) => post(`/api/v1/shop/my/reservations/${id}/accept`, body, o),
      decline: (id) => post(`/api/v1/shop/my/reservations/${id}/decline`, null, o),
      cancel: (id) => post(`/api/v1/shop/my/reservations/${id}/cancel`, null, o),
      complete: (id, body = {}) => post(`/api/v1/shop/my/reservations/${id}/complete`, body, o),
      counter: (id, priceGross) => post(`/api/v1/shop/my/reservations/${id}/counter`, { priceGross }, o),
      acceptCounter: (id) => post(`/api/v1/shop/my/reservations/${id}/accept-counter`, {}, o),
      messages: (id) => get(`/api/v1/shop/my/reservations/${id}/messages`, o),
      message: (id, body) => post(`/api/v1/shop/my/reservations/${id}/messages`, { body }, o),
      review: (id, rating, comment) => post(`/api/v1/shop/my/reservations/${id}/review`, { rating, ...(comment !== undefined ? { comment } : {}) }, o),
    },

    savedSearches: {
      list: () => get('/api/v1/shop/my/saved-searches', o),
      add: (params) => post('/api/v1/shop/my/saved-searches', params, o),
      remove: (id) => del(`/api/v1/shop/my/saved-searches/${id}`, o),
    },

    watch: {
      watch: (adId) => put(`/api/v1/shop/ads/${adId}/watch`, null, o),
      unwatch: (adId) => del(`/api/v1/shop/ads/${adId}/watch`, o),
    },

    urlImport: {
      importUrl: (url) => post('/api/v1/shop/assist/url-import', { url }, o),
    },

    draft: {
      show: () => get('/api/v1/shop/my/draft', o),
      save: (payload) => put('/api/v1/shop/my/draft', payload, o),
      clear: () => del('/api/v1/shop/my/draft', o),
    },

    images: {
      removeBg: (id) => post(`/api/v1/shop/images/${id}/remove-bg`, {}, o),
    },

    tokens: {
      list: () => get('/api/v1/auth/tokens', o),
      revoke: (id) => del(`/api/v1/auth/tokens/${id}`, o),
      revokeCurrent: () => post('/api/v1/auth/tokens/revoke-current', {}, o),
    },

    sellerProfile: {
      get: () => get('/api/v1/shop/my/seller-profile', o),
      set: (body) => put('/api/v1/shop/my/seller-profile', body, o),
    },
  }
}
