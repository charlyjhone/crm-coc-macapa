import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, RotateCcw, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { defaultTemplates, type PromptTemplate } from "@/data/promptTemplates";

const Prompts = () => {
  const navigate = useNavigate();
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCustomPrompts();
  }, []);

  const fetchCustomPrompts = async () => {
    try {
      const { data, error } = await supabase
        .from("prompt_templates")
        .select("id, custom_prompt");

      if (error) throw error;

      const map: Record<string, string> = {};
      data?.forEach((row: any) => {
        map[row.id] = row.custom_prompt;
      });
      setCustomPrompts(map);
    } catch (err) {
      console.error("Error fetching custom prompts:", err);
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (template: PromptTemplate) => {
    setEditingId(template.id);
    setEditValue(customPrompts[template.id] || template.prompt);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValue("");
  };

  const savePrompt = async (template: PromptTemplate) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("prompt_templates")
        .upsert({
          id: template.id,
          custom_prompt: editValue,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      setCustomPrompts((prev) => ({ ...prev, [template.id]: editValue }));
      setEditingId(null);
      toast.success("Prompt salvo com sucesso!");
    } catch (err) {
      console.error("Error saving prompt:", err);
      toast.error("Erro ao salvar prompt");
    } finally {
      setSaving(false);
    }
  };

  const resetPrompt = async (template: PromptTemplate) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("prompt_templates")
        .delete()
        .eq("id", template.id);

      if (error) throw error;

      setCustomPrompts((prev) => {
        const next = { ...prev };
        delete next[template.id];
        return next;
      });
      setEditingId(null);
      toast.success("Prompt restaurado ao padrão!");
    } catch (err) {
      console.error("Error resetting prompt:", err);
      toast.error("Erro ao restaurar prompt");
    } finally {
      setSaving(false);
    }
  };

  const getCurrentPrompt = (template: PromptTemplate) =>
    customPrompts[template.id] || template.prompt;

  const isCustomized = (id: string) => !!customPrompts[id];

  // Group templates by function
  const grouped = defaultTemplates.reduce<Record<string, PromptTemplate[]>>(
    (acc, t) => {
      if (!acc[t.function]) acc[t.function] = [];
      acc[t.function].push(t);
      return acc;
    },
    {}
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Templates de Prompts</h1>
            <p className="text-sm text-muted-foreground">
              {defaultTemplates.length} templates usados no sistema
              {Object.keys(customPrompts).length > 0 && (
                <span className="ml-2">
                  · {Object.keys(customPrompts).length} customizado
                  {Object.keys(customPrompts).length > 1 ? "s" : ""}
                </span>
              )}
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-center py-12">
            Carregando prompts...
          </p>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([fn, items]) => (
              <div key={fn}>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="outline" className="font-mono text-xs">
                    {fn}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {items.length} template{items.length > 1 ? "s" : ""}
                  </span>
                </div>
                <Accordion type="multiple" className="border rounded-lg">
                  {items.map((t) => (
                    <AccordionItem key={t.id} value={t.id}>
                      <AccordionTrigger className="px-4 hover:no-underline">
                        <div className="flex flex-col items-start text-left gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {t.title}
                            </span>
                            {isCustomized(t.id) && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0"
                              >
                                Editado
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground font-normal">
                            {t.description}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 space-y-3">
                        {/* Usage context */}
                        <div className="flex items-start gap-2 bg-muted/50 rounded-md p-3">
                          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">
                              Quando é usado:
                            </span>{" "}
                            {t.usageContext}
                          </p>
                        </div>

                        {editingId === t.id ? (
                          <div className="space-y-3">
                            <Textarea
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="font-mono text-xs min-h-[300px] leading-relaxed"
                              placeholder="Digite o prompt..."
                            />
                            <p className="text-[10px] text-muted-foreground">
                              Use {"{variavel}"} para variáveis dinâmicas. Elas
                              serão substituídas automaticamente pelo sistema.
                            </p>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => savePrompt(t)}
                                disabled={saving}
                              >
                                <Save className="h-3 w-3 mr-1" />
                                Salvar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={cancelEditing}
                                disabled={saving}
                              >
                                Cancelar
                              </Button>
                              {isCustomized(t.id) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => resetPrompt(t)}
                                  disabled={saving}
                                  className="ml-auto text-destructive hover:text-destructive"
                                >
                                  <RotateCcw className="h-3 w-3 mr-1" />
                                  Restaurar Padrão
                                </Button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <pre className="whitespace-pre-wrap text-xs bg-muted p-4 rounded-md font-mono leading-relaxed overflow-x-auto">
                              {getCurrentPrompt(t)}
                            </pre>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEditing(t)}
                            >
                              Editar Prompt
                            </Button>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Prompts;
