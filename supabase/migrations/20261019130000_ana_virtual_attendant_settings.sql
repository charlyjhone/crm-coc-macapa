-- Configurações operacionais da atendente virtual Ana (COC Macapá Norte).
-- A data de divulgação foi confirmada pela escola e substitui eventual valor anterior.
INSERT INTO public.system_settings (key, value, updated_at)
VALUES ('escola_valores_data_divulgacao', '1º de novembro de 2026', now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = now();

-- Os demais campos recebem defaults somente quando ainda não existem.
INSERT INTO public.system_settings (key, value, updated_at)
VALUES
  ('escola_horario_secretaria', '7h30 às 18h', now()),
  ('escola_antecedencia_visita_min', '60', now()),
  ('escola_pesquisa_ativa', 'true', now())
ON CONFLICT (key) DO NOTHING;
