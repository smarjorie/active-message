# Active Notifications MCP

MCP Criado para ajudar no consumo dos dados de notificação ativa, a fim de, enriquecer os insights e métricas dos clientes

## Ferramentas disponíveis

Todas recebem `access_token` como parâmetro obrigatório.

- **get_waba_info** — nome, timezone, namespace de templates, moeda, status de verificação do negócio.
- **list_message_templates** — lista templates (marketing/utility/authentication) com status
  de aprovação (APPROVED/REJECTED/PENDING/PAUSED/DISABLED) e quality rating (GREEN/YELLOW/RED).
- **get_template_details** — detalhes completos de um template específico (header, body, footer, botões).
- **get_template_analytics** — enviado/entregue/lido/clicado por template, num período.
- **get_phone_number_health** — saúde de cada número: quality_rating, messaging_limit_tier,
  status de verificação do nome.
- **get_business_profile** — perfil público (sobre, descrição, endereço, email, sites, categoria) de um número.
- **get_conversation_analytics** — volume de conversas por categoria
  (marketing/utility/authentication/service) e por número, num período.
- **list_subscribed_apps** — apps/integrações inscritos nos webhooks da WABA (diagnóstico de integração).

Só leitura — nenhuma ferramenta cria, edita, envia ou pausa nada.
