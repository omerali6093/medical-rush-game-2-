export class ApiError extends Error {
  constructor (
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message)
  }
}

/** Thin fetch wrapper: same-origin httpOnly session cookie + CSRF header, JSON in/out, typed errors. */
export async function api<T> (
  path: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<T> {
  let res: Response
  try {
    res = await fetch('/api' + path, {
      method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'x-requested-with': 'pharma-rush'
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    })
  } catch {
    throw new ApiError(
      0,
      'network',
      'Cannot reach the server. Check your connection and try again.'
    )
  }
  const data = await res.json().catch(() => null)
  if (!res.ok)
    throw new ApiError(
      res.status,
      data?.error?.code || 'error',
      data?.error?.message || `Request failed (${res.status})`,
      data?.error?.details
    )
  return data as T
}
export const errMsg = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong'
