import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import { createRequire } from 'node:module'
const require = createRequire(
  new URL('../server/package.json', import.meta.url)
)
const { MongoClient } = require('mongodb')
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4200',
  DB = 'pr-e2e'
const log = (...a) => console.log(new Date().toISOString().slice(14, 23), ...a)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const mongo = await MongoClient.connect('mongodb://127.0.0.1:27017')
const db = mongo.db(DB)
const setMission = f =>
  db.collection('missions').updateOne({ key: 'bloodstream-1' }, { $set: f })
// 15 s mission, quizzes at 3s and 6s + final at the deadline, can't die, unreachable objective => exercises the timeout path
await setMission({
  timeLimit: 15,
  quizAt: [9, 12, 15],
  maxHealth: 1000,
  'objective.target': 9999,
  quizSeconds: 8
})

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
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => {
  if (m.type() === 'error') errors.push('console: ' + m.text())
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
      await shot('FAIL')
      throw new Error(
        `timeout waiting for "${t}". Page: ` + (await text()).slice(0, 400)
      )
    })
}
const click = async (t, sel = 'button') => {
  const ok = await page.evaluate(
    (t, sel) => {
      const el = [...document.querySelectorAll(sel)].find(
        e => e.innerText.trim().includes(t) && !e.disabled
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
  if (!ok) {
    await shot('FAIL')
    throw new Error(`no clickable "${t}"`)
  }
}
const fill = async (label, v) => {
  const ok = await page.evaluate(
    (label, v) => {
      const l = [...document.querySelectorAll('label.field')].find(e =>
        e.innerText.includes(label)
      )
      const i = l?.querySelector('input')
      if (!i) return false
      return true
    },
    label,
    v
  )
  if (!ok) throw new Error('no field ' + label)
  const h = await page.evaluateHandle(
    label =>
      [...document.querySelectorAll('label.field')]
        .find(e => e.innerText.includes(label))
        .querySelector('input'),
    label
  )
  await h.click({ clickCount: 3 })
  await h.type(v)
  const got = await page.evaluate(el => el.value, h)
  if (got !== v) throw new Error(`typing was altered: wanted ${v} got ${got}`)
}
let wonQuiz = 0
const lastQ = { t: '' }
const waitQuiz = async () => {
  await page.waitForFunction(
    prev => {
      const e = document.querySelector('#event')
      const h = e?.querySelector('h3')?.innerText
      const o = e?.querySelectorAll('.opt')
      return !!h && h !== prev && o && o.length === 3 && !o[0].disabled
    },
    { timeout: 90000 },
    lastQ.t
  )
  lastQ.t = await page.evaluate(
    () => document.querySelector('#event h3').innerText
  )
  await sleep(300)
}
const answerQuiz = async () => {
  await page.evaluate(() => document.querySelector('#event .opt').click())
  await page.waitForFunction(
    () =>
      /Correct|Incorrect|Time up/.test(
        document.querySelector('#event')?.innerText || ''
      ),
    { timeout: 15000 }
  )
}
const timer = () =>
  page.evaluate(() => document.querySelector('#tmr')?.innerText)
const fps = () =>
  page.evaluate(
    () =>
      new Promise(r => {
        let n = 0
        const t0 = performance.now()
        const f = () => {
          n++
          if (performance.now() - t0 > 1000) r(n)
          else requestAnimationFrame(f)
        }
        requestAnimationFrame(f)
      })
  )

log('open app')
await page.goto(BASE, { waitUntil: 'networkidle0' })
await waitText('Sign in / Sign up')
await shot('01-home-loggedout')
await click('Sign in / Sign up')
await waitText('Sign in')
await click('Create account', '.link')
await waitText('Create your doctor profile')
await fill('Display name', 'Dr Amara')
await fill('Email', 'amara@e2e.test')
await fill('Password', 'Str0ngPass9')
await page.click('.check input')
await shot('02-signup')
await click('Create your doctor profile', 'button[type=submit]')
await waitText('PLAY NOW')
log('signed up -> home')
await sleep(1200)
await shot('03-home')

log('locked-level guard + missions list')
await click('Missions')
await waitText('First Dose')
const m = await text()
if (!/Clot Control[\s\S]*Complete the previous mission/.test(m))
  throw new Error('L2 should show locked')
await shot('04-missions')
await click('First Dose', 'button')
await waitText('Start mission')
await shot('05-briefing')
const brief = await text()
if (!/Win:/.test(brief) || !/Lose:/.test(brief))
  throw new Error('rules not shown')
log('start mission')
await click('Start mission')
await page.waitForSelector('#tmr', { timeout: 20000 })
await page.waitForFunction(
  () => document.querySelector('#tmr')?.innerText !== '0:15',
  { timeout: 30000 }
) // countdown finished, timer is running
log('PAUSE while running')
await page.evaluate(() =>
  document.querySelector('button[aria-label=Pause]').click()
)
await waitText('Paused', 8000)
const p1 = await timer()
await sleep(2500)
const p2 = await timer()
if (p1 !== p2) throw new Error(`timer ran while paused ${p1}->${p2}`)
log('timer frozen while paused at', p1)
await shot('08-paused')
await click('Resume')
await sleep(200)
log('resumed; timer', await timer())
const quizLog = []
for (let i = 0; i < 3; i++) {
  await waitQuiz()
  const a = await timer()
  await sleep(2000)
  const b = await timer()
  if (a !== b) throw new Error(`timer moved during quiz ${i + 1}: ${a} -> ${b}`)
  log(`quiz ${i + 1} open; run timer frozen at ${a}`)
  if (i === 0) await shot('09-quiz')
  await answerQuiz()
  if (i === 0) await shot('10-quiz-answered')
  quizLog.push(
    (
      await page.evaluate(
        () =>
          document.querySelector('#event .pat:last-of-type')?.innerText || ''
      )
    ).slice(0, 60)
  )
  await click(i === 2 ? 'Finish mission' : 'Resume run')
  await sleep(500)
}
log('quizzes answered:', quizLog.length)
await waitText('Mission failed', 20000)
await waitText('Time ran out')
log('RESULT: failed by timeout, as designed')
await sleep(1500)
await shot('11-results-fail')
const rt = await text()
if (!/QUIZ\s*\n?\s*\d\/3|\d\/3/.test(rt))
  throw new Error('quiz stat missing: ' + rt.slice(0, 300))

log('server saved the run')
const sess = await db.collection('gamesessions').find({}).toArray()
const done = sess.filter(s => s.status === 'completed')
log(
  'sessions',
  sess.length,
  'completed',
  done.length,
  'outcome',
  done[0]?.outcome,
  'quizAnswered',
  done[0]?.quizAnswered
)
if (done.length !== 1 || done[0].outcome !== 'lost')
  throw new Error('expected 1 completed lost session')

log('RETRY -> new attempt')
await setMission({ 'objective.target': 3, maxHealth: 1000 })
await click('Retry')
await waitText('GO!', 12000).catch(() => {})
await page.waitForSelector('#tmr', { timeout: 15000 })
const sess2 = await db.collection('gamesessions').find({}).toArray()
log('after retry sessions:', sess2.length, sess2.map(s => s.status).join(','))
log('play to win (target 6)')
const tEnd = Date.now() + 150000
for (let i = 0; Date.now() < tEnd; i++) {
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
    if (!e) return null
    return {
      btn: [...e.querySelectorAll('button')].some(b =>
        /Resume run|Finish mission/.test(b.innerText)
      ),
      opt: [...e.querySelectorAll('.opt')].some(o => !o.disabled)
    }
  })
  if (ev?.btn) {
    if (!wonQuiz++) await shot('09b-quiz-feedback')
    await click('→')
  } else if (ev?.opt)
    await page.evaluate(() =>
      [...document.querySelectorAll('#event .opt')]
        .find(o => !o.disabled)
        .click()
    )
  else
    await page.keyboard.press(
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'][i % 4]
    )
  await sleep(200)
}
await waitText('Mission complete', 20000)
await sleep(1800)
await shot('12-results-win')
const wt = await text()
log('RESULT: won')
if (!/Unlocked: Level 2/.test(wt.replace(/\n/g, ' ')))
  throw new Error('no unlock banner: ' + wt.slice(0, 400))
log('next level')
await click('Next level')
await waitText('Level 2')
await waitText('Clot Control')
await shot('13-next-briefing')

log('JS errors:', errors.length ? errors.join(' | ') : 'none')
await browser.close()
await mongo.close()
log('PART 1 PASSED')
