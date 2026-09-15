import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, Trash2, KeyRound, UserPlus, Activity, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  last_seen_at: string | null;
  last_path: string | null;
  roles: string[];
}

interface ActivityRow {
  id: string;
  lead_id: string | null;
  lead_name: string | null;
  activity_type: string;
  description: string;
  source: string;
  actor: string | null;
  created_at: string;
}

export default function Usuarios() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [pwUser, setPwUser] = useState<UserRow | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [activityUser, setActivityUser] = useState<UserRow | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activitiesTotal, setActivitiesTotal] = useState(0);
  const PAGE_SIZE = 50;

  const fetchActivities = async (u: UserRow, offset: number) => {
    const { data, error } = await supabase.functions.invoke("admin-manage-users", {
      body: { action: "list_activities", user_id: u.id, limit: PAGE_SIZE, offset },
    });
    if (error) {
      toast({ title: "Erro ao carregar atividades", description: error.message, variant: "destructive" });
      return null;
    }
    return data as { activities: ActivityRow[]; total: number };
  };

  const openActivities = async (u: UserRow) => {
    setActivityUser(u);
    setActivities([]);
    setActivitiesTotal(0);
    setLoadingActivities(true);
    const res = await fetchActivities(u, 0);
    setLoadingActivities(false);
    if (!res) return;
    setActivities(res.activities || []);
    setActivitiesTotal(res.total || 0);
  };

  const loadMoreActivities = async () => {
    if (!activityUser) return;
    setLoadingMore(true);
    const res = await fetchActivities(activityUser, activities.length);
    setLoadingMore(false);
    if (!res) return;
    setActivities((prev) => [...prev, ...(res.activities || [])]);
    setActivitiesTotal(res.total || 0);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return iso;
    }
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-manage-users", {
      body: { action: "list" },
    });
    if (error) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    } else {
      setUsers(data.users || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const createUser = async () => {
    if (!newEmail || !newPassword) {
      toast({ title: "Preencha email e senha", variant: "destructive" });
      return;
    }
    setCreating(true);
    const { error } = await supabase.functions.invoke("admin-manage-users", {
      body: { action: "create", email: newEmail, password: newPassword, name: newName || null },
    });
    setCreating(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Usuário criado" });
    setNewName("");
    setNewEmail("");
    setNewPassword("");
    setCreateOpen(false);
    load();
  };

  const openEdit = (u: UserRow) => {
    setEditUser(u);
    setEditName(u.name || "");
    setEditEmail(u.email || "");
  };

  const saveProfile = async () => {
    if (!editUser) return;
    setSavingProfile(true);
    const { error } = await supabase.functions.invoke("admin-manage-users", {
      body: { action: "update_profile", user_id: editUser.id, name: editName, email: editEmail },
    });
    setSavingProfile(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Perfil atualizado" });
    setEditUser(null);
    load();
  };

  const updatePassword = async () => {
    if (!pwUser || !pwValue) return;
    const { error } = await supabase.functions.invoke("admin-manage-users", {
      body: { action: "update_password", user_id: pwUser.id, password: pwValue },
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Senha atualizada" });
    setPwUser(null);
    setPwValue("");
  };

  const deleteUser = async (u: UserRow) => {
    if (!confirm(`Deletar usuário ${u.email}?`)) return;
    const { error } = await supabase.functions.invoke("admin-manage-users", {
      body: { action: "delete", user_id: u.id },
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Usuário deletado" });
    load();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Crie e gerencie os acessos da equipe ao CRM. Apenas o admin acessa esta área.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Novo usuário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo usuário</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome da pessoa" />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} type="email" />
              </div>
              <div>
                <Label>Senha</Label>
                <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" placeholder="qualquer senha" autoComplete="new-password" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={createUser} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((u) => {
            const isAdmin = u.roles.includes("admin");
            return (
              <Card key={u.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{u.name || u.email}</CardTitle>
                        {isAdmin && <Badge>admin</Badge>}
                      </div>
                      {u.name && <p className="text-xs text-muted-foreground">{u.email}</p>}
                      <p className="text-xs text-muted-foreground">
                        Último acesso: {formatDate(u.last_seen_at || u.last_sign_in_at)}
                        {u.last_path ? ` — ${u.last_path}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Editar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openActivities(u)}>
                        <Activity className="h-3.5 w-3.5 mr-1" />
                        Atividades
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setPwUser(u); setPwValue(""); }}>
                        <KeyRound className="h-3.5 w-3.5 mr-1" />
                        Senha
                      </Button>
                      {!isAdmin && (
                        <Button size="sm" variant="ghost" onClick={() => deleteUser(u)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome da pessoa" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} type="email" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancelar</Button>
            <Button onClick={saveProfile} disabled={savingProfile}>
              {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pwUser} onOpenChange={(o) => !o && setPwUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar senha — {pwUser?.name || pwUser?.email}</DialogTitle>
          </DialogHeader>
          <Input value={pwValue} onChange={(e) => setPwValue(e.target.value)} type="password" placeholder="nova senha" autoComplete="new-password" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwUser(null)}>Cancelar</Button>
            <Button onClick={updatePassword}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!activityUser} onOpenChange={(o) => !o && setActivityUser(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Atividades — {activityUser?.name || activityUser?.email}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            {loadingActivities ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : activities.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nenhuma atividade registrada para este usuário ainda.
              </p>
            ) : (
              <div className="space-y-2">
                {activities.map((a) => (
                  <div key={a.id} className="border-b border-border/40 py-2 last:border-0">
                    <p className="text-sm text-foreground">{a.description}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-[11px] text-muted-foreground">{formatDate(a.created_at)}</span>
                      {a.lead_name && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal">
                          Lead: {a.lead_name}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-normal">
                        {a.activity_type}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal">
                        {a.source}
                      </Badge>
                    </div>
                  </div>
                ))}
                {activities.length < activitiesTotal && (
                  <div className="flex justify-center pt-3">
                    <Button variant="outline" size="sm" onClick={loadMoreActivities} disabled={loadingMore}>
                      {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : `Carregar mais (${activitiesTotal - activities.length} restantes)`}
                    </Button>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground text-center pt-2">
                  Mostrando {activities.length} de {activitiesTotal}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
