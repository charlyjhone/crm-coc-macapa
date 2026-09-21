import { Link, useLocation } from "react-router-dom";
import { FileText, LogOut, Mail, Users, LayoutDashboard, GraduationCap, ContactRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "@/hooks/use-toast";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { title: "Visão da Direção", url: "/captacao", icon: LayoutDashboard },
  { title: "Funil de Matrículas", url: "/matriculas", icon: GraduationCap },
  { title: "Famílias e Alunos", url: "/familias", icon: ContactRound },
  { title: "Inbox", url: "/inbox", icon: Mail },
  { title: "Usuários", url: "/usuarios", icon: Users, adminOnly: true },
  { title: "Configurações", url: "/configuracoes", icon: FileText, adminOnly: true },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { isAdmin } = useUserRole();
  const [syncing, setSyncing] = useState(false);
  const visibleItems = navItems.filter((i) => !(i as any).adminOnly || isAdmin);



  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        {!collapsed ? (
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-base font-semibold tracking-tight text-sidebar-foreground">
                COC Macapá Norte
              </h1>
              <p className="text-xs text-sidebar-foreground/70 mt-0.5">CRM · Captação e Matrículas</p>
            </div>
            <SidebarTrigger className="mt-0.5" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <SidebarTrigger />
            <span className="text-xs font-semibold text-sidebar-primary">CN</span>
          </div>
        )}
      </SidebarHeader>
      <Separator className="bg-sidebar-border" />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <Link to={item.url} className="relative">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span className="flex-1">{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border pt-2">
        <SidebarMenu>
          {!collapsed && user?.email && (
            <SidebarMenuItem>
              <div className="px-2 py-1 text-xs text-muted-foreground truncate" title={user.email}>
                {user.email}
              </div>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => signOut()} className="text-muted-foreground hover:text-destructive">
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
