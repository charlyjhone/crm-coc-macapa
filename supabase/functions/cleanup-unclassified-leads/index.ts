import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Parse intervalo (default 24h). Body opcional: { older_than_hours: number, force_all?: boolean }
  let olderThanHours = 24
  let forceAll = false
  try {
    const body = await req.json()
    if (typeof body?.older_than_hours === 'number') olderThanHours = body.older_than_hours
    if (body?.force_all === true) forceAll = true
  } catch { /* sem body */ }

  const olderThan = forceAll ? '0 seconds' : `${olderThanHours} hours`
  const cutoff = forceAll ? new Date(0).toISOString() : new Date(Date.now() - olderThanHours * 3600 * 1000).toISOString()

  // 1) Buscar leads alvo
  const { data: targetLeads, error: leadsErr } = await supabase
    .from('leads')
    .select('id')
    .or('unclassified.eq.true,archived.eq.true')
    .lt('created_at', cutoff)

  if (leadsErr) {
    console.error('Failed to list target leads', leadsErr)
    return new Response(JSON.stringify({ error: leadsErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const leadIds = (targetLeads ?? []).map((l: any) => l.id)
  console.log(`Cleanup: ${leadIds.length} leads alvo (older_than=${olderThan})`)

  // 2) Listar storage_paths dos anexos desses leads e remover do bucket
  let storageDeleted = 0
  if (leadIds.length > 0) {
    // Em lotes para evitar limites de URL
    const chunkSize = 200
    for (let i = 0; i < leadIds.length; i += chunkSize) {
      const chunk = leadIds.slice(i, i + chunkSize)
      const { data: attachments } = await supabase
        .from('email_attachments')
        .select('storage_path')
        .in('lead_id', chunk)
        .not('storage_path', 'is', null)

      const paths = (attachments ?? []).map((a: any) => a.storage_path).filter(Boolean)
      if (paths.length > 0) {
        // Remove em lotes de 100 (limite do storage.remove)
        for (let j = 0; j < paths.length; j += 100) {
          const slice = paths.slice(j, j + 100)
          const { error: rmErr } = await supabase.storage.from('email-attachments').remove(slice)
          if (rmErr) console.warn('storage remove error', rmErr.message)
          else storageDeleted += slice.length
        }
      }
    }
  }

  // 3) Executar purge no banco em batches até esvaziar
  let totalPurged = 0
  let lastRemaining: number | null = null
  for (let iter = 0; iter < 50; iter++) {
    const { data: r, error: pErr } = await supabase
      .rpc('purge_old_unclassified_leads', { p_older_than: olderThan, p_limit: 50 })
    if (pErr) {
      console.error('Purge RPC failed', pErr)
      return new Response(JSON.stringify({ error: pErr.message, total_purged: totalPurged, storage_deleted: storageDeleted }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const purged = (r as any)?.purged ?? 0
    lastRemaining = (r as any)?.remaining ?? 0
    totalPurged += purged
    if (purged === 0) break
  }

  const summary = { targeted: leadIds.length, storage_deleted: storageDeleted, total_purged: totalPurged, remaining: lastRemaining }
  console.log('Cleanup done', summary)
  return new Response(JSON.stringify(summary), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
