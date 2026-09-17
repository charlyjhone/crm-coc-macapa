import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppTopNav } from "@/components/AppTopNav";
import Opportunities from "./pages/Opportunities";
import CaptacaoDashboard from "./pages/CaptacaoDashboard";
import Families from "./pages/Families";
import EnrollmentPipeline from "./pages/EnrollmentPipeline";
import OpportunityDetail from "./pages/OpportunityDetail";
import Unclassified from "./pages/Unclassified";
import Archived from "./pages/Archived";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Proposal from "./pages/Proposal";
import Insights from "./pages/Insights";
import Settings from "./pages/Settings";
import WorkerMode from "./pages/WorkerMode";
import InboxPage from "./pages/Inbox";
import Pendentes from "./pages/Pendentes";
import Usuarios from "./pages/Usuarios";
import { AdminRoute } from "@/components/AdminRoute";

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
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<ProtectedLayout><CaptacaoDashboard /></ProtectedLayout>} />
            <Route path="/captacao" element={<ProtectedLayout><CaptacaoDashboard /></ProtectedLayout>} />
            <Route path="/matriculas" element={<ProtectedLayout><EnrollmentPipeline /></ProtectedLayout>} />
            <Route path="/familias" element={<ProtectedLayout><Families /></ProtectedLayout>} />
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
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
