import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Save, RotateCcw, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { defaultTemplates, type PromptTemplate } from "@/data/promptTemplates";

// Placeholders disponíveis por template ID
const templatePlaceholders: Record<string, Array<{ name: string; description: string }>> = {
  "2": [
    { name: "text", description: "Texto bruto colado pelo usuário" },
  ],
  "15": [], // OCR - sem placeholders editáveis
  "6": [
    { name: "from", description: "Remetente do email" },
    { name: "to", description: "Destinatário do email" },
    { name: "cc", description: "CC do email" },
    { name: "subject", description: "Assunto do email" },
    { name: "emailContent", description: "Conteúdo do email" },
  ],
  "13": [
    { name: "leadName", description: "Nome do lead" },
    { name: "leadEmails", description: "Emails do lead" },
    { name: "leadPhones", description: "Telefones do lead" },
    { name: "leadSource", description: "Origem do lead" },
    { name: "emailContext", description: "Histórico de emails" },
    { name: "whatsappContext", description: "Histórico de WhatsApp" },
  ],
  "14": [], // Diagnóstico - prompt é system prompt sem variáveis
  "16": [
    { name: "userName", description: "Nome do usuário do sistema" },
  ],
  "3": [
    { name: "emailSubject", description: "Assunto do email" },
    { name: "emailContent", description: "Conteúdo do email" },
  ],
  "7": [
    { name: "clientFirstName", description: "Primeiro nome do cliente" },
    { name: "companyName", description: "Empresa do cliente" },
    { name: "scope", description: "Escopo solicitado" },
    { name: "deadline", description: "Prazo para resposta" },
    { name: "langInstruction", description: "Instrução de idioma detectado" },
  ],
  "10": [
    { name: "followUpNumber", description: "Número do follow-up (1-4)" },
    { name: "leadName", description: "Nome do lead" },
    { name: "emailHistory", description: "Histórico completo de emails" },
  ],
  "11": [
    { name: "leadName", description: "Nome do lead" },
    { name: "emailHistory", description: "Histórico completo de emails" },
  ],
  "4": [
    { name: "emailContent", description: "Email mais recente do cliente" },
    { name: "emailHistory", description: "Histórico de emails" },
  ],
  "5": [
    { name: "leadName", description: "Nome do lead" },
    { name: "emailHistory", description: "Histórico completo de emails" },
  ],
  "23": [
    { name: "emailContent", description: "Email mais recente do cliente" },
    { name: "emailHistory", description: "Histórico de emails" },
  ],
  "24": [
    { name: "susanName", description: "Nome da assistente (config)" },
    { name: "companyName", description: "Nome da empresa (config)" },
    { name: "leadName", description: "Nome do lead" },
    { name: "emailHistory", description: "Histórico completo de emails" },
    { name: "mediaKitLink", description: "Link do Media Kit (config)" },
  ],
  "8": [
    { name: "context", description: "Contexto/instrução da mensagem" },
    { name: "historico", description: "Histórico completo (emails + WhatsApp + info do lead)" },
    { name: "lastMessages", description: "Últimas 3 mensagens de WhatsApp" },
    { name: "leadName", description: "Nome do lead" },
    { name: "leadDescription", description: "Descrição do lead" },
    { name: "companyName", description: "Nome da empresa (config)" },
  ],
  "9": [
    { name: "leadName", description: "Nome do lead" },
    { name: "emailHistory", description: "Histórico completo de emails" },
  ],
  "12": [], // Extração de evento - prompt é system prompt
  "17": [
    { name: "company", description: "Nome da empresa" },
    { name: "title", description: "Título da palestra" },
    { name: "audience", description: "Público-alvo" },
    { name: "location", description: "Local do evento" },
    { name: "date", description: "Data do evento" },
    { name: "duration", description: "Duração" },
  ],
  "18": [
    { name: "topics", description: "Lista de tópicos da palestra" },
  ],
  "19": [
    { name: "price", description: "Valor formatado" },
  ],
  "1": [
    { name: "leadName", description: "Nome do lead" },
    { name: "leadDescription", description: "Descrição/contexto do lead" },
    { name: "produto", description: "Tipo de produto" },
    { name: "valor formatado", description: "Valor com moeda formatada" },
    { name: "proposalUrl", description: "URL da proposta" },
  ],
  "20": [], // Exportação - system prompt
  "21": [
    { name: "userName", description: "Nome do usuário do sistema" },
  ],
  "22": [
    { name: "userName", description: "Nome do usuário do sistema" },
  ],
};

