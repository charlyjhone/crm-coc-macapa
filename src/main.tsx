import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// A identidade visual é definida pelo modo de build; não depende de dados do usuário.
document.documentElement.dataset.school = import.meta.env.MODE === "conceito" ? "conceito" : "coc";

createRoot(document.getElementById("root")!).render(<App />);
