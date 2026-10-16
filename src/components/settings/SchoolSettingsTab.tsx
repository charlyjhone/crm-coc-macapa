import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const KEYS = ["escola_nome", "escola_info", "escola_valores", "escola_agente_ativo", "escola_agente_nome", "escola_folder_ativo"] as const;

export default function SchoolSettingsTab() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState("");
  const [agenteNome, setAgenteNome] = useState("Ana");
  const [info, setInfo] = useState("");
  const [valores, setValores] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [folderAtivo, setFolderAtivo] = useState(false);
  const [folderExiste, setFolderExiste] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("system_settings").select("key, value").in("key", KEYS as unknown as string[]);
      const map: Record<string, string> = {};
      (data || []).forEach((r: { key: string; value: string | null }) => (map[r.key] = r.value || ""));
      setNome(map.escola_nome || "");
      setAgenteNome(map.escola_agente_nome || "Ana");
      setInfo(map.escola_info || "");
      setValores(map.escola_valores || "");
      setAtivo((map.escola_agente_ativo || "true") === "true");
      setFolderAtivo(map.escola_folder_ativo === "true");
      const { data: folderFiles } = await supabase.storage.from("school-materials").list("", { search: "folder-digital.pdf" });
      setFolderExiste(!!folderFiles?.some((file) => file.name === "folder-digital.pdf"));
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    const nomeAgente = agenteNome.trim();
    if (!nomeAgente || nomeAgente.length > 40 || /[\r\n*<>]/.test(nomeAgente) || nomeAgente.includes("[") || nomeAgente.includes("]")) {
      toast({ title: "Nome da atendente inválido", description: "Use de 1 a 40 caracteres, sem colchetes, asteriscos ou quebras de linha.", variant: "destructive" });
      return;
    }
    setSaving(true);
    if (folderAtivo && !folderExiste) {
      setSaving(false);
      toast({ title: "Envie o folder em PDF antes de ativar o envio", variant: "destructive" });
      return;
    }
    const rows = [
      { key: "escola_nome", value: nome },
      { key: "escola_info", value: info },
      { key: "escola_valores", value: valores },
      { key: "escola_agente_ativo", value: ativo ? "true" : "false" },
      { key: "escola_agente_nome", value: nomeAgente },
      { key: "escola_folder_ativo", value: folderAtivo ? "true" : "false" },
    ];
    const { error } = await supabase.from("system_settings").upsert(rows, { onConflict: "key" });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["school-identity"] });
    toast({ title: "Configurações da escola salvas" });
  };

  const uploadFolder = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf" || file.size > 18 * 1024 * 1024 || file.size === 0) {
      toast({ title: "Selecione um PDF de até 18 MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    const { error } = await supabase.storage.from("school-materials")
      .upload("folder-digital.pdf", file, { upsert: true, contentType: "application/pdf", cacheControl: "60" });
    setUploading(false);
    if (error) toast({ title: "Falha ao enviar folder", description: error.message, variant: "destructive" });
    else {
      setFolderExiste(true);
      toast({ title: "Folder atualizado", description: "Ative o envio abaixo e salve as configurações quando a versão estiver aprovada." });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Atendimento automático</CardTitle>
          <CardDescription>
            Quando ligado, o agente responde sozinho perguntas sobre currículo, horário, localização e valores de
            matrícula. Assuntos mais profundos vão para a secretaria.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch checked={ativo} onCheckedChange={setAtivo} id="escola-ativo" />
            <Label htmlFor="escola-ativo">{ativo ? "Agente ligado" : "Agente desligado"}</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="escola-agente-nome">Nome da atendente virtual</Label>
            <Input id="escola-agente-nome" value={agenteNome} onChange={(e) => setAgenteNome(e.target.value)} maxLength={40} placeholder="Ex.: Ana" />
            <p className="text-xs text-muted-foreground">Esse nome identifica a atendente nas próximas respostas. As conversas anteriores mantêm o nome usado na época.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pesquisa de satisfação</CardTitle>
          <CardDescription>Após o encerramento no WhatsApp, a atendente pergunta como a família conheceu a escola e pede uma nota de 1 a 5. As respostas de origem aparecem em Origem e conversão.</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Folder digital</CardTitle>
          <CardDescription>Envie a versão final em PDF. A atendente poderá compartilhá-la no WhatsApp quando uma família pedir para conhecer melhor a escola.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input type="file" accept="application/pdf,.pdf" aria-label="Selecionar folder digital em PDF"
            disabled={uploading} onChange={(event) => void uploadFolder(event.target.files?.[0])} />
          <p className="text-xs text-muted-foreground">{folderExiste ? "PDF carregado na escola" : "Nenhum PDF carregado"} · Limite de 18 MB. O arquivo fica privado até o envio ao WhatsApp.</p>
          <div className="flex items-center gap-3">
            <Switch id="escola-folder-ativo" checked={folderAtivo} onCheckedChange={setFolderAtivo} disabled={!folderExiste} />
            <Label htmlFor="escola-folder-ativo">Permitir que a atendente envie o folder</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informações da escola</CardTitle>
          <CardDescription>O agente só pode responder o que estiver escrito aqui.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="escola-nome">Nome da escola</Label>
            <Input id="escola-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da escola" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="escola-info">Horário, endereço e currículos</Label>
            <Textarea id="escola-info" rows={6} value={info} onChange={(e) => setInfo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="escola-valores">Valores de matrícula e mensalidade</Label>
            <Textarea
              id="escola-valores"
              rows={6}
              value={valores}
              onChange={(e) => setValores(e.target.value)}
              placeholder={`Ex.:\nInfantil: matrícula R$ X, mensalidade R$ Y\nFundamental I: ...`}
            />
            <p className="text-xs text-muted-foreground">
              Enquanto estiver vazio, o agente não informa valores e encaminha para a secretaria.
            </p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
      </Button>
    </div>
  );
}
