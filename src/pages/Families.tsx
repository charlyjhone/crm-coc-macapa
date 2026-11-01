/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase types include the school tables after migrations are applied and regenerated. */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, GraduationCap, Home, Loader2, Mail, Phone, Search, UserRound, Users } from "lucide-react";
import { NewFamilyDialog } from "@/components/school/NewFamilyDialog";
import { EditFamilyDialog, type EditableFamily } from "@/components/school/EditFamilyDialog";
import { DeleteFamilyDialog } from "@/components/school/DeleteFamilyDialog";
import { turmaFromNotes } from "@/lib/reports";
import { useUserRole } from "@/hooks/useUserRole";

type GuardianRow = EditableFamily & {
  student_guardians?: Array<{
    relationship: string | null;
    is_primary: boolean;
    is_financially_responsible?: boolean;
    students: any;
  }>;
};

type FamilyStudentView = { id: string; name: string; turma: string };
type FamilyGuardianView = { guardian: GuardianRow; relationship: string; isPrimary: boolean; isFinancial: boolean };
type FamilyGroup = { key: string; students: FamilyStudentView[]; guardians: FamilyGuardianView[]; searchText: string };

const PAGE_SIZE = 1000; // limite de linhas por consulta do Supabase
const VISIBLE_STEP = 60;

const SELECT =
  "id,full_name,preferred_name,email,phone,whatsapp_opt_in,notes," +
  "student_guardians(relationship,is_primary,is_financially_responsible,students(id,full_name,preferred_name,birth_date,current_school,notes))";

