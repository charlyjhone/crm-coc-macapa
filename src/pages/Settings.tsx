import { Button } from "@/components/ui/button";
import { ArrowLeft, Bot, Building2, Plug } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SchoolSettingsTab from "@/components/settings/SchoolSettingsTab";
import GeneralSettingsTab from "@/components/settings/GeneralSettingsTab";
import VirtualAttendantSettingsTab from "@/components/settings/VirtualAttendantSettingsTab";

const Settings = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Configurações</h1>
            <p className="text-sm text-muted-foreground">Gerencie a escola, as integrações e o comportamento da atendente virtual.</p>
          </div>
        </div>

        <Tabs defaultValue="atendente" className="space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-3">
            <TabsTrigger value="atendente" className="gap-2 py-2.5"><Bot className="h-4 w-4" />Atendente Virtual</TabsTrigger>
            <TabsTrigger value="escola" className="gap-2 py-2.5"><Building2 className="h-4 w-4" />Escola</TabsTrigger>
            <TabsTrigger value="integracoes" className="gap-2 py-2.5"><Plug className="h-4 w-4" />Integrações</TabsTrigger>
          </TabsList>
          <TabsContent value="atendente"><VirtualAttendantSettingsTab /></TabsContent>
          <TabsContent value="escola"><SchoolSettingsTab /></TabsContent>
          <TabsContent value="integracoes"><GeneralSettingsTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Settings;
