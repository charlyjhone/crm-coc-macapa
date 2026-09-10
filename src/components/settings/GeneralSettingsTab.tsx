import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Save, Loader2, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SettingsMap {
  [key: string]: string;
}

const SETTINGS_KEYS = [
  "susan_name",
  "susan_email",
  "company_name",
  "company_email",
  "media_kit_link",
  "proposal_template_path",
  "proposal_total_slides",
  "proposal_insert_slides",
  "webhook_resend_url",
  "webhook_zapi_url",
];

const GeneralSettingsTab = () => {
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", SETTINGS_KEYS);

      if (error) throw error;

      const map: SettingsMap = {};
      data?.forEach((row: any) => {
        map[row.key] = row.value;
      });
      setSettings(map);
    } catch (err) {
      console.error("Error fetching settings:", err);
      toast.error("Erro ao carregar configurações");
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const upserts = Object.entries(settings).map(([key, value]) => ({
        key,
        value,
        updated_at: now,
      }));

      const { error } = await supabase
        .from("system_settings")
        .upsert(upserts, { onConflict: "key" });

      if (error) throw error;

      toast.success("Configurações salvas com sucesso!");
    } catch (err) {
      console.error("Error saving settings:", err);
      toast.error("Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("Copiado!");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const resendWebhookUrl = `${supabaseUrl}/functions/v1/resend-inbound-webhook`;
  const zapiWebhookUrl = `${supabaseUrl}/functions/v1/zapi-webhook`;

  if (loading) {
    return (
      <p className="text-muted-foreground text-center py-12">
        Carregando configurações...
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* Susan */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Assistente Virtual (Susan)</h3>
          <p className="text-xs text-muted-foreground">
            Nome e email da assistente que envia propostas e follow-ups automaticamente.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="susan_name">Nome</Label>
            <Input
              id="susan_name"
              value={settings.susan_name || ""}
              onChange={(e) => updateSetting("susan_name", e.target.value)}
              placeholder="Susan Whitfield"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="susan_email">Email</Label>
            <Input
              id="susan_email"
              type="email"
              value={settings.susan_email || ""}
              onChange={(e) => updateSetting("susan_email", e.target.value)}
              placeholder="susan@inventormiguel.link"
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* Company */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Empresa / Prestador de Serviço</h3>
          <p className="text-xs text-muted-foreground">
            Nome e email principal de quem está oferecendo os serviços (palestra, consultoria, etc.).
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="company_name">Nome</Label>
            <Input
              id="company_name"
              value={settings.company_name || ""}
              onChange={(e) => updateSetting("company_name", e.target.value)}
              placeholder="Miguel Fernandes"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company_email">Email</Label>
            <Input
              id="company_email"
              type="email"
              value={settings.company_email || ""}
              onChange={(e) => updateSetting("company_email", e.target.value)}
              placeholder="miguel@inventormiguel.com"
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* Media Kit */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Media Kit</h3>
          <p className="text-xs text-muted-foreground">
            Link do media kit compartilhado com marcas quando solicitado.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="media_kit_link">Link do Media Kit</Label>
          <Input
            id="media_kit_link"
            type="url"
            value={settings.media_kit_link || ""}
            onChange={(e) => updateSetting("media_kit_link", e.target.value)}
            placeholder="https://inventormiguel.link/kit"
          />
        </div>
      </section>

      <Separator />

      {/* Proposal Template */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Proposta Comercial (PDF)</h3>
          <p className="text-xs text-muted-foreground">
            Configuração do template PDF usado para gerar propostas de palestra.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="proposal_template_path">Caminho do Template (Storage)</Label>
            <Input
              id="proposal_template_path"
              value={settings.proposal_template_path || ""}
              onChange={(e) => updateSetting("proposal_template_path", e.target.value)}
              placeholder="proposal-templates/template.pdf"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proposal_total_slides">Total de Slides</Label>
            <Input
              id="proposal_total_slides"
              type="number"
              value={settings.proposal_total_slides || ""}
              onChange={(e) => updateSetting("proposal_total_slides", e.target.value)}
              placeholder="32"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proposal_insert_slides">Slides para Inserir (ex: 30,31,32)</Label>
            <Input
              id="proposal_insert_slides"
              value={settings.proposal_insert_slides || ""}
              onChange={(e) => updateSetting("proposal_insert_slides", e.target.value)}
              placeholder="30,31,32"
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* Webhooks */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Webhooks</h3>
          <p className="text-xs text-muted-foreground">
            URLs que devem ser configuradas nos serviços externos para enviar notificações ao sistema.
          </p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook do Resend (Inbound Email)</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={resendWebhookUrl}
                className="font-mono text-xs bg-muted"
              />
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => copyToClipboard(resendWebhookUrl, "resend")}
              >
                {copiedKey === "resend" ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Configure este URL no Resend → Webhooks → Inbound Email para receber emails automaticamente.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Webhook do ZAPI (WhatsApp)</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={zapiWebhookUrl}
                className="font-mono text-xs bg-muted"
              />
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => copyToClipboard(zapiWebhookUrl, "zapi")}
              >
                {copiedKey === "zapi" ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Configure este URL no ZAPI → Configurações → Webhook para receber mensagens do WhatsApp.
            </p>
          </div>
        </div>
      </section>

      <Separator />

      {/* API Keys Notice */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Chaves de API (Backend)</h3>
          <p className="text-xs text-muted-foreground">
            As seguintes chaves de API são configuradas diretamente no backend e não podem ser alteradas por aqui.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-md border border-border bg-muted/50 p-4 space-y-1">
            <p className="text-sm font-medium">Resend API Key</p>
            <p className="text-xs text-muted-foreground">
              Usada para envio e recebimento de emails. Configure via painel do backend (Secrets).
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/50 p-4 space-y-1">
            <p className="text-sm font-medium">ZAPI (Instance ID, Token, Client Token)</p>
            <p className="text-xs text-muted-foreground">
              Usada para integração com WhatsApp. Configure via painel do backend (Secrets).
            </p>
          </div>
        </div>
      </section>

      <div className="flex justify-end pt-4">
        <Button onClick={saveSettings} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
};

export default GeneralSettingsTab;
