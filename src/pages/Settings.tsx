import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GeneralSettingsTab from "@/components/settings/GeneralSettingsTab";
import SchoolSettingsTab from "@/components/settings/SchoolSettingsTab";

const Settings = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Configurações</h1>
        </div>

        <Tabs defaultValue="school" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="school">Escola e Ana</TabsTrigger>
            <TabsTrigger value="general">Integrações</TabsTrigger>
          </TabsList>
          <TabsContent value="school">
            <SchoolSettingsTab />
          </TabsContent>
          <TabsContent value="general">
            <GeneralSettingsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Settings;
