Deno.serve(() => Response.json({ error: "gone" }, { status: 410 }));
