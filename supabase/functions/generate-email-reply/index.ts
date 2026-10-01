// Legacy commercial email composer retired for the school CRM.
// Rebuild school email replies with explicit operator authorization if needed.
Deno.serve(() => new Response(JSON.stringify({ error: "endpoint_retired" }), {
  status: 410,
  headers: { "Content-Type": "application/json" },
}));
