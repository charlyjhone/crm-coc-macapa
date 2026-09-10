---
name: Stats Image Auto-Response
description: Quando lead 'publicidade' pede dados de tráfego/audiência/países, Susan responde com imagem de stats em anexo
type: feature
---
Automação no `resend-inbound-webhook`: para leads `publicidade`, após análise de Media Kit (e antes do return), a função `analyzeStatsRequest` detecta pedidos por:
- audience sources / traffic sources
- country breakdown / geography
- view counts detalhados por post
- profile activity / profile visits / external link taps
- screenshot-style stats do Instagram

Quando detectado, anexa a imagem armazenada em `system_settings.stats_image_url` (bucket público `email-assets`, arquivo `instagram-stats.png`) e responde no idioma do cliente (EN/PT/ES/FR).

A imagem é baixada da URL pública e convertida para base64 antes de enviar via Resend `attachments`.
