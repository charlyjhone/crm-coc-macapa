import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppSidebar } from "@/components/AppSidebar";
import { DEMO_MODE } from "@/lib/demo";
import { AdminRoute } from "@/components/AdminRoute";

const CaptacaoDashboard = lazy(() => import("./pages/CaptacaoDashboard"));
const Families = lazy(() => import("./pages/Families"));
const EnrollmentPipeline = lazy(() => import("./pages/EnrollmentPipeline"));
const SchoolVisits = lazy(() => import("./pages/SchoolVisits"));
const EnrollmentTasks = lazy(() => import("./pages/EnrollmentTasks"));
const AcquisitionAnalytics = lazy(() => import("./pages/AcquisitionAnalytics"));
const EnrollmentPossibilities = lazy(() => import("./pages/EnrollmentPossibilities"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Settings = lazy(() => import("./pages/Settings"));
const Atendimentos = lazy(() => import("./pages/Atendimentos"));
const Pendentes = lazy(() => import("./pages/Pendentes"));
const CRMLayoutPreview = lazy(() => import("./pages/CRMLayoutPreview"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const Perfil = lazy(() => import("./pages/Perfil"));
const Auditoria = lazy(() => import("./pages/Auditoria"));
const Hoje = lazy(() => import("./pages/Hoje"));
const Funil = lazy(() => import("./pages/Funil"));
const Direcao = lazy(() => import("./pages/Direcao"));

const queryClient = new QueryClient();

const ProtectedLayout = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <div className="min-h-screen bg-[#F4F6F8] md:flex">
      <AppSidebar />
      <main className="min-w-0 flex-1">
        {DEMO_MODE && (
          <div role="status" className="border-b border-[#FEDF89] bg-[#FFFAEB] px-4 py-1.5 text-center text-xs font-medium text-[#93370D]">
            Modo demonstração · famílias fictícias · nada é salvo nem enviado
          </div>
        )}
        {children}
      </main>
    </div>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-white text-sm font-medium text-slate-600">Carregando CRM...</div>}>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<ProtectedLayout><Hoje /></ProtectedLayout>} />
            <Route path="/hoje" element={<ProtectedLayout><Hoje /></ProtectedLayout>} />
            <Route path="/funil" element={<ProtectedLayout><Funil /></ProtectedLayout>} />
            <Route path="/direcao" element={<ProtectedLayout><Direcao /></ProtectedLayout>} />
            <Route path="/captacao" element={<ProtectedLayout><CaptacaoDashboard /></ProtectedLayout>} />
            <Route path="/preview-layout" element={<ProtectedRoute><CRMLayoutPreview /></ProtectedRoute>} />
            <Route path="/matriculas" element={<ProtectedLayout><EnrollmentPipeline /></ProtectedLayout>} />
            <Route path="/familias" element={<ProtectedLayout><Families /></ProtectedLayout>} />
            <Route path="/visitas" element={<ProtectedLayout><SchoolVisits /></ProtectedLayout>} />
            <Route path="/tarefas-captacao" element={<ProtectedLayout><EnrollmentTasks /></ProtectedLayout>} />
            <Route path="/origem-conversao" element={<ProtectedLayout><AcquisitionAnalytics /></ProtectedLayout>} />
            <Route path="/possibilidades" element={<ProtectedLayout><EnrollmentPossibilities /></ProtectedLayout>} />
            <Route path="/atendimentos" element={<ProtectedLayout><Atendimentos /></ProtectedLayout>} />
            <Route path="/pendentes" element={<ProtectedLayout><Pendentes /></ProtectedLayout>} />
            <Route path="/configuracoes" element={<ProtectedLayout><AdminRoute><Settings /></AdminRoute></ProtectedLayout>} />
            <Route path="/usuarios" element={<ProtectedLayout><AdminRoute><Usuarios /></AdminRoute></ProtectedLayout>} />
            <Route path="/auditoria" element={<ProtectedLayout><AdminRoute><Auditoria /></AdminRoute></ProtectedLayout>} />
            <Route path="/perfil" element={<ProtectedLayout><Perfil /></ProtectedLayout>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
