import {createMcpHandler, McpServer} from "@modelcontextprotocol/server";
import * as z from "zod/v4";

const FIRESTORE =
  "https://firestore.googleapis.com/v1/projects/tetiana-redko/databases/(default)/documents";

type FirestoreDoc = {
  name: string;
  fields: Record<string, Record<string, unknown>>;
};

async function fetchCollection(name: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${FIRESTORE}/${name}?pageSize=300`);
  const data = (await res.json()) as {documents?: FirestoreDoc[]};
  return (data.documents ?? []).map((doc) => ({
    id: doc.name.split("/").pop(),
    ...Object.fromEntries(
      Object.entries(doc.fields).map(([key, value]) => [key, Object.values(value)[0]]),
    ),
  }));
}

const json = (value: unknown) => ({
  content: [{type: "text" as const, text: JSON.stringify(value)}],
});

export const mcpHandler = createMcpHandler(() => {
  const server = new McpServer({name: "numismat", version: "1.0.0"});

  server.registerTool(
    "list_countries",
    {
      description: "Країни, монети яких є в колекції: id (ua, us, …), назва українською та англійською, прапор",
      annotations: {readOnlyHint: true},
    },
    async () => json(await fetchCollection("countries")),
  );

  server.registerTool(
    "list_coins",
    {
      description:
        "Монети з особистої колекції автора: назва, країна (id), номінал (value + currency), рік, опис, " +
        "URL фото аверсу та реверсу",
      inputSchema: z.object({
        country: z.string().optional().describe("id країни з list_countries, напр. ua; без нього — усі монети"),
      }),
      annotations: {readOnlyHint: true},
    },
    async ({country}) => {
      const coins = await fetchCollection("coins");
      return json(country ? coins.filter((coin) => coin.country === country) : coins);
    },
  );

  return server;
});
