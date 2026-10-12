import express from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'node:path'
import fs from 'node:fs'
import { config } from './config'
import {
  csrfGuard,
  errorHandler,
  loadUser,
  wrap,
  HttpError
} from './middleware/http'
import { BrandAsset } from './models'
import { oid } from './services/common'
import authRoutes from './routes/auth'
import playerRoutes from './routes/player'
import playRoutes from './routes/play'
import competeRoutes from './routes/compete'
import adminRoutes from './routes/admin'

export function createApp () {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.isProd ? [] : null
        }
      }
    })
  )
  if (config.clientOrigin)
    app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', config.clientOrigin)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
      res.setHeader(
        'Access-Control-Allow-Headers',
        'content-type,x-requested-with'
      )
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE')
      if (req.method === 'OPTIONS') return res.sendStatus(204)
      next()
    })
  app.use(express.json({ limit: '600kb' }))
  app.use(cookieParser())
  if (config.rateLimit) {
    app.use(
      '/api',
      rateLimit({
        windowMs: 60_000,
        limit: 300,
        standardHeaders: true,
        legacyHeaders: false
      })
    )
    app.use(
      '/api/auth',
      rateLimit({
        windowMs: 15 * 60_000,
        limit: 30,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          error: {
            code: 'rate_limited',
            message: 'Too many attempts, try again later'
          }
        }
      })
    )
  }
  app.use('/api', csrfGuard, loadUser)

  app.get('/api/health', (_req, res) => res.json({ ok: true }))
  // Brand logos: only approved assets are public; pending ones are visible to admins / the owning org admin for preview.
  app.get(
    '/api/brand-assets/:id',
    wrap(async (req, res) => {
      const a: any = await BrandAsset.findById(oid(req.params.id))
      const u = (req as any).user
      const canPreview =
        u &&
        (u.role === 'admin' ||
          (u.role === 'org_admin' && String(u.organization) === String(a?.org)))
      if (!a || (a.status !== 'approved' && !canPreview))
        throw new HttpError(404, 'not_found', 'Asset not found')
      res
        .set({
          'Content-Type': a.mime,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'public, max-age=300',
          'Content-Security-Policy': "default-src 'none'"
        })
        .send(Buffer.from(a.data, 'base64'))
    })
  )
  app.use('/api/auth', authRoutes)
  app.use('/api', playerRoutes)
  app.use('/api', playRoutes)
  app.use('/api', competeRoutes)
  app.use('/api/admin', adminRoutes)
  app.use('/api', (_req, _res, next) =>
    next(new HttpError(404, 'not_found', 'Unknown endpoint'))
  )

  // In production the API also serves the built React app (single deployable).
  const dist = [
    path.resolve(__dirname, '../../dist'),
    path.resolve(__dirname, '../../../../dist')
  ].find(d => fs.existsSync(path.join(d, 'index.html')))
  if (dist) {
    app.use(express.static(dist))
    app.get(/^\/(?!api).*/, (_req, res) =>
      res.sendFile(path.join(dist, 'index.html'))
    )
  }
  app.use(errorHandler)
  return app
}
