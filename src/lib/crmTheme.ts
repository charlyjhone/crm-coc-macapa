// Cores do layout novo por escola. Para uma escola nova, adicione um tema aqui
// e escolha-o pelo modo do build (vite --mode <escola>).
export type CrmTheme = {
  side: string;        // fundo da barra lateral
  sideText: string;    // itens da barra
  sideLabel: string;   // rótulos pequenos da barra
  accent: string;      // botões e destaques (texto branco por cima)
  accentHover: string;
  accentSoft: string;  // fundo de aba/selo ativo
  accentSofter: string;// item selecionado em listas
  accentLine: string;  // borda da mensagem enviada
  accent2: string;     // tons para gráficos
  accent3: string;
  accentLight: string;
  chart2: string;
  warm: string;        // segunda cor da marca (selo na barra, última etapa do funil)
  warmText: string;
};

const themes: Record<string, CrmTheme> = {
  // Colégio Conceito Bilíngue — verde-azulado e laranja do logo.
  conceito: {
    side: "#0B3B3A", sideText: "#A9C7C4", sideLabel: "#7FB3AE",
    accent: "#0F766E", accentHover: "#0B615B", accentSoft: "#E6F4F1", accentSofter: "#F0F7F6", accentLine: "#CDE9E4",
    accent2: "#14857C", accent3: "#2A9D8F", accentLight: "#5EEAD4", chart2: "#14B8A6",
    warm: "#E27C26", warmText: "#1B2430",
  },
  // Build padrão (COC Macapá Norte) — verde e verde-limão da marca.
  padrao: {
    side: "#0A3D24", sideText: "#A8CDB9", sideLabel: "#7DB596",
    accent: "#007A43", accentHover: "#006236", accentSoft: "#E6F4EC", accentSofter: "#F0F8F3", accentLine: "#C6E6D3",
    accent2: "#158A52", accent3: "#2FA86A", accentLight: "#A9DDBC", chart2: "#3FB97A",
    warm: "#86B844", warmText: "#1B2430",
  },
};

export const crmTheme: CrmTheme = themes[import.meta.env.MODE] || themes.padrao;

const cssName = (key: string) => `--crm-${key.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`)}`;

export function applyCrmTheme(root: HTMLElement = document.documentElement) {
  for (const [key, value] of Object.entries(crmTheme)) root.style.setProperty(cssName(key), value);
}
