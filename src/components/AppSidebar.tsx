import { Link, useLocation } from "react-router-dom";
import { Archive, TrendingUp, FileText, Layers, LogOut, Mail, Briefcase, BellDot, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { usePendingLeads } from "@/hooks/usePendingLeads";
import { Badge } from "@/components/ui/badge";
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
  { title: "Inbox", url: "/inbox", icon: Mail },
  { title: "Pendentes", url: "/pendentes", icon: BellDot, showBadge: true },
  { title: "Oportunidades", url: "/opportunities", icon: Briefcase },
  { title: "Não Classificados", url: "/unclassified", icon: Layers, adminOnly: true },
  { title: "Arquivados", url: "/archived", icon: Archive },
  { title: "Insights", url: "/insights", icon: TrendingUp, adminOnly: true },
  { title: "Usuários", url: "/usuarios", icon: Users, adminOnly: true },
  { title: "Configurações", url: "/configuracoes", icon: FileText, adminOnly: true },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { isAdmin } = useUserRole();
  const { data: pending } = usePendingLeads();
  const pendingCount = pending?.length || 0;
  const visibleItems = navItems.filter((i) => !(i as any).adminOnly || isAdmin);


  const isActive = (url: string) => {
    if (url === "/opportunities") {
      return location.pathname === "/" || location.pathname === "/opportunities";
    }
    return location.pathname.startsWith(url);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        {!collapsed ? (
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-base font-semibold tracking-tight text-sidebar-foreground">
                COC Macapá Norte
              </h1>
              <p className="text-xs text-sidebar-foreground/70 mt-0.5">CRM · Atendimento</p>
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
                const showBadge = (item as any).showBadge && pendingCount > 0;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <Link to={item.url} className="relative">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span className="flex-1">{item.title}</span>}
                        {showBadge && !collapsed && (
                          <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1.5 text-xs">
                            {pendingCount}
                          </Badge>
                        )}
                        {showBadge && collapsed && (
                          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive" />
                        )}
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
