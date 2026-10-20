import { useMemo, useState } from "react";
import {
  AlertTriangle, Bell, CalendarDays, CheckCircle2, ChevronDown, ChevronRight,
  Clock3, GraduationCap, LayoutDashboard, MessageCircle, MoreHorizontal,
  Plus, Search, Settings2, Users, X, Phone, Send, Filter, School, UserRound,
  CalendarCheck, BarChart3, CircleHelp, ArrowUpRight, Sparkles,
} from "lucide-react";

type Stage = "Sem contato" | "Contato realizado" | "Visita agendada" | "Pós-visita" | "Matriculado";
type Lead = {
  id: number; student: string; guardian: string; grade: string; shift: string;
  stage: Stage; tag: string; age: string; next: string; phone: string;
  probability: number; lastMessage: string; visit?: string;
};

const initialLeads: Lead[] = [
  { id: 1, student: "João Pedro", guardian: "Ana Clara", grade: "6º ano", shift: "Tarde", stage: "Sem contato", tag: "Lead quente", age: "Há 3 dias", next: "Enviar primeira mensagem", phone: "(96) 99123-4567", probability: 82, lastMessage: "Olá, gostaria de informações para matrícula." },
  { id: 2, student: "Maria Eduarda", guardian: "Fernanda Lima", grade: "1º ano EM", shift: "Manhã", stage: "Sem contato", tag: "Novo contato", age: "Há 1 dia", next: "Realizar primeiro contato", phone: "(96) 99234-5678", probability: 55, lastMessage: "Quero conhecer a escola." },
  { id: 3, student: "Isabella Santos", guardian: "Patrícia Santos", grade: "5º ano", shift: "Manhã", stage: "Contato realizado", tag: "Em conversa", age: "Hoje", next: "Enviar informações", phone: "(96) 99345-6789", probability: 68, lastMessage: "Obrigada! Pode me enviar os valores?" },
  { id: 4, student: "Rafael Lima", guardian: "Carlos Lima", grade: "3º ano", shift: "Tarde", stage: "Contato realizado", tag: "Retorno pendente", age: "Há 2 dias", next: "Retornar sobre mensalidade", phone: "(96) 99456-7890", probability: 45, lastMessage: "Vou conversar com a família e retorno." },
  { id: 5, student: "Isabriel Souza", guardian: "Camila Souza", grade: "6º ano", shift: "Tarde", stage: "Visita agendada", tag: "Visita confirmada", age: "12/12 · 14h", next: "Preparar recepção", phone: "(96) 99567-8901", probability: 90, lastMessage: "Confirmado, estaremos aí!", visit: "12/12 às 14h" },
  { id: 6, student: "Sophia Costa", guardian: "Rodrigo Costa", grade: "2º ano", shift: "Manhã", stage: "Visita agendada", tag: "Visita confirmada", age: "15/12 · 10h", next: "Confirmar presença", phone: "(96) 99678-9012", probability: 76, lastMessage: "Perfeito, até lá!", visit: "15/12 às 10h" },
  { id: 7, student: "Valentina Rocha", guardian: "Renata Rocha", grade: "4º ano", shift: "Manhã", stage: "Pós-visita", tag: "Aguardando retorno", age: "Há 2 dias", next: "Perguntar como foi a visita", phone: "(96) 99789-0123", probability: 72, lastMessage: "Gostamos bastante da estrutura." },
  { id: 8, student: "Miguel Fernandes", guardian: "Marcelo Fernandes", grade: "8º ano", shift: "Tarde", stage: "Pós-visita", tag: "Em negociação", age: "Hoje", next: "Tirar dúvida sobre valores", phone: "(96) 99890-1234", probability: 61, lastMessage: "Pode explicar as formas de pagamento?" },
  { id: 9, student: "Davi Carvalho", guardian: "Luciana Carvalho", grade: "3º ano", shift: "Manhã", stage: "Matriculado", tag: "Matrícula confirmada", age: "Concluído", next: "Documentação conferida", phone: "(96) 99901-2345", probability: 100, lastMessage: "Documentos enviados. Obrigada!" },
];
const stages: { name: Stage; color: string; tint: string }[] = [
  { name: "Sem contato", color: "border-rose-300", tint: "bg-rose-50", },
  { name: "Contato realizado", color: "border-amber-300", tint: "bg-amber-50", },
  { name: "Visita agendada", color: "border-sky-300", tint: "bg-sky-50", },
  { name: "Pós-visita", color: "border-violet-300", tint: "bg-violet-50", },
  { name: "Matriculado", color: "border-emerald-300", tint: "bg-emerald-50", },
];

