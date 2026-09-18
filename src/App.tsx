import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppTopNav } from "@/components/AppTopNav";
import { AdminRoute } from "@/components/AdminRoute";

const Opportunities = lazy(() => import("./pages/Opportunities"));
const CaptacaoDashboard = lazy(() => import("./pages/CaptacaoDashboard"));
const Families = lazy(() => import("./pages/Families"));
const EnrollmentPipeline = lazy(() => import("./pages/EnrollmentPipeline"));
const SchoolVisits = lazy(() => import("./pages/SchoolVisits"));
const EnrollmentTasks = lazy(() => import("./pages/EnrollmentTasks"));
const AcquisitionAnalytics = lazy(() => import("./pages/AcquisitionAnalytics"));
const EnrollmentPossibilities = lazy(() => import("./pages/EnrollmentPossibilities"));
const OpportunityDetail = lazy(() => import("./pages/OpportunityDetail"));
const Unclassified = lazy(() => import("./pages/Unclassified"));
const Archived = lazy(() => import("./pages/Archived"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Proposal = lazy(() => import("./pages/Proposal"));
const Insights = lazy(() => import("./pages/Insights"));
const Settings = lazy(() => import("./pages/Settings"));
const WorkerMode = lazy(() => import("./pages/WorkerMode"));
const InboxPage = lazy(() => import("./pages/Inbox"));
const Pendentes = lazy(() => import("./pages/Pendentes"));
const Usuarios = lazy(() => import("./pages/Usuarios"));

const queryClient = new QueryClient();

const ProtectedLayout = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <div className="min-h-screen bg-white">
      <AppTopNav />
      <main className="min-w-0">{children}</main>
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
            <Route path="/" element={<ProtectedLayout><CaptacaoDashboard /></ProtectedLayout>} />
            <Route path="/captacao" element={<ProtectedLayout><CaptacaoDashboard /></ProtectedLayout>} />
            <Route path="/matriculas" element={<ProtectedLayout><EnrollmentPipeline /></ProtectedLayout>} />
            <Route path="/familias" element={<ProtectedLayout><Families /></ProtectedLayout>} />
            <Route path="/visitas" element={<ProtectedLayout><SchoolVisits /></ProtectedLayout>} />
            <Route path="/tarefas-captacao" element={<ProtectedLayout><EnrollmentTasks /></ProtectedLayout>} />
            <Route path="/origem-conversao" element={<ProtectedLayout><AcquisitionAnalytics /></ProtectedLayout>} />
            <Route path="/possibilidades" element={<ProtectedLayout><EnrollmentPossibilities /></ProtectedLayout>} />
            <Route path="/opportunities" element={<ProtectedLayout><Opportunities /></ProtectedLayout>} />
            <Route path="/opportunity/:id" element={<ProtectedLayout><OpportunityDetail /></ProtectedLayout>} />
            <Route path="/inbox" element={<ProtectedLayout><InboxPage /></ProtectedLayout>} />
            <Route path="/pendentes" element={<ProtectedLayout><Pendentes /></ProtectedLayout>} />
            <Route path="/unclassified" element={<ProtectedLayout><AdminRoute><Unclassified /></AdminRoute></ProtectedLayout>} />
            <Route path="/archived" element={<ProtectedLayout><Archived /></ProtectedLayout>} />
            <Route path="/proposal" element={<ProtectedRoute><Proposal /></ProtectedRoute>} />
            <Route path="/insights" element={<ProtectedLayout><AdminRoute><Insights /></AdminRoute></ProtectedLayout>} />
            <Route path="/configuracoes" element={<ProtectedLayout><AdminRoute><Settings /></AdminRoute></ProtectedLayout>} />
            <Route path="/usuarios" element={<ProtectedLayout><AdminRoute><Usuarios /></AdminRoute></ProtectedLayout>} />
            <Route path="/worker" element={<ProtectedLayout><AdminRoute><WorkerMode /></AdminRoute></ProtectedLayout>} />
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
