import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4200'
const log = (...a) => console.log(new Date().toISOString().slice(14, 23), ...a)
const sleep = ms => new Promise(r => setTimeout(r, ms))
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
const org = (await call('GET', '/admin/organizations')).organizations.find(
  o => o.name === 'Acme Pharma'
)
const asset = (
  await call('POST', '/admin/assets', {
    orgId: org._id,
    name: 'Acme logo',
    mime: 'image/png',
    dataBase64:
      'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAACM0lEQVR4nO3c22rEMAwE0P38/nVaCJQWnDiWNBcHDfvUYo98koeSLP0cndt81AO4p4EmaaBJ/IC+vEYSTfOjEPvQQ6wMo0ixKDXlNEQmZAHUhSWF2ZdMg2Sq3lFIg2EqBZK7AIyKNpJzwJgqgOQKSKM0kPz8YKPEYsIZDJiiQJyLbHArhYCYc6uN1oHKJyYDLRotAiHG5QOtGBkAeZZGgFQXU3oTPQYCTSkEemb0DEg6onYAP6CrH/oC4YZzAJoZzYD4OtNfcY0aKAMEnckK6NpIBzStk88zAeJfMS3QhVEDeQI9rJNPdQnEv1YOQKPGBgoAmeh4GOknaKDZgVeBuBMaACGWAIGg3VsA/W/kAg0DWvUSIPTCBnoR0DCEtRsDMZc30OZAw5B32AxItUkKCNS3HdCfLsodNIxwn5UiEZDDVg20CdAwJruZArlt2EDGQMMY7mkE5LytBRAoPKDCMnIwYzdQA5kCSUICKmmSBDB2A8WAkmWI0QlFozRQA6GAwmU0ndq6izRQBihQVgjNbLwOHgiqU1UaB1ot2xHoNs/+oss0SYCSM/OACDrJ6hqgpaPKgTKscaBYMR+oVGcRaLWephNofBwYkPkHBfQOo5WEHtzIT8jSiQLta7SexKM/+WnxOjmgjZgSqXh4LD8/TKcI6DA2Sqf09YOco5TmTPX7GblLqc7R/w14GuQbvs1pzlBegW7o8pttv+OEpzmz20t0ekRAN1Eo3MRrGsM00CQNNMk3ZgoNTRKAb1sAAAAASUVORK5CYII='
  })
).asset
await call('POST', `/admin/assets/${asset.id}/review`, { status: 'approved' })
const camp = (
  await call('POST', '/admin/campaigns', {
    orgId: org._id,
    name: 'Acme Launch',
    sponsorName: 'Acme Pharma',
    startsAt: new Date(Date.now() - 1e4).toISOString(),
    endsAt: new Date(Date.now() + 864e5).toISOString(),
    assetId: asset.id,
    label: 'Acme dose',
    color: '#ff8800',
    disclosure: 'Sponsored content by Acme Pharma. Educational game only.'
  })
).campaign
const ap = await call('POST', `/admin/campaigns/${camp._id}/status`, {
  status: 'approved'
})
log('campaign live:', ap.campaign?.status)

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
  if (m.type() === 'error' && !/401/.test(m.text())) errors.push(m.text())
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
      await shot('FAIL3')
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
}
await page.goto(BASE, { waitUntil: 'networkidle0' })
await waitText('Sign in / Sign up')
await click('Sign in / Sign up')
await waitText('Forgot password')
await fill('Email', 'amara@e2e.test')
await fill('Password', 'Str0ngPass9')
await click('Sign in', 'button[type=submit]')
await waitText('PLAY NOW')
await click('PLAY NOW')
await waitText('Start mission')
await waitText('Sponsored collectibles')
await sleep(800)
await shot('31-briefing-sponsored')
const b = await text()
if (!/Sponsored content by Acme Pharma/.test(b))
  throw new Error('disclosure missing in briefing')
log('briefing shows sponsor + disclosure')
await click('Start mission')
await page.waitForFunction(
  () =>
    document.querySelector('#tmr')?.innerText !== '0:15' &&
    document.querySelector('#tmr'),
  { timeout: 40000 }
)
const hudSponsor = await page.evaluate(
  () => document.querySelector('.sponsor')?.innerText
)
log('HUD badge:', hudSponsor)
if (!/Acme Pharma/.test(hudSponsor || ''))
  throw new Error('HUD sponsor badge missing')
for (let i = 0; i < 4; i++) {
  await page.keyboard.press(['ArrowLeft', 'ArrowRight'][i % 2])
  await shot(`32-sponsored-run-${i}`)
  await sleep(500)
}
const t = Date.now() + 100000
for (; Date.now() < t; ) {
  if (
    await page.evaluate(() =>
      /Mission complete|Mission failed/.test(
        document.querySelector('#results')?.innerText || ''
      )
    )
  )
    break
  const ev = await page.evaluate(() => {
    const e = document.querySelector('#event')
    return e
      ? {
          btn: [...e.querySelectorAll('button')].some(b =>
            /Resume run|Finish mission/.test(b.innerText)
          ),
          opt: [...e.querySelectorAll('.opt')].some(o => !o.disabled)
        }
      : null
  })
  if (ev?.btn) await click('→')
  else if (ev?.opt)
    await page.evaluate(() =>
      [...document.querySelectorAll('#event .opt')]
        .find(o => !o.disabled)
        .click()
    )
  else
    await page.keyboard.press(
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'][
        Math.floor(Math.random() * 4)
      ]
    )
  await sleep(200)
}
await sleep(1800)
await shot('33-sponsored-results')
const r = await text()
log('results disclosure shown:', /Sponsored content by Acme Pharma/.test(r))
const rep = await call('GET', '/admin/reports/campaigns')
log(
  'campaign report:',
  JSON.stringify(
    rep.campaigns.map(c => ({
      name: c.name,
      runs: c.runs,
      branded: c.brandedCollected
    }))
  )
)
log('JS errors:', errors.length ? errors.join(' | ') : 'none')
await browser.close()
log('PART 3 PASSED')
