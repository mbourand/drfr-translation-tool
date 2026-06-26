import { z } from 'zod'
import { fetch } from '@tauri-apps/plugin-http'
import { store, STORE_KEYS, StoreUserInfos } from '../../store/store'

type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD' | 'CONNECT' | 'TRACE'
type BodyMethod = 'POST' | 'PUT' | 'PATCH'

export type APIRoute<Method extends HTTPMethod = HTTPMethod> = {
  url: string
  method: Method
  responseSchema: z.ZodType
  // 'multipart' sends the body as `multipart/form-data` (primitive fields stringified, Blob fields as
  // file parts) and lets the HTTP layer set the boundary Content-Type. Defaults to JSON when omitted.
  encoding?: 'json' | 'multipart'
} & (Method extends BodyMethod ? {} : { bodySchema: z.ZodType })

type FetchDataParams<Route extends APIRoute> = {
  route: Route
  headers?: Record<string, string>
} & (Route extends { bodySchema: z.ZodType } ? { body: z.infer<Route['bodySchema']> } : {})

const toFormData = (body: Record<string, unknown>): FormData => {
  const formData = new FormData()
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue
    formData.append(key, value instanceof Blob ? value : String(value))
  }
  return formData
}

export const fetchData = async <Route extends APIRoute>(
  params: FetchDataParams<Route>
): Promise<z.infer<Route['responseSchema']>> => {
  const isMultipart = params.route.encoding === 'multipart'

  const response = await fetch(params.route.url, {
    method: params.route.method,
    // Multipart bodies must not carry an explicit Content-Type — the Request layer derives the
    // `multipart/form-data; boundary=…` header from the FormData itself.
    headers: isMultipart ? { ...params.headers } : { 'Content-Type': 'application/json', ...params.headers },
    body: !('body' in params)
      ? undefined
      : isMultipart
        ? toFormData(params.body as Record<string, unknown>)
        : JSON.stringify(params.body)
  })

  if (!response.ok) throw new Error(`Server sent an error : ${response.status} ${response.statusText}`)

  const unsafeData = await response.json()
  const data = params.route.responseSchema.parse(unsafeData)
  return data
}

export const authedFetch = async <Route extends APIRoute>(
  params: FetchDataParams<Route>
): Promise<z.infer<Route['responseSchema']>> => {
  const userInfos = await store.get<StoreUserInfos>(STORE_KEYS.USER_INFOS)
  if (!userInfos) throw new Error('No token found')

  return fetchData({
    ...params,
    headers: { Authorization: `Bearer ${userInfos.accessToken}`, ...params.headers }
  } as FetchDataParams<Route>)
}
