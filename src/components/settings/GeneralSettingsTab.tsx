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
  "escola_nome",
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
      {/* Escola */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">COC Macapá Norte</h3>
          <p className="text-xs text-muted-foreground">
            Configurações gerais da integração do CRM escolar.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="escola_nome">Nome da escola</Label>
          <Input
            id="escola_nome"
            value={settings.escola_nome || ""}
            onChange={(e) => updateSetting("escola_nome", e.target.value)}
            placeholder="COC Macapá Norte"
          />
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
        <div className="grid grid-cols-1 gap-4">
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
