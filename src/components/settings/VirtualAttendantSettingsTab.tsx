import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Bot, FileText, Loader2, MessageSquare, ShieldCheck, Users } from "lucide-react";

const DEFAULT_VALUES_DATE = "1º de novembro de 2026";
const DEFAULT_HOURS = "7h30 às 18h";
const SETTINGS_KEYS = [
  "escola_agente_ativo",
  "escola_agente_nome",
  "escola_valores_data_divulgacao",
  "escola_horario_secretaria",
  "escola_pesquisa_ativa",
  "escola_folder_ativo",
] as const;

export default function VirtualAttendantSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [agentActive, setAgentActive] = useState(true);
  const [agentName, setAgentName] = useState("Ana");
  const [valuesDate, setValuesDate] = useState(DEFAULT_VALUES_DATE);
  const [officeHours, setOfficeHours] = useState(DEFAULT_HOURS);
  const [surveyActive, setSurveyActive] = useState(true);
  const [folderActive, setFolderActive] = useState(false);
  const [folderExists, setFolderExists] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase.from("system_settings").select("key, value").in("key", [...SETTINGS_KEYS]);
        if (error) throw error;
        const values: Record<string, string> = {};
        (data || []).forEach((row: { key: string; value: string | null }) => { values[row.key] = row.value || ""; });
        setAgentActive((values.escola_agente_ativo || "true") === "true");
        setAgentName(values.escola_agente_nome || "Ana");
        setValuesDate(values.escola_valores_data_divulgacao || DEFAULT_VALUES_DATE);
        setOfficeHours(values.escola_horario_secretaria || DEFAULT_HOURS);
        setSurveyActive((values.escola_pesquisa_ativa || "true") === "true");
        setFolderActive(values.escola_folder_ativo === "true");
        const { data: files, error: fileError } = await supabase.storage.from("school-materials").list("", { search: "folder-digital.pdf" });
        if (fileError) throw fileError;
        setFolderExists(!!files?.some((file) => file.name === "folder-digital.pdf"));
      } catch (error) {
        toast.error("Não foi possível carregar as configurações da atendente virtual");
        console.error("virtual_attendant_settings_load_failed", error);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const save = async () => {
    const name = agentName.trim();
    if (!name || name.length > 40 || /[\r\n*<>]/.test(name) || name.includes("[") || name.includes("]")) {
      toast.error("Nome da atendente inválido");
      return;
    }
    if (folderActive && !folderExists) {
      toast.error("Envie o folder em PDF antes de ativar o envio");
      return;
    }
    setSaving(true);
    const rows = [
      { key: "escola_agente_ativo", value: agentActive ? "true" : "false" },
      { key: "escola_agente_nome", value: name },
      { key: "escola_valores_data_divulgacao", value: valuesDate.trim() },
      { key: "escola_horario_secretaria", value: officeHours.trim() },
      { key: "escola_pesquisa_ativa", value: surveyActive ? "true" : "false" },
      { key: "escola_folder_ativo", value: folderActive ? "true" : "false" },
    ];
    const { error } = await supabase.from("system_settings").upsert(rows, { onConflict: "key" });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar as configurações", { description: error.message });
      return;
    }
    toast.success(`Configurações de ${name} salvas`);
  };

  const uploadFolder = async (file?: File) => {
    if (!file) return;
    if (file.type !== "application/pdf" || file.size <= 0 || file.size > 18 * 1024 * 1024) {
      toast.error("Selecione um PDF válido de até 18 MB");
      return;
    }
    setUploading(true);
    const { error } = await supabase.storage.from("school-materials").upload("folder-digital.pdf", file, {
      upsert: true, contentType: "application/pdf", cacheControl: "60",
    });
    setUploading(false);
    if (error) {
      toast.error("Falha ao enviar o folder", { description: error.message });
      return;
    }
    setFolderExists(true);
    toast.success("Folder atualizado", { description: "Salve as configurações para confirmar o estado do envio." });
  };

  if (loading) return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando configurações da atendente virtual...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" />Atendimento automático</CardTitle>
          <CardDescription>Controle se {agentName || "a atendente virtual"} pode responder automaticamente e defina como ela se identifica.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch id="agent-active" checked={agentActive} onCheckedChange={setAgentActive} />
            <Label htmlFor="agent-active">{agentActive ? `${agentName || "Atendente virtual"} ligada` : `${agentName || "Atendente virtual"} desligada`}</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-name">Nome da atendente virtual</Label>
            <Input id="agent-name" value={agentName} maxLength={40} onChange={(e) => setAgentName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ana-values-date">Data de divulgação dos valores de 2027</Label>
            <Input id="ana-values-date" value={valuesDate} onChange={(e) => setValuesDate(e.target.value)} placeholder="Ex.: 1º de novembro de 2026" />
            <p className="text-xs text-muted-foreground">Data confirmada: 1º de novembro de 2026. Se apagar a data, a Ana não deve inventar outra.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" />Horários e visitas</CardTitle>
          <CardDescription>O horário da secretaria é uma informação geral. A agenda de visitas consulta os horários livres e reserva automaticamente após a escolha da família.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ana-office-hours">Horário da secretaria</Label>
            <Input id="ana-office-hours" value={officeHours} onChange={(e) => setOfficeHours(e.target.value)} placeholder="7h30 às 18h" />
            <p className="text-xs text-muted-foreground">Valor inicial baseado no horário que já está configurado: 7h30 às 18h. Confira os dias de atendimento nas informações oficiais da escola.</p>
          </div>
          <div className="rounded-lg border p-3 space-y-2 text-sm">
            <p className="font-medium">Nova regra de agendamento automático</p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1">
              <li>Segunda a sexta-feira, das 8h às 18h (horário de Macapá).</li>
              <li>Duração de cada visita: 30 minutos.</li>
              <li>Antecedência mínima: 60 minutos.</li>
              <li>A Ana consulta a agenda antes de oferecer horários e revalida a disponibilidade antes de reservar.</li>
              <li>Depois de salvar, a visita aparece no CRM como agendada; a equipe registra quando ela for realizada.</li>
            </ul>
          </div>
          <div className="rounded-lg border p-3 text-sm text-muted-foreground">
            O telefone de contato não é duplicado aqui: a Ana deve usar o mesmo número da integração WhatsApp já configurada no CRM.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Pesquisa de satisfação</CardTitle>
          <CardDescription>O controle de duplicidade e as regras de elegibilidade continuam sendo aplicados pelo backend.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Switch id="ana-survey-active" checked={surveyActive} onCheckedChange={setSurveyActive} />
            <Label htmlFor="ana-survey-active">{surveyActive ? "Pesquisa ativa" : "Pesquisa desativada"}</Label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">A pesquisa não deve ser enviada enquanto a secretaria estiver atendendo nem para famílias excluídas pela regra de elegibilidade.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Folder digital</CardTitle>
          <CardDescription>O PDF é armazenado no espaço privado da escola e enviado pelo WhatsApp quando solicitado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input type="file" accept="application/pdf,.pdf" aria-label="Selecionar folder digital em PDF" disabled={uploading} onChange={(event) => void uploadFolder(event.target.files?.[0])} />
          <p className="text-xs text-muted-foreground">{folderExists ? "PDF carregado na escola" : "Nenhum PDF carregado"} · Limite de 18 MB.</p>
          <div className="flex items-center gap-3">
            <Switch id="ana-folder-active" checked={folderActive} onCheckedChange={setFolderActive} disabled={!folderExists} />
            <Label htmlFor="ana-folder-active">Permitir que a Ana envie o folder</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Privacidade e encaminhamento humano</CardTitle>
          <CardDescription>Política de privacidade para anexos recebidos das famílias.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p><strong>Imagens, PDFs e documentos:</strong> encaminhar à secretaria para conferência manual; não enviar o conteúdo a OpenAI, Gemini, Lovable ou outros serviços de IA.</p>
          <p><strong>Secretaria:</strong> solicitações que {agentName || "a atendente virtual"} não consegue resolver devem ser encaminhadas à equipe. Quando um atendente assumir a conversa, a atendente virtual deve parar de responder automaticamente.</p>
          <p className="text-xs text-muted-foreground">A regra de privacidade só estará efetiva em produção depois que a alteração correspondente no backend for revisada, incorporada e publicada.</p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar configurações de {agentName || "atendimento virtual"}
        </Button>
      </div>
    </div>
  );
}
