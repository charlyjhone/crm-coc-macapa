import { Button } from "@/components/ui/button";
import { Mail, Settings, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <Mail className="mx-auto h-16 w-16 mb-6 text-primary" />
        <h1 className="mb-4 text-4xl font-bold">Sistema de Captura de Leads</h1>
        <p className="text-xl text-muted-foreground mb-8">
          Capture leads automaticamente por e-mail
        </p>
        <div className="flex gap-4 justify-center">
          <Button size="lg" onClick={() => navigate("/leads")}>
            Ver Leads Capturados
          </Button>
          <Button size="lg" variant="outline" onClick={() => navigate("/configuracoes")}>
            <Settings className="mr-2 h-5 w-5" />
            Config
          </Button>
          <Button size="lg" onClick={() => navigate("/worker")}>
            <Zap className="mr-2 h-5 w-5" />
            Worker Mode
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
