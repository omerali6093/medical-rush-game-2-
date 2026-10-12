const env = process.env
const isProd = env.NODE_ENV === 'production'
const secret = env.JWT_SECRET || (isProd ? '' : 'dev-only-secret-change-me')
if (!secret || (isProd && secret.length < 32))
  throw new Error('JWT_SECRET (min 32 chars) is required in production')

export const config = {
  isProd,
  isTest: env.NODE_ENV === 'test',
  port: Number(env.PORT || 4000),
  mongoUri: env.MONGODB_URI || "",
  jwtSecret: secret,
  cookieName: 'pr_session',
  sessionDays: 7,
  adminEmail: env.ADMIN_EMAIL || '',
  adminPassword: env.ADMIN_PASSWORD || '',
  clientOrigin: env.CLIENT_ORIGIN || '',
  rateLimit: env.NODE_ENV !== 'test'
}
