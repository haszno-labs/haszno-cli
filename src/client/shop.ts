/**
 * Haszno Shop marketplace client — /api/v1/shop/* endpoints.
 *
 * Separate from HasznoClient to avoid touching the existing interface.
 * Uses the same HttpOptions (baseUrl, apiKey, fetch override for tests).
 *
 * Authentication: session cookie or Bearer token (haszno_...) from `haszno login`.
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { type HttpOptions, get, post, patch, del, isShopToken } from './http.js'
import { resolveConnection } from './config.js'
import { HasznoApiError } from './error.js'

/** CLI version for User-Agent */
const CLI_VERSION = '0.1.0'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShopAdImage {
  id: string
  url: string
}

export interface ShopAd {
  id: number
  title: string
  description: string | null
  categoryId: string | null
  subcategoryId: string | null
  priceGross: number
  negotiable: boolean
  condition: string | null
  county: string | null
  city: string | null
  status: 'aktiv' | 'szunetel' | 'eladva' | 'torolt' | string
  reserved: boolean
  images: ShopAdImage[]
  attributes: Record<string, string>
  contactName: string | null
  contactPhone: string | null
  showPhone: boolean
  createdAt: string
  updatedAt: string
}

export interface ShopAdDetail extends ShopAd {
  viewCount?: number
  favoriteCount?: number
}

export interface ShopCategory {
  id: string
  name: string
  subcategories: ShopSubcategory[]
}

export interface ShopSubcategory {
  id: string
  name: string
  requiredAttributes: ShopAttributeDef[]
}

export interface ShopAttributeDef {
  key: string
  label: string
  type: 'string' | 'select' | 'integer' | 'boolean'
  options?: string[]
  required?: boolean
}

export interface ShopPriceHint {
  categoryId: string | null
  subcategoryId: string | null
  suggestedMin: number | null
  suggestedMax: number | null
  suggestedMid: number | null
  recentCount: number
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
  status: 'fuggoben' | 'elfogadva' | 'elutasitva' | 'lemondva' | 'teljesitve' | 'lejart' | string
  message: string | null
  offerPriceGross: number | null
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
  heldUntil: string | null
  createdAt: string
  updatedAt: string
  decidedAt: string | null
  soldPriceGross?: number | null
}

export interface ShopInquiry {
  id: number
  adId: number
  ad?: { id: number; title: string }
  message: string
  senderName: string
  senderEmail: string | null
  createdAt: string
  readAt: string | null
}

export interface ShopImageUploadResult {
  imageId: string
  url: string
}

export interface ShopFromPhotosResult {
  title?: string
  description?: string
  categoryId?: string
  subcategoryId?: string
  condition?: string
  suggestedPriceGross?: number
  attributes?: Record<string, string>
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
  title: string
  categoryId?: string
  subcategoryId?: string
  priceGross: number
  negotiable?: boolean
  condition?: string
  description?: string
  county?: string
  city?: string
  attributes?: Record<string, string>
  imageIds?: string[]
  contactName?: string
  contactPhone?: string
  showPhone?: boolean
}