const PromptsTab = () => {
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("Miguel Fernandes");

  // Autocomplete state
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteFilter, setAutocompleteFilter] = useState("");
  const [autocompletePosition, setAutocompletePosition] = useState({ top: 0, left: 0 });
  const [selectedAutocompleteIndex, setSelectedAutocompleteIndex] = useState(0);
  const [cursorBraceStart, setCursorBraceStart] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCustomPrompts();
    fetchCompanyName();
  }, []);

  const fetchCompanyName = async () => {
    try {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "company_name")
        .maybeSingle();
      if (data?.value) setCompanyName(data.value);
    } catch (err) {
      console.error("Error fetching company name:", err);
    }
  };

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
    setShowAutocomplete(false);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValue("");
    setShowAutocomplete(false);
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
      setShowAutocomplete(false);
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

  const grouped = defaultTemplates.reduce<Record<string, PromptTemplate[]>>(
    (acc, t) => {
      if (!acc[t.function]) acc[t.function] = [];
      acc[t.function].push(t);
      return acc;
    },
    {}
  );

  // Get available placeholders for the current editing template
  const currentPlaceholders = editingId ? (templatePlaceholders[editingId] || []) : [];

  // Filter placeholders based on what user typed after {
  const filteredPlaceholders = currentPlaceholders.filter(p =>
    p.name.toLowerCase().includes(autocompleteFilter.toLowerCase())
  );

  const getCaretCoordinates = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return { top: 0, left: 0 };

    // Create a mirror div to calculate position
    const mirror = document.createElement('div');
    const style = window.getComputedStyle(textarea);
    
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.style.width = style.width;
    mirror.style.fontSize = style.fontSize;
    mirror.style.fontFamily = style.fontFamily;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.padding = style.padding;
    mirror.style.border = style.border;
    mirror.style.letterSpacing = style.letterSpacing;
    
    const textBefore = textarea.value.substring(0, textarea.selectionStart);
    mirror.textContent = textBefore;
    
    const span = document.createElement('span');
    span.textContent = '|';
    mirror.appendChild(span);
    
    document.body.appendChild(mirror);
    
    const spanRect = span.getBoundingClientRect();
    const textareaRect = textarea.getBoundingClientRect();
    
    const top = spanRect.top - textareaRect.top + textarea.scrollTop - textarea.scrollTop + 24;
    const left = Math.min(spanRect.left - textareaRect.left, textareaRect.width - 250);
    
    document.body.removeChild(mirror);
    
    return { top: Math.max(top, 24), left: Math.max(left, 0) };
  }, []);

  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setEditValue(value);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    
    // Check if we're inside a {placeholder} context
    const lastOpenBrace = textBeforeCursor.lastIndexOf('{');
    const lastCloseBrace = textBeforeCursor.lastIndexOf('}');
    
    if (lastOpenBrace > lastCloseBrace && currentPlaceholders.length > 0) {
      // We're after an unclosed {
      const filter = textBeforeCursor.substring(lastOpenBrace + 1);
      // Don't show autocomplete if filter has spaces or newlines
      if (!filter.includes('\n') && !filter.includes(' ')) {
        setAutocompleteFilter(filter);
        setCursorBraceStart(lastOpenBrace);
        setSelectedAutocompleteIndex(0);
        setShowAutocomplete(true);
        // Defer position calc
        requestAnimationFrame(() => {
          const coords = getCaretCoordinates();
          setAutocompletePosition(coords);
        });
        return;
      }
    }
    
    setShowAutocomplete(false);
  }, [currentPlaceholders, getCaretCoordinates]);

  const insertPlaceholder = useCallback((placeholderName: string) => {
    if (cursorBraceStart === null) return;
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const before = editValue.substring(0, cursorBraceStart);
    const after = editValue.substring(cursorPos);
    const inserted = `{${placeholderName}}`;
    const newValue = before + inserted + after;
    
    setEditValue(newValue);
    setShowAutocomplete(false);
    
    // Set cursor after the inserted placeholder
    requestAnimationFrame(() => {
      const newPos = cursorBraceStart + inserted.length;
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  }, [cursorBraceStart, editValue]);

  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showAutocomplete || filteredPlaceholders.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedAutocompleteIndex(prev => 
        prev < filteredPlaceholders.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedAutocompleteIndex(prev => 
        prev > 0 ? prev - 1 : filteredPlaceholders.length - 1
      );
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertPlaceholder(filteredPlaceholders[selectedAutocompleteIndex].name);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowAutocomplete(false);
    }
  }, [showAutocomplete, filteredPlaceholders, selectedAutocompleteIndex, insertPlaceholder]);

  if (loading) {
    return (
      <p className="text-muted-foreground text-center py-12">
        Carregando prompts...
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
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
                        {t.title.replace("{companyName}", companyName)}
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
                  <div className="flex items-start gap-2 bg-muted/50 rounded-md p-3">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        Quando é usado:
                      </span>{" "}
                      {t.usageContext}
                    </p>
                  </div>

                  {/* Placeholders disponíveis */}
                  {(templatePlaceholders[t.id] || []).length > 0 && (
                    <div className="bg-muted/30 rounded-md p-3 border border-border/50">
                      <p className="text-[11px] font-medium text-foreground mb-2">
                        Variáveis disponíveis:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {(templatePlaceholders[t.id] || []).map(p => (
                          <span
                            key={p.name}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-mono cursor-pointer hover:bg-primary/20 transition-colors"
                            title={p.description}
                            onClick={() => {
                              if (editingId === t.id) {
                                const textarea = textareaRef.current;
                                if (textarea) {
                                  const cursorPos = textarea.selectionStart;
                                  const before = editValue.substring(0, cursorPos);
                                  const after = editValue.substring(cursorPos);
                                  const inserted = `{${p.name}}`;
                                  const newValue = before + inserted + after;
                                  setEditValue(newValue);
                                  requestAnimationFrame(() => {
                                    const newPos = cursorPos + inserted.length;
                                    textarea.focus();
                                    textarea.setSelectionRange(newPos, newPos);
                                  });
                                }
                              }
                            }}
                          >
                            {`{${p.name}}`}
                            <span className="text-muted-foreground font-sans text-[10px]">
                              {p.description}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {editingId === t.id ? (
                    <div className="space-y-3">
                      <div className="relative">
                        <Textarea
                          ref={textareaRef}
                          value={editValue}
                          onChange={handleTextareaChange}
                          onKeyDown={handleTextareaKeyDown}
                          onBlur={() => {
                            // Delay hiding to allow click on autocomplete items
                            setTimeout(() => setShowAutocomplete(false), 200);
                          }}
                          className="font-mono text-xs min-h-[300px] leading-relaxed"
                          placeholder="Digite o prompt..."
                        />
                        {/* Autocomplete dropdown */}
                        {showAutocomplete && filteredPlaceholders.length > 0 && (
                          <div
                            ref={autocompleteRef}
                            className="absolute z-50 bg-popover border border-border rounded-md shadow-lg overflow-hidden"
                            style={{
                              top: autocompletePosition.top,
                              left: autocompletePosition.left,
                              minWidth: '220px',
                              maxWidth: '320px',
                            }}
                          >
                            {filteredPlaceholders.map((p, idx) => (
                              <button
                                key={p.name}
                                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-accent transition-colors ${
                                  idx === selectedAutocompleteIndex ? 'bg-accent' : ''
                                }`}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  insertPlaceholder(p.name);
                                }}
                                onMouseEnter={() => setSelectedAutocompleteIndex(idx)}
                              >
                                <span className="font-mono text-primary font-medium">{`{${p.name}}`}</span>
                                <span className="text-muted-foreground text-[10px] truncate">{p.description}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Digite <span className="font-mono bg-muted px-1 rounded">{"{"}</span> para ver as variáveis disponíveis com autocomplete. Clique nos badges acima para inserir.
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
  );
};

export default PromptsTab;
