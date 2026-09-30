import {serve} from "@hono/node-server";
import {Hono} from "hono";

type Message = {role: "user" | "assistant"; content: string};

const logo = (githubOrg: string) =>
  `https://github.com/${githubOrg}.png?size=128`;

const groq = (id: string, title: string, model: string, logo: string) => ({
  id,
  title,
  model,
  logo,
  url: "https://api.groq.com/openai/v1/chat/completions",
  apiKey: process.env.GROQ_API_KEY,
});

const openrouter = (
  id: string,
  title: string,
  model: string,
  logo: string,
) => ({
  id,
  title,
  model,
  logo,
  url: "https://openrouter.ai/api/v1/chat/completions",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const providers = [
  groq(
    "groq-gpt-oss",
    "GPT-OSS 120B (Groq)",
    "openai/gpt-oss-120b",
    logo("openai"),
  ),
  groq(
    "groq-gpt-oss-20b",
    "GPT-OSS 20B (Groq)",
    "openai/gpt-oss-20b",
    logo("openai"),
  ),
  groq("groq-qwen", "Qwen (Groq)", "qwen/qwen3.8-27b", logo("QwenLM")),
  openrouter(
    "openrouter-nemotron",
    "Nemotron Super (OpenRouter)",
    "nvidia/nemotron-3-super-120b-a12b:free",
    logo("NVIDIA"),
  ),
  openrouter(
    "openrouter-nemotron-ultra",
    "Nemotron Ultra (OpenRouter)",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    logo("NVIDIA"),
  ),
  openrouter(
    "openrouter-qwen",
    "Qwen (OpenRouter)",
    "qwen/qwen3.8-27b:free",
    logo("QwenLM"),
  ),
  openrouter(
    "openrouter-ling",
    "Ling Flash (OpenRouter)",
    "inclusionai/ling-3.0-flash-sante:free",
    logo("inclusionAI"),
  ),
  openrouter(
    "openrouter-dots",
    "Dots (OpenRouter)",
    "dots-studio/dots-3-note-preview:free",
    logo("dots-studio"),
  ),
  openrouter(
    "openrouter-lfm",
    "LFM 2.6B (OpenRouter)",
    "liquid/lfm-2.5-2.6b:free",
    logo("Liquid4All"),
  ),
];

const systemPrompt = (coin: unknown) =>
  "Ти досвідчений нумізмат. Відповідай українською, коротко і цікаво. " +
  `Розмова про монету: ${JSON.stringify(coin)}, які факти про неї є, чи вона ще в вжитку, ` +
  "що за неї можна купити або можна було купити у рік виходу";

const app = new Hono();

app.get("/providers", (c) =>
  c.json(providers.map(({id, title, logo}) => ({id, title, logo}))),
);

app.post("/chat", async (c) => {
  const {provider, coin, messages} = await c.req.json<{
    provider: string;
    coin: unknown;
    messages: Message[];
  }>();
  const p = providers.find((p) => p.id === provider);
  if (!p) return c.json({error: "Unknown provider"}, 400);

  const res = await fetch(p.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: p.model,
      messages: [{role: "system", content: systemPrompt(coin)}, ...messages],
    }),
    signal: AbortSignal.timeout(50_000),
  });
  if (!res.ok) {
    console.error(p.id, res.status, await res.text());
    return c.json({error: "Provider error"}, 502);
  }

  const data = (await res.json()) as {
    choices?: {message?: {content?: string | null}}[];
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    console.error(p.id, "empty response", JSON.stringify(data));
    return c.json({error: "Empty response"}, 502);
  }
  return c.json({text});
});

app.onError((err, c) => {
  console.error(err);
  return c.json({error: "Server error"}, 500);
});

serve({fetch: app.fetch, hostname: "127.0.0.1", port: 3000}, (info) => {
  console.log(`numismat-server: http://127.0.0.1:${info.port}`);
});
