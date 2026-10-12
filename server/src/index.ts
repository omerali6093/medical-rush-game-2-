import "dotenv/config"
import { createApp } from './app'
import { config } from './config'
import { connectDb } from './db'
import { seedAll } from './seed'


;(async () => {
  await connectDb()
  await seedAll()
  createApp().listen(config.port, () =>
    console.log(`Pharma Rush API listening on :${config.port}`)
  )
})().catch(e => {
  console.error(e)
  process.exit(1)
})