export interface ShopAdSearchParams {
  q?: string
  category?: string
  subcategory?: string
  minPrice?: number
  maxPrice?: number
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
 * Upload a single image file to the shop image endpoint (multipart/form-data).
 * Returns the uploaded image's id and url.
 */
export async function uploadShopImage(
  filePath: string,
  opts: HttpOptions,
): Promise<ShopImageUploadResult> {
  const conn = resolveConnection(opts, process.env, opts.readConfig)
  const fetchFn = opts.fetch ?? fetch
  const fileContent = readFileSync(filePath)
  const filename = basename(filePath)

  const form = new FormData()
  form.append('image', new Blob([fileContent]), filename)

  const headers: Record<string, string> = {
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

  const url = `${conn.baseUrl}/api/v1/shop/my/images`
  const response = await fetchFn(url, { method: 'POST', headers, body: form })
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
    list(): Promise<ShopCategory[]>
  }
  ads: {
    search(params?: ShopAdSearchParams): Promise<ShopAdListResult>
    get(id: number): Promise<ShopAdDetail>
    priceHint(params?: { categoryId?: string; subcategoryId?: string }): Promise<ShopPriceHint>
  }
  myAds: {
    list(): Promise<ShopAd[]>
    post(body: ShopAdPostBody): Promise<ShopAd>
    edit(id: number, body: Partial<ShopAdPostBody>): Promise<ShopAd>
    pause(id: number): Promise<ShopAd>
    activate(id: number): Promise<ShopAd>
    sold(id: number, body?: { soldPriceGross?: number }): Promise<ShopAd>
    renew(id: number): Promise<ShopAd>
    delete(id: number): Promise<{ deleted: boolean }>
    uploadImage(filePath: string): Promise<ShopImageUploadResult>
    fromPhotos(imageIds: string[]): Promise<ShopFromPhotosResult>
  }
  inquiries: {
    listReceived(): Promise<ShopInquiry[]>
    send(adId: number, body: { message: string }): Promise<ShopInquiry>
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
  }
}

export function createShopClient(opts: HttpOptions): ShopHasznoClient {
  const o = opts

  return {
    categories: {
      list: () => get('/api/v1/shop/categories', o),
    },

    ads: {
      search: (params = {}) => {
        const qs = new URLSearchParams()
        if (params.q) qs.set('q', params.q)
        if (params.category) qs.set('category', params.category)
        if (params.subcategory) qs.set('subcategory', params.subcategory)
        if (params.minPrice != null) qs.set('minPrice', String(params.minPrice))
        if (params.maxPrice != null) qs.set('maxPrice', String(params.maxPrice))
        if (params.county) qs.set('county', params.county)
        if (params.city) qs.set('city', params.city)
        if (params.sort) qs.set('sort', params.sort)
        if (params.page != null) qs.set('page', String(params.page))
        const suffix = qs.toString() ? `?${qs.toString()}` : ''
        return get(`/api/v1/shop/ads${suffix}`, o)
      },
      get: (id) => get(`/api/v1/shop/ads/${id}`, o),
      priceHint: (params = {}) => {
        const qs = new URLSearchParams()
        if (params.categoryId) qs.set('categoryId', params.categoryId)
        if (params.subcategoryId) qs.set('subcategoryId', params.subcategoryId)
        const suffix = qs.toString() ? `?${qs.toString()}` : ''
        return get(`/api/v1/shop/price-hint${suffix}`, o)
      },
    },

    myAds: {
      list: () => get('/api/v1/shop/my/ads', o),
      post: (body) => post('/api/v1/shop/my/ads', body, o),
      edit: (id, body) => patch(`/api/v1/shop/my/ads/${id}`, body, o),
      pause: (id) => post(`/api/v1/shop/my/ads/${id}/pause`, null, o),
      activate: (id) => post(`/api/v1/shop/my/ads/${id}/activate`, null, o),
      sold: (id, body = {}) => post(`/api/v1/shop/my/ads/${id}/sold`, body, o),
      renew: (id) => post(`/api/v1/shop/my/ads/${id}/renew`, null, o),
      delete: (id) => del(`/api/v1/shop/my/ads/${id}`, o),
      uploadImage: (filePath) => uploadShopImage(filePath, o),
      fromPhotos: (imageIds) => post('/api/v1/shop/assist/from-photos', { imageIds }, o),
    },

    inquiries: {
      listReceived: () => get('/api/v1/shop/my/inquiries', o),
      send: (adId, body) => post(`/api/v1/shop/ads/${adId}/inquiries`, body, o),
    },

    favorites: {
      list: () => get('/api/v1/shop/my/favorites', o),
      add: (adId) => post(`/api/v1/shop/my/favorites/${adId}`, null, o),
      remove: (adId) => del(`/api/v1/shop/my/favorites/${adId}`, o),
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
    },
  }
}
