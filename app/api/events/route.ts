// ponytail: Global in-memory SSE subscriber set -> upgrade to Redis Pub/Sub if deploying to multi-instance cluster

type Controller = ReadableStreamDefaultController<Uint8Array>;

declare global {
  var __sseClients: Set<Controller> | undefined;
}

if (!globalThis.__sseClients) {
  globalThis.__sseClients = new Set<Controller>();
}

const clients = globalThis.__sseClients;

export function broadcastEvent(event: string, data: any) {
  const encoder = new TextEncoder();
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const bytes = encoder.encode(payload);

  for (const client of clients) {
    try {
      client.enqueue(bytes);
    } catch {
      clients.delete(client);
    }
  }
}

// GET /api/events - Connect SSE stream
export async function GET() {
  const encoder = new TextEncoder();
  let controllerRef: Controller;

  const stream = new ReadableStream({
    start(controller) {
      controllerRef = controller;
      clients.add(controller);
      controller.enqueue(encoder.encode(`event: connected\ndata: {}\n\n`));
    },
    cancel() {
      if (controllerRef) clients.delete(controllerRef);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

// POST /api/events - Trigger event broadcast from external processes (e.g., Discord/Telegram bot)
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { event, data } = body;
    if (event) {
      broadcastEvent(event, data || {});
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch {
    return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
  }
}
