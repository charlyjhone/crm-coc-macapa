import { FormEvent, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, ClipboardList, Loader2, Search } from "lucide-react";

type AuditOperation = "INSERT" | "UPDATE" | "DELETE";

interface AuditLogRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  operation: AuditOperation;
  schema_name: string;
  table_name: string;
  record_id: string | null;
  entity_label: string | null;
  changed_fields: string[];
  outcome: "started" | "success" | "failed";
  created_at: string;
}

const PAGE_SIZE = 50;

const operationLabel: Record<AuditOperation, string> = {
  INSERT: "Criação",
  UPDATE: "Alteração",
  DELETE: "Exclusão",
};

const operationStyle: Record<AuditOperation, string> = {
  INSERT: "border-emerald-200 bg-emerald-50 text-emerald-800",
  UPDATE: "border-blue-200 bg-blue-50 text-blue-800",
  DELETE: "border-rose-200 bg-rose-50 text-rose-800",
};

const tableLabels: Record<string, string> = {
  users: "Contas de acesso",
  leads: "Contatos",
  guardians: "Responsáveis",
  students: "Alunos",
  student_guardians: "Vínculos de responsáveis",
  enrollment_opportunities: "Oportunidades de matrícula",
  enrollment_tasks: "Tarefas de captação",
  school_visits: "Visitas escolares",
  school_capacity: "Vagas por turma",
  system_settings: "Configurações",
  user_roles: "Papéis de acesso",
  user_product_access: "Permissões de produto",
};

const formatDate = (value: string) =>
  new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const displayRecordId = (entry: AuditLogRow) => {
  if (entry.entity_label) return entry.entity_label;
  if (!entry.record_id) return "Registro sem identificador";
  return entry.record_id.length > 36 ? `${entry.record_id.slice(0, 33)}…` : entry.record_id;
};

export default function Auditoria() {
  const [entries, setEntries] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState("all");
  const [draftActor, setDraftActor] = useState("");
  const [actor, setActor] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      let query = supabase
        .from("audit_logs")
        .select("id, actor_id, actor_email, operation, schema_name, table_name, record_id, entity_label, changed_fields, outcome, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (operation !== "all") query = query.eq("operation", operation);
      const search = actor.trim().replace(/[(),\\]/g, "");
      if (search) {
        query = query.or(
          `actor_email.ilike.%${search}%,entity_label.ilike.%${search}%,record_id.ilike.%${search}%,table_name.ilike.%${search}%`,
        );
      }

      const { data, error, count } = await query;
      if (!active) return;
      if (error) {
        toast({ title: "Não foi possível carregar a auditoria", description: error.message, variant: "destructive" });
      } else {
        setEntries((data || []) as AuditLogRow[]);
        setTotal(count || 0);
      }
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, [operation, actor, page]);

  const applySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(0);
    setActor(draftActor.trim());
  };

  const clearFilters = () => {
    setOperation("all");
    setDraftActor("");
    setActor("");
    setPage(0);
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-6">
      <div>
        <p className="text-sm font-medium text-emerald-700">Administração</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-[#0E2A47]">
          <ClipboardList className="h-6 w-6" /> Auditoria do sistema
        </h1>
        <p className="mt-1 text-sm text-slate-600">Acompanhe criações, alterações e exclusões feitas por usuários.</p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base text-[#0E2A47]">Filtrar registros</CardTitle>
          <CardDescription>O histórico registra usuário, horário, tipo de ação, registro e campos afetados.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={applySearch} className="grid gap-4 md:grid-cols-[180px_1fr_auto_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="audit-operation">Tipo de ação</Label>
              <select
                id="audit-operation"
                value={operation}
                onChange={(event) => { setOperation(event.target.value); setPage(0); }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">Todas</option>
                <option value="INSERT">Criações</option>
                <option value="UPDATE">Alterações</option>
                <option value="DELETE">Exclusões</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-actor">E-mail ou registro</Label>
              <Input
                id="audit-actor"
                value={draftActor}
                onChange={(event) => setDraftActor(event.target.value)}
                placeholder="Buscar por usuário, tabela ou ID"
                type="search"
              />
            </div>
            <Button type="submit" className="bg-[#0E2A47] hover:bg-[#163d61]">
              <Search className="mr-2 h-4 w-4" /> Buscar
            </Button>
            <Button type="button" variant="outline" onClick={clearFilters}>Limpar</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-slate-100">
          <div>
            <CardTitle className="text-base text-[#0E2A47]">Registros recentes</CardTitle>
            <CardDescription>{total} {total === 1 ? "registro" : "registros"}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Página anterior" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || loading}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-20 text-center text-xs text-slate-600">{page + 1} / {pageCount}</span>
            <Button variant="outline" size="icon" aria-label="Próxima página" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1 || loading}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando registros…
            </div>
          ) : entries.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-slate-500">Nenhum registro encontrado para estes filtros.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Data e hora</th>
                    <th className="px-5 py-3 font-semibold">Usuário</th>
                    <th className="px-5 py-3 font-semibold">Ação</th>
                    <th className="px-5 py-3 font-semibold">Área / registro</th>
                    <th className="px-5 py-3 font-semibold">Campos afetados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="align-top hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">{formatDate(entry.created_at)}</td>
                      <td className="px-5 py-4">
                        <span className="block max-w-52 truncate font-medium text-slate-800" title={entry.actor_email || entry.actor_id || "Sistema"}>
                          {entry.actor_email || (entry.actor_id ? `Usuário ${entry.actor_id.slice(0, 8)}` : "Sistema")}
                        </span>
                        {entry.outcome !== "success" && (
                          <Badge variant={entry.outcome === "failed" ? "destructive" : "outline"} className="mt-1 text-[10px]">
                            {entry.outcome === "failed" ? "Falhou" : "Em andamento"}
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant="outline" className={operationStyle[entry.operation]}>{operationLabel[entry.operation]}</Badge>
                      </td>
                      <td className="px-5 py-4">
                        <span className="block font-medium text-slate-800">{tableLabels[entry.table_name] || entry.table_name}</span>
                        <span className="mt-1 block max-w-64 truncate font-mono text-[11px] text-slate-500" title={entry.record_id || entry.entity_label || ""}>
                          {displayRecordId(entry)}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex max-w-72 flex-wrap gap-1">
                          {(entry.changed_fields || []).slice(0, 5).map((field) => (
                            <Badge key={field} variant="secondary" className="font-normal">{field}</Badge>
                          ))}
                          {entry.changed_fields.length > 5 && <span className="self-center text-xs text-slate-500">+{entry.changed_fields.length - 5}</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs leading-relaxed text-slate-500">
        A trilha começa a partir da publicação desta funcionalidade. Por privacidade, o histórico guarda os nomes dos campos afetados, sem copiar valores de mensagens, contatos, alunos ou responsáveis.
      </p>
    </div>
  );
}