export default function CRMLayoutPreview() {
  const [leads, setLeads] = useState(initialLeads);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [query, setQuery] = useState("");
  const [activeNav, setActiveNav] = useState("Captação");
  const [showDemoNotice, setShowDemoNotice] = useState(true);
  const filtered = useMemo(() => leads.filter((lead) =>
    [lead.student, lead.guardian, lead.grade, lead.phone].join(" ").toLowerCase().includes(query.toLowerCase())
  ), [leads, query]);
  const moveLead = (lead: Lead, stage: Stage) => {
    setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, stage } : item));
    setSelected((current) => current?.id === lead.id ? { ...current, stage } : current);
  };
  const navItems = [
    { label: "Captação", icon: LayoutDashboard }, { label: "Atendimentos", icon: MessageCircle },
    { label: "Visitas", icon: CalendarDays }, { label: "Matrículas", icon: GraduationCap },
    { label: "Famílias", icon: Users }, { label: "Relatórios", icon: BarChart3 },
  ];
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-7">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white"><School size={22}/></div>
          <div><div className="text-sm font-extrabold tracking-tight text-slate-900">COC <span className="text-emerald-700">Macapá Norte</span></div><div className="text-[11px] text-slate-500">CRM escolar · prévia de layout</div></div>
        </div>
        <div className="hidden w-full max-w-md items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 md:flex"><Search size={16} className="text-slate-400"/><input aria-label="Buscar família" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar aluno, responsável ou telefone..." className="w-full bg-transparent text-sm outline-none"/></div>
        <div className="flex items-center gap-3"><button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Notificações"><Bell size={18}/></button><div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">S</div><div className="hidden sm:block"><div className="text-xs font-semibold">Secretaria</div><div className="text-[11px] text-slate-500">COC Macapá Norte</div></div><ChevronDown size={14}/></div></div>
      </header>
      <div className="flex">
        <aside className="hidden min-h-[calc(100vh-4rem)] w-56 shrink-0 border-r border-slate-200 bg-white p-3 lg:block">
          <div className="px-3 pb-3 pt-2 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Menu principal</div>
          {navItems.map(({label,icon:Icon})=><button key={label} onClick={()=>setActiveNav(label)} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${activeNav===label?"bg-emerald-700 text-white shadow-sm":"text-slate-600 hover:bg-slate-100"}`}><Icon size={17}/>{label}{label==="Atendimentos"&&<span className="ml-auto rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">5</span>}</button>)}
          <div className="mt-8 rounded-xl border border-emerald-100 bg-emerald-50 p-3"><div className="flex items-center gap-2 text-xs font-bold text-emerald-900"><Sparkles size={15}/> Gestão à vista</div><p className="mt-1 text-xs leading-5 text-emerald-800">Priorize famílias, visitas e retornos em um só lugar.</p></div>
          <button onClick={()=>setActiveNav("Configurações")} className="mt-4 flex items-center gap-3 px-3 py-2 text-sm text-slate-500"><Settings2 size={17}/>Configurações</button>
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-6">
          {showDemoNotice&&<div className="mb-4 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"><CircleHelp size={18} className="mt-0.5 shrink-0"/><div className="flex-1"><strong>Prévia interativa com dados fictícios.</strong> Os cartões podem ser abertos e movidos entre etapas. Nenhum dado é gravado no CRM.</div><button onClick={()=>setShowDemoNotice(false)} aria-label="Fechar aviso"><X size={16}/></button></div>}
          <div className="mb-5 flex flex-col justify-between gap-3 xl:flex-row xl:items-end">
            <div><div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700"><LayoutDashboard size={14}/> Gestão de matrículas</div><h1 className="text-2xl font-extrabold tracking-tight text-slate-950 md:text-3xl">Central de captação</h1><p className="mt-1 text-sm text-slate-500">Veja quem precisa de contato, quais visitas estão marcadas e quem está pronto para matricular.</p></div>
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">Ano letivo 2027 <ChevronDown className="ml-1 inline" size={13}/></span><button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"><Filter size={15}/> Filtros</button><button onClick={()=>alert("Na versão conectada, este botão abrirá o cadastro real de família.")} className="flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"><Plus size={16}/> Nova família</button></div>
          </div>
          <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[{label:"Famílias no funil",value:String(leads.length),note:"interessados ativos",icon:Users,tone:"text-blue-700 bg-blue-50"},{label:"Visitas agendadas",value:String(leads.filter(l=>l.stage==="Visita agendada").length),note:"próximas visitas",icon:CalendarCheck,tone:"text-sky-700 bg-sky-50"},{label:"Precisam de retorno",value:String(leads.filter(l=>l.age.includes("dia")&&l.stage!=="Matriculado").length),note:"atenção da secretaria",icon:AlertTriangle,tone:"text-rose-700 bg-rose-50"},{label:"Matrículas confirmadas",value:String(leads.filter(l=>l.stage==="Matriculado").length),note:"concluídas neste exemplo",icon:CheckCircle2,tone:"text-emerald-700 bg-emerald-50"}].map(({label,value,note,icon:Icon,tone})=><div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">{label}</span><span className={`rounded-lg p-2 ${tone}`}><Icon size={17}/></span></div><div className="mt-2 text-2xl font-extrabold text-slate-900">{value}</div><div className="mt-1 text-xs text-slate-500">{note}</div></div>)}
          </div>
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 sm:flex-row sm:items-center"><div className="flex items-center gap-2 text-sm font-bold text-rose-800"><AlertTriangle size={17}/> Atenção: famílias sem retorno</div><div className="flex-1 text-xs text-rose-700">João Pedro aguarda contato há 3 dias · Rafael Lima precisa de retorno há 2 dias.</div><button onClick={()=>setQuery("João")} className="whitespace-nowrap rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100">Ver prioritários <ArrowUpRight className="ml-1 inline" size={13}/></button></div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold text-slate-900">Funil de matrículas</h2><p className="text-xs text-slate-500">Selecione um cartão para ver a conversa e a ficha da família.</p></div><div className="flex items-center gap-2 text-xs text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-500"/> Dados demonstrativos</div></div>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {stages.map((stage)=>{const items=filtered.filter(lead=>lead.stage===stage.name);return <section key={stage.name} className="w-[260px] min-w-[260px] shrink-0 rounded-2xl border border-slate-200 bg-slate-100/80 p-2.5">
              <div className={`mb-3 flex items-center justify-between rounded-xl border-t-4 bg-white px-3 py-3 shadow-sm ${stage.color}`}><div><h3 className="text-sm font-bold text-slate-800">{stage.name}</h3><p className="mt-0.5 text-[11px] text-slate-500">{items.length} família(s)</p></div><button aria-label={`Adicionar em ${stage.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><Plus size={15}/></button></div>
              <div className="space-y-2.5">{items.map(lead=><button key={lead.id} onClick={()=>setSelected(lead)} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
                <div className="flex items-start justify-between gap-2"><div className="text-sm font-bold text-slate-900">{lead.student}</div><MoreHorizontal size={16} className="shrink-0 text-slate-400"/></div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><UserRound size={12}/>{lead.guardian}</div>
                <div className="mt-3 flex flex-wrap gap-1.5"><span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">{lead.grade}</span><span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">{lead.shift}</span></div>
                <div className="mt-3 flex items-center justify-between gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${lead.tag.includes("quente")?"bg-rose-100 text-rose-700":lead.tag.includes("confirmada")||lead.tag.includes("confirmada")||lead.tag.includes("Matrícula")?"bg-emerald-100 text-emerald-700":lead.tag.includes("pendente")||lead.tag.includes("retorno")?"bg-amber-100 text-amber-800":"bg-blue-100 text-blue-700"}`}>{lead.tag}</span><span className={`whitespace-nowrap text-[10px] font-semibold ${lead.age.includes("dia")?"text-rose-600":"text-slate-500"}`}><Clock3 className="mr-1 inline" size={11}/>{lead.age}</span></div>
                <div className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">{lead.next}</div>
              </button>)}</div>
              {!items.length&&<div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-400">Nenhuma família nesta etapa</div>}
            </section>})}
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400"><CircleHelp size={13}/> Protótipo de navegação. Não envia WhatsApp, não altera o banco e não cria agendamentos reais.</div>
        </main>
      </div>
      {selected&&<div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40" onClick={()=>setSelected(null)}>
        <aside onClick={e=>e.stopPropagation()} className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b px-5 py-4"><div><div className="text-xs font-semibold text-emerald-700">DETALHES DA FAMÍLIA</div><h2 className="mt-1 text-lg font-extrabold text-slate-900">{selected.student} · {selected.grade}</h2></div><button onClick={()=>setSelected(null)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Fechar"><X size={19}/></button></div>
          <div className="grid min-h-0 flex-1 md:grid-cols-[1.1fr_.9fr]">
            <section className="flex min-h-0 flex-col border-r border-slate-200">
              <div className="flex items-center gap-3 border-b p-4"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-800">{selected.guardian.split(" ").map(x=>x[0]).slice(0,2).join("")}</div><div className="flex-1"><div className="text-sm font-bold">{selected.guardian}</div><div className="text-xs text-slate-500">{selected.phone}</div></div><button className="rounded-lg border p-2 text-slate-500"><Phone size={16}/></button></div>
              <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4">
                <div className="mx-auto w-fit rounded-full bg-white px-3 py-1 text-[10px] text-slate-500 shadow-sm">Hoje · conversa demonstrativa</div>
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm border bg-white p-3 text-sm shadow-sm">{selected.lastMessage}<div className="mt-1 text-right text-[10px] text-slate-400">10:14</div></div>
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-emerald-100 p-3 text-sm text-emerald-950">Olá, {selected.guardian.split(" ")[0]}! 😊 Vou te ajudar com as informações para o(a) {selected.student}. Qual é a sua principal dúvida neste momento?<div className="mt-1 text-right text-[10px] text-emerald-700">10:15 · Ana (exemplo)</div></div>
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm border bg-white p-3 text-sm shadow-sm">Gostaria de saber os próximos passos e combinar uma visita.<div className="mt-1 text-right text-[10px] text-slate-400">10:16</div></div>
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-emerald-100 p-3 text-sm text-emerald-950">Claro! Vou consultar os horários livres antes de confirmar a visita.<div className="mt-1 text-right text-[10px] text-emerald-700">10:16 · Ana (exemplo)</div></div>
              </div>
              <div className="flex items-center gap-2 border-t p-3"><input disabled placeholder="Prévia: envio de mensagem desativado" className="min-w-0 flex-1 rounded-xl border bg-slate-50 px-3 py-2.5 text-sm"/><button disabled className="rounded-xl bg-emerald-700 p-3 text-white opacity-50"><Send size={16}/></button></div>
            </section>
            <section className="overflow-y-auto p-5">
              <div className="mb-4 flex gap-2 border-b pb-3"><span className="border-b-2 border-emerald-700 px-1 pb-2 text-sm font-bold text-emerald-800">Família</span><span className="px-1 pb-2 text-sm text-slate-400">Aluno</span><span className="px-1 pb-2 text-sm text-slate-400">Histórico</span></div>
              <div className="mb-5 flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600"><Users size={22}/></div><div><h3 className="font-bold text-slate-900">{selected.guardian}</h3><p className="text-xs text-slate-500">Família interessada · contato demonstrativo</p></div></div>
              <div className="space-y-4">
                <div><label className="text-xs font-semibold text-slate-500">Nome do aluno</label><div className="mt-1 rounded-lg border bg-slate-50 px-3 py-2.5 text-sm font-medium">{selected.student}</div></div>
                <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-slate-500">Série de ingresso</label><div className="mt-1 rounded-lg border px-3 py-2.5 text-sm">{selected.grade}</div></div><div><label className="text-xs font-semibold text-slate-500">Turno</label><div className="mt-1 rounded-lg border px-3 py-2.5 text-sm">{selected.shift}</div></div></div>
                <div><label className="text-xs font-semibold text-slate-500">Etapa do funil</label><select value={selected.stage} onChange={e=>moveLead(selected,e.target.value as Stage)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2.5 text-sm">{stages.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}</select><p className="mt-1 text-[11px] text-slate-400">A alteração vale apenas nesta prévia.</p></div>
                <div><label className="text-xs font-semibold text-slate-500">Próxima ação</label><div className="mt-1 flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm"><CalendarDays size={15} className="text-emerald-700"/>{selected.next}</div></div>
                <div><label className="text-xs font-semibold text-slate-500">Observações</label><textarea defaultValue={`Interesse em matrícula. Série: ${selected.grade}. Turno: ${selected.shift}. Próximo passo: ${selected.next}.`} className="mt-1 min-h-24 w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-emerald-500"/></div>
                {selected.visit&&<div className="rounded-xl border border-sky-200 bg-sky-50 p-3"><div className="flex items-center gap-2 text-sm font-bold text-sky-900"><CalendarCheck size={16}/> Visita agendada</div><div className="mt-1 text-sm text-sky-800">{selected.visit}</div></div>}
                <button onClick={()=>{setSelected(null);setActiveNav("Atendimentos");}} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800"><MessageCircle size={16}/> Voltar para o funil</button>
              </div>
            </section>
          </div>
        </aside>
      </div>}
    </div>
  );
}
