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

const KEYS = ["escola_nome", "escola_info", "escola_valores", "escola_agente_ativo"] as const;

const DEFAULT_INFO = `Horário de funcionamento: 7h30 às 18h, de segunda a sexta.
Endereço: R. Adílson José Pinto Pereira, 1089 - Infraero, Macapá - AP, CEP 68908-530.
Currículos devem ser enviados para o e-mail rh.cocmacapanorte@gmail.com.`;

export default function SchoolSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState("");
  const [info, setInfo] = useState(DEFAULT_INFO);
  const [valores, setValores] = useState("");
  const [ativo, setAtivo] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("system_settings").select("key, value").in("key", KEYS as unknown as string[]);
      const map: Record<string, string> = {};
      (data || []).forEach((r: any) => (map[r.key] = r.value));
      setNome(map.escola_nome || "");
      setInfo(map.escola_info || DEFAULT_INFO);
      setValores(map.escola_valores || "");
      setAtivo((map.escola_agente_ativo || "true") === "true");
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const rows = [
      { key: "escola_nome", value: nome },
      { key: "escola_info", value: info },
      { key: "escola_valores", value: valores },
      { key: "escola_agente_ativo", value: ativo ? "true" : "false" },
    ];
    const { error } = await supabase.from("system_settings").upsert(rows, { onConflict: "key" });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Configurações da escola salvas" });
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
        <CardContent className="flex items-center gap-3">
          <Switch checked={ativo} onCheckedChange={setAtivo} id="escola-ativo" />
          <Label htmlFor="escola-ativo">{ativo ? "Agente ligado" : "Agente desligado"}</Label>
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
            <Input id="escola-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: COC Macapá Norte" />
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
              placeholder={"Ex.:\nInfantil: matrícula R$ X, mensalidade R$ Y\nFundamental I: ..."}
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
