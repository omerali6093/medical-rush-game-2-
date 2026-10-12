import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4200'
const log = (...a) => console.log(new Date().toISOString().slice(14, 23), ...a)
const sleep = ms => new Promise(r => setTimeout(r, ms))
// --- set up a challenge through the real admin API
let cookie = ''
const call = async (m, p, b) => {
  const r = await fetch(BASE + '/api' + p, {
    method: m,
    headers: {
      'content-type': 'application/json',
      'x-requested-with': 'pharma-rush',
      cookie
    },
    body: b ? JSON.stringify(b) : undefined
  })
  const sc = r.headers.get('set-cookie')
  if (sc) cookie = sc.split(';')[0]
  return r.json()
}
await call('POST', '/auth/login', {
  email: 'admin@e2e.test',
  password: 'Adm1nPassw0rd'
})
const ms = (await call('GET', '/admin/missions')).missions
const ch = await call('POST', '/admin/challenges', {
  title: 'Clinic Cup',
  missionId: ms[0]._id,
  startsAt: new Date(Date.now() - 1e4).toISOString(),
  endsAt: new Date(Date.now() + 864e5).toISOString(),
  maxParticipants: 50,
  maxAttempts: 3
})
log('challenge created', ch.challenge?.id)
const org = (
  await call('POST', '/admin/organizations', { name: 'Acme Pharma' })
).organization
log('org', org?.name)

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  headless: 'shell',
  args: [
    ...chromium.args,
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--no-sandbox'
  ]
})
const page = await browser.newPage()
await page.setViewport({ width: 430, height: 860, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => {
  if (m.type() === 'error') errors.push(m.text())
})
const shot = n => page.screenshot({ path: `./${n}.png` })
const text = () => page.evaluate(() => document.body.innerText)
const waitText = async (t, ms = 30000) => {
  await page
    .waitForFunction(
      s => document.body.innerText.includes(s),
      { timeout: ms },
      t
    )
    .catch(async () => {
      await shot('FAIL2')
      throw new Error(`timeout "${t}". Page: ` + (await text()).slice(0, 500))
    })
}
const click = async (t, sel = 'button') => {
  for (let i = 0; i < 20; i++) {
    const ok = await page.evaluate(
      (t, sel) => {
        const el = [...document.querySelectorAll(sel)].find(
          e =>
            e.innerText.trim().includes(t) &&
            !e.disabled &&
            getComputedStyle(e.closest('.screen') || e).opacity > 0.9
        )
        if (el) {
          el.click()
          return true
        }
        return false
      },
      t,
      sel
    )
    if (ok) {
      await sleep(900)
      return
    }
    await sleep(400)
  }
  await shot('FAIL2')
  throw new Error(`no clickable "${t}"`)
}
const fill = async (label, v) => {
  const h = await page.evaluateHandle(
    label =>
      [...document.querySelectorAll('label.field')]
        .find(e => e.innerText.includes(label))
        ?.querySelector('input'),
    label
  )
  await h.focus()
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Control')
  await h.type(v)
  const got = await page.evaluate(el => el.value, h)
  if (got !== v) throw new Error(`typing was altered: wanted ${v} got ${got}`)
}
const login = async (email, pw) => {
  await waitText('Sign in / Sign up')
  await click('Sign in / Sign up')
  await waitText('Forgot password')
  await fill('Email', email)
  await fill('Password', pw)
  await click('Sign in', 'button[type=submit]')
  await waitText('PLAY NOW')
}

await page.goto(BASE, { waitUntil: 'networkidle0' })
log('wrong password shows an error')
await waitText('Sign in / Sign up')
await click('Sign in / Sign up')
await waitText('Forgot password')
await fill('Email', 'amara@e2e.test')
await fill('Password', 'WrongPass123')
await click('Sign in', 'button[type=submit]')
await waitText('Incorrect email or password')
await shot('20-login-error')
await fill('Password', 'Str0ngPass9')
await click('Sign in', 'button[type=submit]')
await waitText('PLAY NOW')
log('login ok (session persisted across reload next)')
await page.reload({ waitUntil: 'networkidle0' })
await waitText('PLAY NOW')
log('session cookie survives reload')
await click('Dashboard')
await waitText('Player dashboard')
await waitText('Achievements')
await sleep(1500)
await shot('21-dashboard')
const d = await text()
if (
  !/First Dose/.test(d) ||
  !/First Dose/.test(d.replace('Win your first mission', 'First Dose'))
)
  throw new Error('dashboard content')
log('dashboard ok')
await click('Back')
await click('Challenges')
await waitText('Leaderboards')
await click('Challenges', '.tabs button')
await waitText('Clinic Cup')
await click('Join')
await waitText('Play')
log('joined challenge')
await sleep(1200)
await shot('22-challenge')
await click('Standings')
await waitText('Ranking')
await shot('23-standings')
await click('← Challenges')
await click('Global', '.tabs button')
await waitText('Dr Amara')
await sleep(800)
await shot('24-global')
log('leaderboard lists the validated win')
await click('Back')
await click('Profile')
await waitText('DOCTOR SKINS')
await sleep(900)
await shot('25-profile')
const pr = await text()
if (!/Surgeon/.test(pr)) throw new Error('shop missing')
log('profile + shop ok')
await click('Back')
await click('Sign out')
await waitText('Sign in / Sign up')
log('signed out')
log('player cannot see admin')
const own = await (async () => {
  await login('amara@e2e.test', 'Str0ngPass9')
  return (await text()).includes('Admin')
})()
if (own) throw new Error('player sees admin button')
await click('Sign out')
await waitText('Sign in / Sign up')
log('admin portal')
await login('admin@e2e.test', 'Adm1nPassw0rd')
await click('Admin')
await waitText('Admin portal')
await waitText('VALIDATED RUNS')
await sleep(1200)
await shot('26-admin-reports')
for (const [tab, marker, name] of [
  ['Missions', 'Target', '27-admin-missions'],
  ['Quiz content', 'New question', '28-admin-quiz'],
  ['Sponsors', 'New sponsored campaign', '29-admin-sponsors'],
  ['Challenges', 'New doctor challenge', '30-admin-challenges']
]) {
  await click(tab, '.tabs button')
  await waitText(marker)
  await sleep(900)
  await shot(name)
  log('admin tab ok:', tab)
}
log('JS errors:', errors.length ? errors.slice(0, 5).join(' | ') : 'none')
await browser.close()
log('PART 2 PASSED')
