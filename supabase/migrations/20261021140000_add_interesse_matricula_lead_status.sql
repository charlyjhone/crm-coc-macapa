-- Adiciona o estado comercial de interesse sem tratar isso como matrícula concluída.
-- Migração aditiva: preserva os status históricos existentes.
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'interesse_matricula';
