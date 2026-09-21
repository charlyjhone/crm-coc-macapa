import { Link, useLocation } from "react-router-dom";
import { FileText, LogOut, Mail, RefreshCw, Users, LayoutDashboard, GraduationCap, ContactRound } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
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

  const handleSyncMeetings = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-granola-meetings", {
        body: { days: 14 },
      });
      if (error) throw error;
      const results: Array<{ external_id?: string; status: string; title?: string; lead_name?: string; reason?: string }> = data?.results || [];
      const synced = results.filter((r) => r.status === "matched" || r.status === "updated");
      const failedAll = results.filter((r) => r.status === "no_match" || r.status === "error");
      const skipped = results.filter((r) => r.status === "skipped");

      // Suprime reuniões já reportadas como não sincronizadas em execuções anteriores.
      const STORAGE_KEY = "granola-sync-reported-failed";
      let reported: string[] = [];
      try {
        reported = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      } catch {
        reported = [];
      }
      const reportedSet = new Set(reported);
      const failedNew = failedAll.filter((r) => r.external_id && !reportedSet.has(r.external_id));
      const failedSuppressed = failedAll.length - failedNew.length;

      // Mantém o registro só com IDs ainda presentes nesta resposta (limpa órfãos).
      const currentFailedIds = failedAll.map((r) => r.external_id).filter(Boolean) as string[];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentFailedIds));
      } catch {}

      const fmt = (r: { title?: string; lead_name?: string; reason?: string }) =>
        `• ${r.title || "(sem título)"}${r.lead_name ? ` → ${r.lead_name}` : ""}${r.reason ? ` (${r.reason})` : ""}`;

      const lines: string[] = [];
      const headerParts = [
        `${synced.length} associadas`,
        `${failedNew.length} não sincronizadas`,
      ];
      if (failedSuppressed > 0) headerParts.push(`${failedSuppressed} já reportadas antes`);
      headerParts.push(`${skipped.length} já existiam`);
      lines.push(headerParts.join(" · "));
      if (synced.length > 0) {
        lines.push("");
        lines.push("Sincronizadas:");
        lines.push(...synced.map(fmt));
      }
      if (failedNew.length > 0) {
        lines.push("");
        lines.push("Não sincronizadas:");
        lines.push(...failedNew.map(fmt));
      }

      toast({
        title: "Reuniões sincronizadas",
        description: (
          <pre className="whitespace-pre-wrap text-xs leading-relaxed max-h-80 overflow-y-auto font-sans">
            {lines.join("\n")}
          </pre>
        ),
        duration: 15000,
      });
    } catch (e: any) {
      toast({
        title: "Erro ao sincronizar",
        description: e?.message || "Falha desconhecida",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const isActive = (url: string) => {
    if (url === "/captacao") {
      return location.pathname === "/" || location.pathname === "/captacao";
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
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSyncMeetings} disabled={syncing} tooltip="Sincronizar reuniões do Granola">
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {!collapsed && <span>{syncing ? "Sincronizando..." : "Sincronizar Reuniões"}</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
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
