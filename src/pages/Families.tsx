import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertCircle, GraduationCap, Mail, Phone, Search, UserRound, Users } from "lucide-react";

type Guardian = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp_opt_in: boolean;
  student_guardians?: Array<{
    relationship: string | null;
    is_primary: boolean;
    students: { id: string; full_name: string; birth_date: string | null } | null;
  }>;
};

const Families = () => {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [query, setQuery] = useState("");
  const [foundationPending, setFoundationPending] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await (supabase as any)
        .from("guardians")
        .select("id,full_name,preferred_name,email,phone,whatsapp_opt_in,student_guardians(relationship,is_primary,students(id,full_name,birth_date))")
        .order("full_name");
      if (error) setFoundationPending(true);
      else setGuardians(data || []);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return guardians;
    return guardians.filter((guardian) => {
      const students = (guardian.student_guardians || [])
        .map((link) => link.students?.full_name || "")
        .join(" ");
      return [guardian.full_name, guardian.email || "", guardian.phone || "", students]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term);
    });
  }, [guardians, query]);

  const studentCount = new Set(
    guardians.flatMap((guardian) =>
      (guardian.student_guardians || []).map((link) => link.students?.id).filter(Boolean),
    ),
  ).size;

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b bg-background px-5 py-5 md:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-medium text-primary">Relacionamento escolar</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Famílias e alunos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Um cadastro familiar, com cada aluno e oportunidade de matrícula vinculados corretamente.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 p-5 md:p-8">
        {foundationPending && (
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">
              Esta tela será ativada após a fundação escolar ser aplicada no Supabase de homologação.
            </p>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-lg bg-primary/10 p-3 text-primary"><Users className="h-5 w-5" /></div>
              <div><p className="text-2xl font-bold">{guardians.length}</p><p className="text-sm text-muted-foreground">famílias cadastradas</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-lg bg-primary/10 p-3 text-primary"><GraduationCap className="h-5 w-5" /></div>
              <div><p className="text-2xl font-bold">{studentCount}</p><p className="text-sm text-muted-foreground">alunos vinculados</p></div>
            </CardContent>
          </Card>
        </section>

        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar responsável, aluno, telefone ou e-mail"
            className="pl-9"
          />
        </div>

        <section className="grid gap-4 lg:grid-cols-2">
          {filtered.map((guardian) => (
            <Card key={guardian.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <div className="rounded-full bg-muted p-2.5"><UserRound className="h-5 w-5" /></div>
                    <div>
                      <h2 className="font-semibold text-slate-900">{guardian.preferred_name || guardian.full_name}</h2>
                      {guardian.preferred_name && <p className="text-xs text-muted-foreground">{guardian.full_name}</p>}
                    </div>
                  </div>
                  {guardian.whatsapp_opt_in && <Badge variant="secondary">WhatsApp autorizado</Badge>}
                </div>

                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                  {guardian.phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{guardian.phone}</span>}
                  {guardian.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{guardian.email}</span>}
                </div>

                <div className="mt-5 border-t pt-4">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Alunos vinculados</p>
                  <div className="space-y-2">
                    {(guardian.student_guardians || []).map((link) => (
                      <div key={link.students?.id} className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2">
                        <span className="text-sm font-medium text-slate-900">{link.students?.full_name}</span>
                        <span className="text-xs text-muted-foreground">{link.relationship || "Responsável"}{link.is_primary ? " · principal" : ""}</span>
                      </div>
                    ))}
                    {!guardian.student_guardians?.length && <p className="text-sm text-muted-foreground">Nenhum aluno vinculado.</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {!filtered.length && !foundationPending && (
            <Card className="lg:col-span-2">
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                Nenhuma família encontrada.
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
};

export default Families;
