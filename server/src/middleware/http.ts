import type { NextFunction, Request, RequestHandler, Response } from 'express'
import jwt from 'jsonwebtoken'
import { ZodError, type ZodTypeAny, type z } from 'zod'
import { config } from '../config'
import { User } from '../models'

export class HttpError extends Error {
  constructor (
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message)
  }
}
export const wrap =
  (
    fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
  ): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next)
  }

export function parse<S extends ZodTypeAny> (
  schema: S,
  data: unknown
): z.infer<S> {
  const r = schema.safeParse(data)
  if (!r.success)
    throw new HttpError(
      400,
      'validation_error',
      r.error.issues[0]?.message || 'Invalid input',
      r.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }))
    )
  return r.data
}

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof HttpError)
    return res
      .status(err.status)
      .json({
        error: { code: err.code, message: err.message, details: err.details }
      })
  if (err instanceof ZodError)
    return res
      .status(400)
      .json({
        error: { code: 'validation_error', message: err.issues[0]?.message }
      })
  if ((err as any)?.type === 'entity.too.large')
    return res
      .status(413)
      .json({ error: { code: 'too_large', message: 'Payload too large' } })
  if ((err as any)?.name === 'CastError')
    return res
      .status(400)
      .json({ error: { code: 'bad_id', message: 'Invalid identifier' } })
  console.error(err)
  res
    .status(500)
    .json({ error: { code: 'server_error', message: 'Something went wrong' } })
}

export const signToken = (id: string, v: number) =>
  jwt.sign({ sub: id, v }, config.jwtSecret, {
    expiresIn: `${config.sessionDays}d`
  })
export const setSessionCookie = (res: Response, token: string) =>
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: config.sessionDays * 864e5,
    path: '/'
  })

/** Resolves the logged-in user from the httpOnly cookie (if any). */
export const loadUser: RequestHandler = async (req, _res, next) => {
  try {
    const token = req.cookies?.[config.cookieName]
    if (token) {
      const p = jwt.verify(token, config.jwtSecret) as unknown as {
        sub: string
        v: number
      }
      const u = await User.findById(p.sub)
      if (u && u.tokenVersion === p.v) (req as any).user = u
    }
  } catch {
    /* invalid / expired token => anonymous */
  }
  next()
}
export const requireAuth: RequestHandler = (req, _res, next) =>
  (req as any).user
    ? next()
    : next(new HttpError(401, 'unauthenticated', 'Please sign in'))
export const requireRole =
  (...roles: string[]): RequestHandler =>
  (req, _res, next) => {
    const u = (req as any).user
    if (!u) return next(new HttpError(401, 'unauthenticated', 'Please sign in'))
    if (!roles.includes(u.role))
      return next(
        new HttpError(403, 'forbidden', 'You do not have permission to do that')
      )
    next()
  }
/** CSRF defence in depth: cookie is SameSite=Lax AND every state-changing request must carry a custom header (forces a CORS preflight). */
export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  if (req.get('x-requested-with') !== 'pharma-rush')
    return next(new HttpError(403, 'csrf', 'Missing request header'))
  next()
}
export const me = (req: Request): any => (req as any).user
