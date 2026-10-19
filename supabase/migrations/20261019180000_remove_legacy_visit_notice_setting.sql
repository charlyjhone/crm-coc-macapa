-- Remove a configuração antiga que permitia alterar livremente a antecedência da visita.
-- A nova agenda usa regra fixa de 60 minutos e disponibilidade transacional.
delete from public.system_settings
where key = 'escola_antecedencia_visita_min';
