import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const schoolName = process.env.VITE_SCHOOL_NAME || env.VITE_SCHOOL_NAME || "COC Macapá Norte";
  const escapedSchoolName = schoolName.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]!));
  return ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), {
    name: "school-build-identity",
    transformIndexHtml: (html: string) => html.replaceAll("COC Macapá Norte", escapedSchoolName),
  }, mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  });
});