// Busca todos os responsáveis, de 1.000 em 1.000, para a contagem nunca parar no limite da consulta.
async function loadAllGuardians(): Promise<GuardianRow[]> {
  const all: GuardianRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await (supabase as any)
      .from("guardians")
      .select(SELECT)
      .order("full_name")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    all.push(...((data || []) as GuardianRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return all;
}

// Uma família = responsáveis e alunos ligados entre si. Irmãos que dividem pai, mãe ou
// responsável financeiro ficam no mesmo cartão.
function groupFamilies(guardians: GuardianRow[]): FamilyGroup[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  guardians.forEach((g) => parent.set(`g:${g.id}`, `g:${g.id}`));
  guardians.forEach((g) =>
    (g.student_guardians || []).forEach((link) => {
      const sid = link.students?.id;
      if (!sid) return;
      const key = `s:${sid}`;
      if (!parent.has(key)) parent.set(key, key);
      union(`g:${g.id}`, key);
    }),
  );

  const groups = new Map<string, { students: Map<string, FamilyStudentView>; guardians: FamilyGuardianView[] }>();
  guardians.forEach((g) => {
    const root = find(`g:${g.id}`);
    if (!groups.has(root)) groups.set(root, { students: new Map(), guardians: [] });
    const group = groups.get(root)!;
    const links = g.student_guardians || [];
    links.forEach((link) => {
      const s = link.students;
      if (s?.id && !group.students.has(s.id)) {
        group.students.set(s.id, { id: s.id, name: s.preferred_name || s.full_name || "Aluno sem nome", turma: turmaFromNotes(s.notes) });
      }
    });
    group.guardians.push({
      guardian: g,
      relationship: links.find((l) => l.relationship)?.relationship || "Responsável",
      isPrimary: links.some((l) => l.is_primary),
      isFinancial: links.some((l) => l.is_financially_responsible),
    });
  });

  const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
  return [...groups.entries()]
    .map(([key, group]) => {
      const students = [...group.students.values()].sort((a, b) => collator.compare(a.name, b.name));
      const guardiansSorted = group.guardians.sort(
        (a, b) =>
          Number(b.isFinancial) - Number(a.isFinancial) ||
          Number(b.isPrimary) - Number(a.isPrimary) ||
          collator.compare(a.guardian.full_name, b.guardian.full_name),
      );
      const searchText = [
        ...students.map((s) => `${s.name} ${s.turma}`),
        ...guardiansSorted.map(({ guardian }) => `${guardian.full_name} ${guardian.preferred_name || ""} ${guardian.email || ""} ${guardian.phone || ""} ${(guardian.phone || "").replace(/\D/g, "")}`),
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR");
      return { key, students, guardians: guardiansSorted, searchText };
    })
    .sort((a, b) =>
      collator.compare(a.students[0]?.name || a.guardians[0]?.guardian.full_name || "", b.students[0]?.name || b.guardians[0]?.guardian.full_name || ""),
    );
}

const Families = () => {
  const [guardians, setGuardians] = useState<GuardianRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(VISIBLE_STEP);
  const [foundationPending, setFoundationPending] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { isAdmin } = useUserRole();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadAllGuardians()
      .then((rows) => {
        if (cancelled) return;
        setFoundationPending(false);
        setGuardians(rows);
      })
      .catch(() => {
        if (!cancelled) setFoundationPending(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const families = useMemo(() => groupFamilies(guardians), [guardians]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return families;
    const digits = term.replace(/\D/g, "");
    return families.filter((f) => f.searchText.includes(term) || (digits.length >= 4 && f.searchText.includes(digits)));
  }, [families, query]);

  useEffect(() => setVisible(VISIBLE_STEP), [query]);

  const studentCount = useMemo(
    () => new Set(guardians.flatMap((g) => (g.student_guardians || []).map((l) => l.students?.id).filter(Boolean))).size,
    [guardians],
  );

  const refresh = () => setRefreshKey((value) => value + 1);
  const stats = [
    { icon: Home, value: families.length, label: "famílias" },
    { icon: GraduationCap, value: studentCount, label: "alunos" },
    { icon: Users, value: guardians.length, label: "responsáveis" },
  ];

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b bg-background px-5 py-5 md:px-8">
        <div className="mx-auto flex max-w-7xl items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">Relacionamento escolar</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">Famílias e alunos</h1>
            <p className="mt-1 text-sm text-slate-600">
              Cada cartão é uma família: os alunos (irmãos juntos) e todos os seus responsáveis.
            </p>
          </div>
          <NewFamilyDialog onCreated={refresh} />
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 p-5 md:p-8">
        {foundationPending && (
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">
              Não foi possível carregar os cadastros. Verifique sua sessão e as permissões do CRM e tente novamente.
            </p>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-3">
          {stats.map(({ icon: Icon, value, label }) => (
            <Card key={label}>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="rounded-lg bg-primary/10 p-3 text-primary"><Icon className="h-5 w-5" /></div>
                <div>
                  <p className="text-2xl font-bold">{loading ? "…" : value.toLocaleString("pt-BR")}</p>
                  <p className="text-sm text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar aluno, turma, responsável, telefone ou e-mail"
              className="pl-9"
            />
          </div>
          {query.trim() && !loading && (
            <span className="text-sm text-muted-foreground">
              {filtered.length.toLocaleString("pt-BR")} {filtered.length === 1 ? "família encontrada" : "famílias encontradas"}
            </span>
          )}
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando famílias…
          </div>
        )}

        {!loading && (
          <section className="grid gap-4 lg:grid-cols-2">
            {filtered.slice(0, visible).map((family) => (
              <Card key={family.key}>
                <CardContent className="p-5">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {family.students.length === 1 ? "Aluno" : `Alunos (${family.students.length})`}
                  </p>
                  <div className="space-y-2">
                    {family.students.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/60 px-3 py-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <GraduationCap className="h-4 w-4 shrink-0 text-primary" />
                          <span className="break-words text-sm font-semibold text-slate-900">{s.name}</span>
                        </span>
                        {s.turma && <Badge variant="outline" className="shrink-0">{s.turma}</Badge>}
                      </div>
                    ))}
                    {!family.students.length && <p className="text-sm text-muted-foreground">Nenhum aluno vinculado.</p>}
                  </div>

                  <div className="mt-4 border-t pt-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Responsáveis</p>
                    <div className="divide-y">
                      {family.guardians.map(({ guardian, relationship, isPrimary, isFinancial }) => (
                        <div key={guardian.id} className="flex items-start justify-between gap-3 py-2.5">
                          <div className="flex min-w-0 gap-2.5">
                            <div className="mt-0.5 rounded-full bg-muted p-1.5"><UserRound className="h-4 w-4" /></div>
                            <div className="min-w-0">
                              <p className="break-words text-sm font-medium text-slate-900">{guardian.preferred_name || guardian.full_name}</p>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                <span className="text-xs text-muted-foreground">{relationship}</span>
                                {isFinancial && <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">financeiro</Badge>}
                                {isPrimary && !isFinancial && <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">principal</Badge>}
                                {guardian.whatsapp_opt_in && <Badge variant="outline" className="h-5 px-1.5 text-[11px]">WhatsApp autorizado</Badge>}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                {guardian.phone && <span className="flex items-center gap-1 whitespace-nowrap"><Phone className="h-3 w-3" />{guardian.phone}</span>}
                                {guardian.email && <span className="flex items-center gap-1 break-all"><Mail className="h-3 w-3" />{guardian.email}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0">
                            <EditFamilyDialog guardian={guardian} onSaved={refresh} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="mt-3 flex justify-end border-t pt-3">
                      <DeleteFamilyDialog
                        guardianIds={family.guardians.map(({ guardian }) => guardian.id)}
                        studentIds={family.students.map((s) => s.id)}
                        familyName={family.students[0]?.name || family.guardians[0]?.guardian.full_name || "esta família"}
                        studentNames={family.students.map((s) => s.name)}
                        guardianNames={family.guardians.map(({ guardian }) => guardian.preferred_name || guardian.full_name)}
                        onDeleted={refresh}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {!filtered.length && !foundationPending && (
              <Card className="lg:col-span-2">
                <CardContent className="p-10 text-center text-sm text-muted-foreground">Nenhuma família encontrada.</CardContent>
              </Card>
            )}
          </section>
        )}

        {!loading && filtered.length > visible && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => setVisible((v) => v + VISIBLE_STEP)}>
              Mostrar mais famílias ({(filtered.length - visible).toLocaleString("pt-BR")} restantes)
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default Families;
