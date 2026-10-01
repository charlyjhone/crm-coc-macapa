// Legacy commercial endpoint retired for the school CRM.
// Its previous implementation is preserved in Git history for audit.
Deno.serve(() => new Response(JSON.stringify({ error: "endpoint_retired" }), {
  status: 410,
  headers: { "Content-Type": "application/json" },
}));
