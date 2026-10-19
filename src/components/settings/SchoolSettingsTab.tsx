import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

const SETTINGS_KEYS = ["escola_nome", "escola_info", "escola_valores"] as const;

export default function SchoolSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState("");
  const [info, setInfo] = useState("");
  const [valores, setValores] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase.from("system_settings").select("key, value").in("key", [...SETTINGS_KEYS]);
        if (error) throw error;
        const map: Record<string, string> = {};
        (data || []).forEach((row: { key: string; value: string | null }) => { map[row.key] = row.value || ""; });
        setNome(map.escola_nome || "");
        setInfo(map.escola_info || "");
        setValores(map.escola_valores || "");
      } catch (error) {
        console.error("school_settings_load_failed", error);
        toast.error("Não foi possível carregar as informações da escola");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const save = async () => {
    setSaving(true);
    const rows = [
      { key: "escola_nome", value: nome.trim() },
      { key: "escola_info", value: info.trim() },
      { key: "escola_valores", value: valores.trim() },
    ];
    const { error } = await supabase.from("system_settings").upsert(rows, { onConflict: "key" });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar as informações da escola", { description: error.message });
      return;
    }
    toast.success("Informações da escola salvas");
  };

  if (loading) return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando informações da escola...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Identificação da escola</CardTitle>
          <CardDescription>Informações oficiais usadas como referência nas respostas da Ana.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="school-name">Nome da escola</Label>
            <Input id="school-name" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome oficial da escola" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="school-info">Informações oficiais, endereço, funcionamento e currículo</Label>
            <Textarea id="school-info" rows={8} value={info} onChange={(e) => setInfo(e.target.value)} placeholder="Endereço, etapas de ensino, horário de atendimento e outras informações confirmadas." />
            <p className="text-xs text-muted-foreground">Mantenha aqui os dias de atendimento, endereço e demais informações oficiais. A Ana não deve inventar informações que não estejam cadastradas.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="school-values">Valores de matrícula e mensalidade</Label>
            <Textarea id="school-values" rows={6} value={valores} onChange={(e) => setValores(e.target.value)} placeholder={"Ex.:\nEducação Infantil: ...\nEnsino Fundamental: ..."} />
            <p className="text-xs text-muted-foreground">Enquanto estiver vazio, a Ana não informa preços específicos e encaminha a dúvida à secretaria.</p>
          </div>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<Save className="mr-2 h-4 w-4" />Salvar informações da escola
        </Button>
      </div>
    </div>
  );
}
