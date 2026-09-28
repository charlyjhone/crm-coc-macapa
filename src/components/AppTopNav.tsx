import { Link, useLocation } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  ContactRound,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  LogOut,
  Target,
  Settings,
  ListChecks,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NavLink = ({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}) => {
  const location = useLocation();
  const active = location.pathname === to || (to === "/captacao" && location.pathname === "/");
  return (
    <Link
      to={to}
      className={`inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-medium transition-colors ${
        active
          ? "bg-emerald-50 text-emerald-800"
          : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-800"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
};

export function AppTopNav() {
  const { user, signOut } = useAuth();
  const { isAdmin } = useUserRole();
  const location = useLocation();
  const schoolActive = ["/captacao", "/matriculas", "/familias", "/visitas", "/tarefas-captacao", "/origem-conversao", "/possibilidades", "/"].includes(location.pathname);
  const serviceActive = ["/atendimentos"].some((path) =>
    location.pathname.startsWith(path),
  );

  const initials = (user?.email || "COC")
    .split("@")[0]
    .split(/[._ -]+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-emerald-950/10 bg-background/95 shadow-[0_1px_8px_rgba(16,44,34,0.04)] backdrop-blur">
      <div className="mx-auto flex min-h-[68px] max-w-[1480px] flex-wrap items-center gap-x-5 gap-y-0 px-4 py-2 md:flex-nowrap md:px-7 md:py-0">
        <Link to="/captacao" className="flex shrink-0 items-center" aria-label="AE CRM — início">
          <img src="/brand/ae-crm-logo.svg" alt="AE CRM" className="h-10 w-auto max-w-[170px]" />
        </Link>

        <nav className="order-3 flex w-full items-center gap-1 overflow-x-auto py-2 md:order-none md:w-auto md:overflow-visible md:py-0" aria-label="Navegação principal">
          <NavLink to="/captacao" label="Início" icon={LayoutDashboard} />

          <DropdownMenu>
            <DropdownMenuTrigger
              className={`inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-medium outline-none transition-colors ${
                schoolActive ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-800"
              }`}
            >
              <GraduationCap className="h-4 w-4" />
              Captação
              <ChevronDown className="h-3 w-3 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 rounded-xl p-2">
              <DropdownMenuItem asChild className="rounded-lg p-3">
                <Link to="/matriculas" className="flex items-center gap-3">
                  <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><GraduationCap className="h-4 w-4" /></span>
                  Funil de matrículas
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="rounded-lg p-3">
                <Link to="/familias" className="flex items-center gap-3">
                  <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><ContactRound className="h-4 w-4" /></span>
                  Famílias e alunos
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="rounded-lg p-3">
                <Link to="/visitas" className="flex items-center gap-3">
                  <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><CalendarDays className="h-4 w-4" /></span>
                  Visitas escolares
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="rounded-lg p-3">
                <Link to="/tarefas-captacao" className="flex items-center gap-3">
                  <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><ListChecks className="h-4 w-4" /></span>
                  Tarefas e follow-ups
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="rounded-lg p-3">
                <Link to="/origem-conversao" className="flex items-center gap-3">
                  <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><BarChart3 className="h-4 w-4" /></span>
                  Origem e conversão
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="rounded-lg p-3">
                <Link to="/possibilidades" className="flex items-center gap-3">
                  <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><Target className="h-4 w-4" /></span>
                  Possibilidades de matrícula
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              className={`inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-medium outline-none transition-colors ${
                serviceActive ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-800"
              }`}
            >
              <Inbox className="h-4 w-4" />
              Atendimento
              <ChevronDown className="h-3 w-3 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 rounded-xl p-2">
              <DropdownMenuItem asChild className="rounded-lg"><Link to="/atendimentos"><Inbox className="mr-2 h-4 w-4" />Atendimentos da escola</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {isAdmin && <NavLink to="/usuarios" label="Equipe" icon={Users} />}
        </nav>

        <DropdownMenu>
          <DropdownMenuTrigger className="ml-auto flex shrink-0 items-center gap-2 rounded-xl p-1.5 text-left outline-none hover:bg-emerald-50">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-lime-400 text-xs font-bold text-white">
              {initials}
            </span>
            <span className="hidden max-w-36 lg:block">
              <strong className="block truncate text-xs text-slate-800">{user?.email?.split("@")[0] || "Direção"}</strong>
              <small className="block text-[11px] text-slate-600">{isAdmin ? "Administrador" : "Secretaria"}</small>
            </span>
            <ChevronDown className="hidden h-3 w-3 text-slate-500 lg:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl">
            <DropdownMenuLabel>COC Macapá Norte</DropdownMenuLabel>
            {isAdmin && <DropdownMenuItem asChild><Link to="/configuracoes"><Settings className="mr-2 h-4 w-4" />Configurações</Link></DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
