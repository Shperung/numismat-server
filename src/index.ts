import { serve } from '@hono/node-server'
import { Hono } from 'hono'

type Message = { role: 'user' | 'assistant'; content: string }

const providers = [
  {
    id: 'groq-gpt-oss',
    title: 'GPT-OSS (Groq)',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'openai/gpt-oss-120b',
    apiKey: process.env.GROQ_API_KEY,
  },
]

const systemPrompt = (coin: unknown) =>
  'Ти досвідчений нумізмат. Відповідай українською, коротко і цікаво. ' +
  `Розмова про монету: ${JSON.stringify(coin)}, які факти про неї є, чи вона ще в вжитку, ` +
  'що за неї можна купити або можна було купити у рік виходу'

const app = new Hono()

app.get('/providers', (c) => c.json(providers.map(({ id, title }) => ({ id, title }))))

app.post('/chat', async (c) => {
  const { provider, coin, messages } = await c.req.json<{
    provider: string
    coin: unknown
    messages: Message[]
  }>()
  const p = providers.find((p) => p.id === provider)
  if (!p) return c.json({ error: 'Unknown provider' }, 400)

  const res = await fetch(p.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: p.model,
      messages: [{ role: 'system', content: systemPrompt(coin) }, ...messages],
    }),
  })
  if (!res.ok) {
    console.error(p.id, res.status, await res.text())
    return c.json({ error: 'Provider error' }, 502)
  }

  const data = (await res.json()) as { choices: { message: { content: string } }[] }
  return c.json({ text: data.choices[0].message.content })
})

serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 3000 }, (info) => {
  console.log(`numismat-server: http://127.0.0.1:${info.port}`)
})
