import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SettingsMap {
  [key: string]: string;
}

const SETTINGS_KEYS = [
  "escola_nome",
  "escola_info",
  "escola_valores",
  "escola_agente_ativo",
  "company_name",
  "company_email",
  "susan_name",
  "susan_email",
];

export default function GeneralSettingsTab() {
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("system_settings")
      .select("key, value")
      .in("key", SETTINGS_KEYS)
      .then(({ data, error }) => {
        if (error) toast.error("Erro ao carregar configurações");
        const map: SettingsMap = {};
        data?.forEach((row: { key: string; value: string }) => {
          map[row.key] = row.value;
        });
        setSettings(map);
        setLoading(false);
      });
  }, []);

  const updateSetting = (key: string, value: string) =>
    setSettings((previous) => ({ ...previous, [key]: value }));

  const saveSettings = async () => {
    setSaving(true);
    const now = new Date().toISOString();
    const rows = Object.entries(settings).map(([key, value]) => ({
      key,
      value,
      updated_at: now,
    }));
    const { error } = await supabase
      .from("system_settings")
      .upsert(rows, { onConflict: "key" });
    setSaving(false);
    if (error) toast.error("Erro ao salvar configurações");
    else toast.success("Configurações salvas");
  };

  if (loading) {
    return <p className="py-12 text-center text-muted-foreground">Carregando configurações...</p>;
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Identidade da escola</h3>
          <p className="text-xs text-muted-foreground">
            Informações oficiais utilizadas pelo atendimento.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="escola_nome">Nome da escola</Label>
            <Input
              id="escola_nome"
              value={settings.escola_nome || "COC Macapá Norte"}
              onChange={(event) => updateSetting("escola_nome", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company_email">E-mail oficial</Label>
            <Input
              id="company_email"
              type="email"
              value={settings.company_email || ""}
              onChange={(event) => updateSetting("company_email", event.target.value)}
              placeholder="atendimento@escola.com.br"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="escola_info">Informações oficiais</Label>
          <Textarea
            id="escola_info"
            rows={8}
            value={settings.escola_info || ""}
            onChange={(event) => updateSetting("escola_info", event.target.value)}
            placeholder="Endereço, horários, canais de contato, documentos e orientações oficiais."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="escola_valores">Valores autorizados para divulgação</Label>
          <Textarea
            id="escola_valores"
            rows={6}
            value={settings.escola_valores || ""}
            onChange={(event) => updateSetting("escola_valores", event.target.value)}
            placeholder="Cadastre somente valores e condições que a IA pode informar."
          />
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Agente de atendimento</h3>
          <p className="text-xs text-muted-foreground">
            O agente deve transferir situações individuais e negociações para a secretaria.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="susan_name">Nome exibido</Label>
            <Input
              id="susan_name"
              value={settings.susan_name || "Atendimento COC Macapá Norte"}
              onChange={(event) => updateSetting("susan_name", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="susan_email">E-mail do atendimento</Label>
            <Input
              id="susan_email"
              type="email"
              value={settings.susan_email || ""}
              onChange={(event) => updateSetting("susan_email", event.target.value)}
              placeholder="atendimento@escola.com.br"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="escola_agente_ativo">Agente ativo</Label>
          <select
            id="escola_agente_ativo"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={settings.escola_agente_ativo || "false"}
            onChange={(event) => updateSetting("escola_agente_ativo", event.target.value)}
          >
            <option value="false">Desativado</option>
            <option value="true">Ativado</option>
          </select>
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={saveSettings} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar configurações
        </Button>
      </div>
    </div>
  );
}
