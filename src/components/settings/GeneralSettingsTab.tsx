import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Check, Copy, Plug } from "lucide-react";
import { toast } from "sonner";

const GeneralSettingsTab = () => {
  const [copied, setCopied] = useState(false);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const zapiWebhookUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/zapi-webhook` : "";

  const copyToClipboard = async () => {
    if (!zapiWebhookUrl) {
      toast.error("URL do Supabase não configurada neste frontend");
      return;
    }
    try {
      await navigator.clipboard.writeText(zapiWebhookUrl);
      setCopied(true);
      toast.success("Webhook copiado");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar o webhook");
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Plug className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">Integração com WhatsApp (Z-API)</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          O número usado pela Ana é o mesmo número conectado à instância WhatsApp do CRM. Não cadastre um telefone diferente nesta tela.
        </p>
        <div className="space-y-2">
          <Label htmlFor="zapi-webhook">URL do webhook</Label>
          <div className="flex gap-2">
            <Input id="zapi-webhook" readOnly value={zapiWebhookUrl} className="bg-muted font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => void copyToClipboard()} aria-label="Copiar URL do webhook">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Configure esta URL no painel Z-API para receber mensagens do WhatsApp.</p>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Credenciais do provedor</h2>
        <div className="rounded-md border bg-muted/50 p-4">
          <p className="text-sm font-medium">Z-API (Instance ID, Token e Client Token)</p>
          <p className="mt-1 text-xs text-muted-foreground">
            As credenciais ficam protegidas nos secrets do backend e não são exibidas nem editadas nesta tela.
          </p>
        </div>
      </section>
    </div>
  );
};

export default GeneralSettingsTab;
