import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { attendancePriority } from "@/lib/attendancePriority";
import { useDueReminders } from "@/hooks/useReminders";
import {
  BarChart3, CalendarDays, ChevronDown, CircleUserRound, ClipboardList, Columns3,
  ContactRound, Home, ListChecks, LogOut, MessageCircle, Settings, Users,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useSchoolIdentity } from "@/hooks/useSchoolIdentity";
import { useAtendimentos } from "@/hooks/useAtendimentos";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Logo da escola no topo da barra (escolhido pelo modo do build).
const schoolLogo = import.meta.env.MODE === "conceito" ? "/brand/colegio-conceito-logo.png" : "/brand/coc-macapa-norte-logo.svg";

type NavItem = { to: string; label: string; icon: typeof Home; match: string[]; badge?: number; badgeLabel?: string };

function useNavItems() {
  const { data } = useAtendimentos();
  const waiting = (data || []).filter((lead) => lead.triage_status === "aguardando_secretaria" || attendancePriority(lead).level >= 1).length;
  const { due } = useDueReminders();
  const navigate = useNavigate();
  // Aviso uma vez por dia quando há lembretes para hoje (ou atrasados).
  useEffect(() => {
    if (!due.length) return;
    const key = `crm-lembretes-avisados-${new Date().toDateString()}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch { /* sem storage */ }
    toast(`Você tem ${due.length} ${due.length === 1 ? "lembrete" : "lembretes"} para hoje`, {
      description: due.slice(0, 2).map((r) => r.leads?.name).filter(Boolean).join(", "),
      action: { label: "Ver", onClick: () => navigate("/hoje") },
      duration: 10_000,
    });
  }, [due.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const main: NavItem[] = [
    { to: "/hoje", label: "Hoje", icon: Home, match: ["/", "/hoje", "/captacao"], badge: due.length, badgeLabel: "lembretes para hoje" },
    { to: "/atendimentos", label: "Conversas", icon: MessageCircle, match: ["/atendimentos", "/pendentes"], badge: waiting },
    { to: "/funil", label: "Funil", icon: Columns3, match: ["/funil", "/matriculas"] },
    { to: "/direcao", label: "Direção", icon: BarChart3, match: ["/direcao", "/origem-conversao"] },
  ];
  const more: NavItem[] = [
    { to: "/visitas", label: "Visitas", icon: CalendarDays, match: ["/visitas"] },
    { to: "/familias", label: "Famílias e alunos", icon: ContactRound, match: ["/familias"] },
    { to: "/tarefas-captacao", label: "Tarefas", icon: ListChecks, match: ["/tarefas-captacao"] },
  ];
  return { main, more };
}

const isActive = (pathname: string, item: NavItem) => item.match.includes(pathname);

function SideLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-white/15 text-white" : "text-[var(--crm-side-text)] hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <span className="flex-1 truncate">{item.label}</span>
      {!!item.badge && (
        <span className="rounded-full bg-[var(--crm-warm)] px-2 py-0.5 text-[11px] font-semibold text-[var(--crm-warm-text)]" aria-label={`${item.badge} ${item.badgeLabel || "aguardando"}`}>
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function UserMenu({ dark }: { dark?: boolean }) {
  const { schoolName } = useSchoolIdentity();
  const { user, signOut } = useAuth();
  const { isAdmin } = useUserRole();
  const metadataName = user?.user_metadata?.full_name;
  const displayName = (typeof metadataName === "string" ? metadataName.trim() : "") || user?.email?.split("@")[0] || "Equipe";
  const initials = displayName.split(/[._ @-]+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`flex w-full items-center gap-2.5 rounded-lg p-2 text-left outline-none ${dark ? "hover:bg-white/10" : "hover:bg-slate-100"}`}
        aria-label="Menu do usuário"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--crm-chart-2)] text-xs font-semibold text-[var(--crm-side)]">{initials}</span>
        <span className={`min-w-0 flex-1 ${dark ? "" : "hidden sm:block"}`}>
          <strong className={`block truncate text-xs ${dark ? "text-white" : "text-slate-800"}`}>{displayName}</strong>
          <small className={`block text-[11px] ${dark ? "text-[var(--crm-side-text)]" : "text-slate-500"}`}>{isAdmin ? "Administrador" : "Secretaria"}</small>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 ${dark ? "text-[var(--crm-side-text)]" : "text-slate-500"}`} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={dark ? "top" : "bottom"} className="w-56 rounded-xl">
        <DropdownMenuLabel>{schoolName}</DropdownMenuLabel>
        <DropdownMenuItem asChild><Link to="/perfil"><CircleUserRound className="mr-2 h-4 w-4" />Meu perfil</Link></DropdownMenuItem>
        {isAdmin && <DropdownMenuItem asChild><Link to="/usuarios"><Users className="mr-2 h-4 w-4" />Equipe</Link></DropdownMenuItem>}
        {isAdmin && <DropdownMenuItem asChild><Link to="/configuracoes"><Settings className="mr-2 h-4 w-4" />Configurações</Link></DropdownMenuItem>}
        {isAdmin && <DropdownMenuItem asChild><Link to="/auditoria"><ClipboardList className="mr-2 h-4 w-4" />Auditoria</Link></DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()} className="text-destructive">
          <LogOut className="mr-2 h-4 w-4" />Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppSidebar() {
  const { pathname } = useLocation();
  const { schoolName } = useSchoolIdentity();
  const { main, more } = useNavItems();

  return (
    <>
      {/* Computador: barra lateral fixa */}
      <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col bg-[var(--crm-side)] px-3 py-5 md:flex" aria-label="Navegação principal">
        <Link to="/hoje" className="mb-6 flex items-center justify-center rounded-xl bg-white px-3 py-3" aria-label={`${schoolName} — início`}>
          <img src={schoolLogo} alt={schoolName} className="max-h-[112px] w-auto max-w-full object-contain" />
        </Link>
        <nav className="flex flex-col gap-1">
          {main.map((item) => <SideLink key={item.to} item={item} pathname={pathname} />)}
        </nav>
        <p className="mb-1 mt-7 px-3 text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--crm-side-label)]">Mais</p>
        <nav className="flex flex-col gap-1" aria-label="Outras telas">
          {more.map((item) => <SideLink key={item.to} item={item} pathname={pathname} />)}
        </nav>
        <div className="mt-auto border-t border-white/10 pt-3">
          <UserMenu dark />
          <img src="/brand/ae-crm-logo-inverse.svg" alt="AE CRM" className="mx-auto mt-3 h-5 w-auto opacity-60" />
        </div>
      </aside>

      {/* Celular: barra superior com abas */}
      <header className="sticky top-0 z-40 bg-[var(--crm-side)] md:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <Link to="/hoje" className="rounded-lg bg-white px-2 py-1" aria-label={`${schoolName} — início`}><img src={schoolLogo} alt={schoolName} className="h-10 w-auto" /></Link>
          <div className="w-auto"><UserMenu dark /></div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2" aria-label="Navegação principal">
          {[...main, ...more].map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to} aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium ${active ? "bg-white/15 text-white" : "text-[var(--crm-side-text)]"}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />{item.label}
                {!!item.badge && <span className="rounded-full bg-[var(--crm-warm)] px-1.5 text-[11px] font-semibold text-[var(--crm-warm-text)]">{item.badge}</span>}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
