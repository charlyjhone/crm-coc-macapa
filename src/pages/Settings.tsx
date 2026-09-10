import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PromptsTab from "@/components/settings/PromptsTab";
import GeneralSettingsTab from "@/components/settings/GeneralSettingsTab";

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

        <Tabs defaultValue="prompts" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="prompts">Prompts</TabsTrigger>
            <TabsTrigger value="general">Outras Configurações</TabsTrigger>
          </TabsList>
          <TabsContent value="prompts">
            <PromptsTab />
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
