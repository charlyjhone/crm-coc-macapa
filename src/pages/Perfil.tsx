import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { CircleUserRound, KeyRound, Loader2, ShieldCheck } from "lucide-react";

const formatDate = (value?: string) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", { dateStyle: "long" });
};

export default function Perfil() {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    const metadataName = user?.user_metadata?.full_name;
    setName(typeof metadataName === "string" ? metadataName : "");
  }, [user?.id, user?.user_metadata?.full_name]);

  const saveName = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    setSavingName(true);
    const { error, data } = await supabase.functions.invoke("admin-manage-users", {
      body: { action: "update_own_profile", name },
    });
    if (error) {
      toast({ title: "Não foi possível salvar o perfil", description: error.message, variant: "destructive" });
      setSavingName(false);
      return;
    }

    await supabase.auth.refreshSession();
    toast({ title: data?.unchanged ? "Perfil já estava atualizado" : "Nome atualizado" });
    setSavingName(false);
  };

  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password || password.length < 8) {
      toast({ title: "A senha precisa ter pelo menos 8 caracteres", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "As senhas não coincidem", variant: "destructive" });
      return;
    }

    setSavingPassword(true);
    const { error, data } = await supabase.functions.invoke("admin-manage-users", {
      body: { action: "update_own_profile", password },
    });
    if (error) {
      toast({ title: "Não foi possível atualizar a senha", description: error.message, variant: "destructive" });
      setSavingPassword(false);
      return;
    }

    setPassword("");
    setConfirmPassword("");
    toast({ title: data?.unchanged ? "Senha já estava atualizada" : "Senha atualizada" });
    setSavingPassword(false);
  };

  const metadataName = user?.user_metadata?.full_name;
  const displayName = (typeof metadataName === "string" ? metadataName.trim() : "") || "Nome não informado";

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 md:px-6">
      <div>
        <p className="text-sm font-medium text-emerald-700">Conta do AE CRM</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0E2A47]">Meu perfil</h1>
        <p className="mt-1 text-sm text-slate-600">Atualize seu nome de exibição e proteja seu acesso.</p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-4 space-y-0">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0E2A47] text-white">
            <CircleUserRound className="h-7 w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-lg text-[#0E2A47]">{displayName}</CardTitle>
            <CardDescription className="mt-1 truncate">{user?.email}</CardDescription>
          </div>
          <Badge variant={isAdmin ? "default" : "secondary"} className="shrink-0">
            {roleLoading ? "Carregando" : isAdmin ? "Administrador" : "Secretaria"}
          </Badge>
        </CardHeader>
        <CardContent className="border-t border-slate-100 pt-4 text-sm text-slate-600">
          <span className="font-medium text-slate-800">Conta criada:</span> {formatDate(user?.created_at)}
          <p className="mt-2 text-xs">Para alterar seu e-mail de acesso, solicite a atualização a um administrador.</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-[#0E2A47]">Dados do perfil</CardTitle>
            <CardDescription>Este nome aparece na navegação e nos registros de auditoria.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveName} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Nome de exibição</Label>
                <Input
                  id="profile-name"
                  value={name}
                  maxLength={100}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Seu nome"
                  autoComplete="name"
                />
              </div>
              <Button type="submit" disabled={savingName || !user} className="bg-[#0E2A47] hover:bg-[#163d61]">
                {savingName && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar nome
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-[#0E2A47]">
              <KeyRound className="h-4 w-4" /> Segurança da conta
            </CardTitle>
            <CardDescription>Escolha uma senha com pelo menos 8 caracteres.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={changePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>
              <Button type="submit" variant="outline" disabled={savingPassword || !user}>
                {savingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Atualizar senha
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
