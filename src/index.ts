import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const providers = [
  { id: 'groq-llama', title: 'Llama (Groq)' },
  { id: 'openai', title: 'ChatGPT' },
]

const app = new Hono()

app.get('/providers', (c) => c.json(providers))

serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 3000 }, (info) => {
  console.log(`numismat-server: http://127.0.0.1:${info.port}`)
})
