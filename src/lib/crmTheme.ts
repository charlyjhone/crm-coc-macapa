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
  // Colégio Conceito Bilíngue — turquesa/verde-água e laranja do logo.
  conceito: {
    side: "#0E4F4B", sideText: "#B5DCD6", sideLabel: "#46C8B6",
    accent: "#0B8077", accentHover: "#08706A", accentSoft: "#E3F6F3", accentSofter: "#F0FAF8", accentLine: "#C4EAE4",
    accent2: "#12B9AE", accent3: "#46C8B6", accentLight: "#A6E6DC", chart2: "#46C8B6",
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

// Texto legível (branco ou escuro) sobre uma cor de fundo, pelo contraste WCAG.
export function readableText(bg: string) {
  const hex = bg.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (lum + 0.05) >= 4.5 ? "#FFFFFF" : "#1B2430";
}
