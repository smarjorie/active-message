import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  listMessageTemplates,
  listPhoneNumberHealth,
  getConversationAnalytics,
  getTemplateAnalytics,
  getDefaultWabaId,
  getWabaInfo,
  getBusinessProfile,
  getTemplateDetails,
  listSubscribedApps,
  listAccessibleWabas,
  getMarketingMessageInsights,
  resolveTemplateAdEntity,
  findTemplatesByName,
} from "@/lib/meta-api";

const ACCESS_TOKEN_DESCRIPTION =
  "Token de acesso da Meta com escopo whatsapp_business_management. Informado pelo usuario na conversa — nunca armazenado no servidor.";

const MARKETING_INSIGHTS_ACCESS_TOKEN_DESCRIPTION =
  "Token de acesso da Meta com escopo ads_read (Marketing API / Insights API) — DIFERENTE do token whatsapp_business_management usado nas outras ferramentas. " +
  "O token precisa ter permissao de leitura sobre o ad account vinculado a WABA (o mesmo Business Manager). Informado pelo usuario na conversa — nunca armazenado no servidor.";

const SERVER_INSTRUCTIONS = `
Este servidor MCP le dados de uma WhatsApp Business Account (WABA): templates, saude dos numeros, analytics de conversas e mensagens, e (quando aplicavel) custo/cliques de mensagens de marketing.

Antes de chamar qualquer ferramenta, o usuario precisa fornecer um access_token da Meta — ele NUNCA e armazenado no servidor, viaja so na chamada.

Existem DOIS tipos de token, para coisas diferentes:
1. Token com escopo "whatsapp_business_management" — usado por quase todas as ferramentas (list_message_templates, get_waba_info, get_conversation_analytics, get_template_analytics, list_marketing_campaigns, etc).
2. Token com escopo "ads_read" (Marketing API / Insights API) — usado SO por get_marketing_message_insights, para trazer valor gasto, custo por entrega e custo por clique no botao.
Um System User token com os dois escopos marcados simplifica a vida (Business Settings > System Users > Add Assets).

Se o usuario nao sabe o waba_id: chame list_accessible_wabas primeiro (so precisa do token whatsapp_business_management).

Para valor gasto / custo por clique / cliques no botao (os dados que aparecem no WhatsApp Manager, aba "Marketing Messages"), siga 2 passos:
  Passo 1 - list_marketing_campaigns (token whatsapp_business_management): lista os templates que tem campanha de anuncio vinculada e deixa o usuario escolher um.
  Passo 2 - get_marketing_message_insights (token insights_access_token com ads_read, + whatsapp_access_token se for resolver por template_id/nome em vez de entity_id direto): retorna os numeros.

Para analytics basicos (enviado/entregue/lido/clicado, sem custo), use get_template_analytics — so precisa do token whatsapp_business_management.

Se em duvida sobre qual ferramenta usar, chame a tool como_usar para ver este guia novamente com exemplos.
`.trim();

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "como_usar",
      "Mostra um guia rapido de como usar este servidor MCP: quais tokens sao necessarios (e seus escopos), por onde comecar se voce nao sabe o waba_id, e o passo a passo para conseguir dados de custo/cliques de mensagens de marketing. Chame esta ferramenta primeiro se nao souber por onde comecar, ou sempre que tiver duvida sobre qual ferramenta usar.",
      {},
      async () => {
        return {
          content: [{ type: "text", text: SERVER_INSTRUCTIONS }],
        };
      }
    );

    server.tool(
      "list_accessible_wabas",
      "Descobre quais WhatsApp Business Accounts (WABAs) e numeros de telefone o token de acesso consegue enxergar, sem precisar informar waba_id previamente. Use esta ferramenta PRIMEIRO quando o usuario nao souber o waba_id — o resultado traz waba_id e phone_number_id de cada numero, prontos para usar nas demais ferramentas.",
      {
        access_token: z.string().describe(ACCESS_TOKEN_DESCRIPTION),
      },
      async ({ access_token }) => {
        const wabas = await listAccessibleWabas(access_token);
        return {
          content: [{ type: "text", text: JSON.stringify(wabas, null, 2) }],
        };
      }
    );

    server.tool(
      "list_message_templates",
      "Lista os templates de mensagem da WABA (marketing, utility, authentication), com status de aprovacao (APPROVED/REJECTED/PENDING/PAUSED/DISABLED) e quality rating (GREEN/YELLOW/RED). Use para validar templates de marketing e ver quais mensagens de utility estao configuradas.",
      {
        access_token: z.string().describe(ACCESS_TOKEN_DESCRIPTION),
        waba_id: z
          .string()
          .optional()
          .describe("ID da WhatsApp Business Account. Se omitido, usa META_WABA_ID configurado no ambiente."),
        category: z
          .enum(["MARKETING", "UTILITY", "AUTHENTICATION"])
          .optional()
          .describe("Filtra por categoria do template."),
        status: z
          .enum(["APPROVED", "REJECTED", "PENDING", "PAUSED", "DISABLED", "IN_APPEAL"])
          .optional()
          .describe("Filtra por status de aprovacao."),
      },
      async ({ access_token, waba_id, category, status }) => {
        const wabaId = waba_id || getDefaultWabaId();
        if (!wabaId) {
          throw new Error("Informe waba_id ou configure META_WABA_ID no ambiente.");
        }
        const templates = await listMessageTemplates({ accessToken: access_token, wabaId, category, status });
        return {
          content: [{ type: "text", text: JSON.stringify(templates, null, 2) }],
        };
      }
    );

    server.tool(
      "get_phone_number_health",
      "Retorna a saude de cada numero de telefone da WABA: quality_rating (GREEN/YELLOW/RED), messaging_limit_tier (limite diario de conversas unicas), status de verificacao do nome, e status geral do numero. Use para monitorar risco de bloqueio/downgrade de tier.",
      {
        access_token: z.string().describe(ACCESS_TOKEN_DESCRIPTION),
        waba_id: z
          .string()
          .optional()
          .describe("ID da WhatsApp Business Account. Se omitido, usa META_WABA_ID configurado no ambiente."),
      },
      async ({ access_token, waba_id }) => {
        const wabaId = waba_id || getDefaultWabaId();
        if (!wabaId) {
          throw new Error("Informe waba_id ou configure META_WABA_ID no ambiente.");
        }
        const numbers = await listPhoneNumberHealth(access_token, wabaId);
        return {
          content: [{ type: "text", text: JSON.stringify(numbers, null, 2) }],
        };
      }
    );

    server.tool(
      "get_conversation_analytics",
      "Busca analytics de conversas da WABA: volume de conversas segmentado por categoria (MARKETING, UTILITY, AUTHENTICATION, SERVICE) e por numero de telefone, num periodo de datas. Use para validar quantas mensagens de marketing/utility foram efetivamente cobradas/entregues.",
      {
        access_token: z.string().describe(ACCESS_TOKEN_DESCRIPTION),
        waba_id: z
          .string()
          .optional()
          .describe("ID da WhatsApp Business Account. Se omitido, usa META_WABA_ID configurado no ambiente."),
        since: z.string().describe("Data inicial (YYYY-MM-DD)."),
        until: z.string().describe("Data final (YYYY-MM-DD)."),
        granularity: z
          .enum(["HALF_HOUR", "DAILY", "MONTHLY"])
          .optional()
          .describe("Granularidade dos dados. Padrao: DAILY."),
      },
      async ({ access_token, waba_id, since, until, granularity }) => {
        const wabaId = waba_id || getDefaultWabaId();
        if (!wabaId) {
          throw new Error("Informe waba_id ou configure META_WABA_ID no ambiente.");
        }
        const start = Math.floor(new Date(since + "T00:00:00Z").getTime() / 1000);
        const end = Math.floor(new Date(until + "T23:59:59Z").getTime() / 1000);
        const data = await getConversationAnalytics({ accessToken: access_token, wabaId, start, end, granularity });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    server.tool(
      "get_template_analytics",
      "Busca analytics basicos por template: quantidade enviada, entregue, lida, clicada e custo (se disponivel) para cada template de mensagem (marketing/utility/authentication), num periodo de datas. Use para validar performance real das mensagens de marketing e utility disparadas. Para os mesmos dados que aparecem na aba 'Marketing Messages' do Ads Manager (valor usado, custo por mensagem entregue, custo por clique no botao, taxa de cliques), use a ferramenta get_marketing_message_insights.",
      {
        access_token: z.string().describe(ACCESS_TOKEN_DESCRIPTION),
        waba_id: z
          .string()
          .optional()
          .describe("ID da WhatsApp Business Account. Se omitido, usa META_WABA_ID configurado no ambiente."),
        since: z.string().describe("Data inicial (YYYY-MM-DD)."),
        until: z.string().describe("Data final (YYYY-MM-DD)."),
        template_ids: z
          .array(z.string())
          .optional()
          .describe("Lista de IDs de templates especificos. Se omitido, traz todos."),
        metric_types: z
          .array(z.enum(["SENT", "DELIVERED", "READ", "CLICKED", "COST"]))
          .optional()
          .describe("Metricas a retornar. Padrao: SENT, DELIVERED, READ, CLICKED, COST."),
      },
      async ({ access_token, waba_id, since, until, template_ids, metric_types }) => {
        const wabaId = waba_id || getDefaultWabaId();
        if (!wabaId) {
          throw new Error("Informe waba_id ou configure META_WABA_ID no ambiente.");
        }
        const start = Math.floor(new Date(since + "T00:00:00Z").getTime() / 1000);
        const end = Math.floor(new Date(until + "T23:59:59Z").getTime() / 1000);
        const data = await getTemplateAnalytics({
          accessToken: access_token,
          wabaId,
          start,
          end,
          templateIds: template_ids,
          metricTypes: metric_types,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );

    server.tool(
      "list_marketing_campaigns",
      "PASSO 1 do fluxo de custo/clique: lista os templates que tem um objeto de anuncio vinculado (ad_id/ad_campaign_id/ad_adset_id/ad_account_id) — ou seja, os templates enviados via Marketing Messages API for WhatsApp, que sao os unicos com dados de valor usado/custo/cliques disponiveis. Use o token whatsapp_business_management (o mesmo das outras ferramentas de template). Depois de escolher um da lista, passe o template_id dele para get_marketing_message_insights (PASSO 2).",
      {
        access_token: z.string().describe(ACCESS_TOKEN_DESCRIPTION),
        waba_id: z
          .string()
          .optional()
          .describe("ID da WhatsApp Business Account. Se omitido, usa META_WABA_ID configurado no ambiente."),
        category: z
          .enum(["MARKETING", "UTILITY", "AUTHENTICATION"])
          .optional()
          .describe("Filtra por categoria do template."),
      },
      async ({ access_token, waba_id, category }) => {
        const wabaId = waba_id || getDefaultWabaId();
        if (!wabaId) {
          throw new Error("Informe waba_id ou configure META_WABA_ID no ambiente.");
        }
        const templates = await listMessageTemplates({ accessToken: access_token, wabaId, category });
        const withCampaign = templates.filter(
          (t: any) => t.ad_campaign_id || t.ad_id || t.ad_adset_id || t.ad_account_id
        );
        if (withCampaign.length === 0) {
          return {
            content: [
              {
                type: "text",
                text:
                  "Nenhum template desta WABA tem um objeto de anuncio vinculado. Isso normalmente significa que a WABA ainda nao " +
                  "esta registrada na Marketing Messages API for WhatsApp, ou que nenhum template foi enviado por ela ainda " +
                  "(so via Cloud API tradicional). Nesse caso os dados de custo/clique do WhatsApp Manager nao estao disponiveis via API; " +
                  "use get_template_analytics para sent/delivered/read/clicked basicos.",
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                withCampaign.map((t: any) => ({
                  template_id: t.id,
                  name: t.name,
                  category: t.category,
                  status: t.status,
                  ad_campaign_id: t.ad_campaign_id,
                  ad_id: t.ad_id,
                  ad_adset_id: t.ad_adset_id,
                  ad_account_id: t.ad_account_id,
                })),
                null,
                2
              ),
            },
          ],
        };
      }
    );

    server.tool(
      "get_marketing_message_insights",
      "PASSO 2 do fluxo de custo/clique: busca os MESMOS dados de performance que aparecem no WhatsApp Manager / aba 'Marketing Messages' do Ads Manager para um template: mensagens enviadas/entregues/lidas, taxa de entrega e leitura, cliques no botao (CTA URL) e taxa de cliques, valor usado (spend), custo por mensagem entregue e custo por clique no botao. Use depois de escolher um template_id retornado por list_marketing_campaigns (ou informe template_name se souber so o nome). " +
        "Esta ferramenta usa DOIS tokens diferentes: insights_access_token (escopo ads_read, obrigatorio, busca os numeros) e whatsapp_access_token (escopo whatsapp_business_management, so obrigatorio se voce usar template_id/template_name em vez de entity_id direto, pois a ferramenta precisa consultar o template antes de resolver o anuncio).",
      {
        insights_access_token: z.string().describe(MARKETING_INSIGHTS_ACCESS_TOKEN_DESCRIPTION),
        whatsapp_access_token: z
          .string()
          .optional()
          .describe(
            ACCESS_TOKEN_DESCRIPTION +
              " Obrigatorio quando template_id ou template_name e usado (para resolver o anuncio vinculado). Pode ser omitido se voce ja informar entity_id direto."
          ),
        template_id: z
          .string()
          .optional()
          .describe("ID do template (retornado por list_marketing_campaigns ou list_message_templates). Forma mais direta de chamar esta ferramenta."),
        template_name: z
          .string()
          .optional()
          .describe(
            "Nome (ou parte do nome) do template, caso voce nao saiba o template_id. Requer waba_id (ou META_WABA_ID configurado) e whatsapp_access_token. Se mais de um template combinar com o nome, a ferramenta retorna a lista para voce escolher em vez de adivinhar."
          ),
        waba_id: z
          .string()
          .optional()
          .describe("ID da WABA, necessario apenas quando template_name e usado em vez de template_id. Se omitido, usa META_WABA_ID configurado no ambiente."),
        entity_id: z
          .string()
          .optional()
          .describe(
            "Escape hatch avancado: ID de ad_id/ad_campaign_id/ad_adset_id/ad_account_id ja conhecido (ex: vindo de list_marketing_campaigns). Quando informado, whatsapp_access_token nao e necessario."
          ),
        since: z
          .string()
          .optional()
          .describe("Data inicial (YYYY-MM-DD). Use junto com 'until' para um intervalo customizado."),
        until: z
          .string()
          .optional()
          .describe("Data final (YYYY-MM-DD). Use junto com 'since' para um intervalo customizado."),
        date_preset: z
          .enum([
            "today",
            "yesterday",
            "last_7d",
            "last_14d",
            "last_28d",
            "last_30d",
            "this_month",
            "last_month",
            "lifetime",
          ])
          .optional()
          .describe("Intervalo pre-definido. Alternativa a since/until. Se nenhum dos dois for informado, a API usa o padrao dela."),
        include_conversions: z
          .boolean()
          .optional()
          .describe(
            "Se true, inclui metricas de conversao no site (add to cart, checkout iniciado, compra e valor de compra) — exige Meta Pixel/Conversions API configurado."
          ),
        fields: z
          .array(z.string())
          .optional()
          .describe(
            "Lista de campos especificos da Insights API para sobrescrever o padrao (ex: marketing_messages_sent, marketing_messages_spend). Se omitido, usa o conjunto padrao equivalente ao print do WhatsApp Manager."
          ),
      },
      async ({
        insights_access_token,
        whatsapp_access_token,
        template_id,
        template_name,
        waba_id,
        entity_id,
        since,
        until,
        date_preset,
        include_conversions,
        fields,
      }) => {
        let resolvedEntityId = entity_id;
        let resolution: any = null;

        if (!resolvedEntityId) {
          if (!whatsapp_access_token) {
            throw new Error(
              "Para resolver por template_id/template_name, informe whatsapp_access_token (escopo whatsapp_business_management). " +
                "Alternativamente, informe entity_id direto (ad_campaign_id/ad_id/etc, ex: vindo de list_marketing_campaigns) para pular essa etapa."
            );
          }

          let effectiveTemplateId = template_id;

          if (!effectiveTemplateId && template_name) {
            const wabaId = waba_id || getDefaultWabaId();
            if (!wabaId) {
              throw new Error("Para buscar por template_name, informe waba_id ou configure META_WABA_ID no ambiente.");
            }
            const matches = await findTemplatesByName({ accessToken: whatsapp_access_token, wabaId, name: template_name });
            if (matches.length === 0) {
              throw new Error(`Nenhum template encontrado com nome contendo "${template_name}".`);
            }
            if (matches.length > 1) {
              return {
                content: [
                  {
                    type: "text",
                    text:
                      `Mais de um template combina com "${template_name}". Chame de novo com template_id de um destes:\n` +
                      JSON.stringify(
                        matches.map((m: any) => ({ id: m.id, name: m.name, category: m.category, status: m.status })),
                        null,
                        2
                      ),
                  },
                ],
              };
            }
            effectiveTemplateId = matches[0].id;
          }

          if (!effectiveTemplateId) {
            throw new Error("Informe template_id, template_name ou entity_id.");
          }

          resolution = await resolveTemplateAdEntity(whatsapp_access_token, effectiveTemplateId);
          resolvedEntityId = resolution.entity_id;
        }

        const data = await getMarketingMessageInsights({
          accessToken: insights_access_token,
          entityId: resolvedEntityId!,
          since,
          until,
          datePreset: date_preset,
          includeConversions: include_conversions,
          fields,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(resolution ? { resolved_from: resolution, insights: data } : { insights: data }, null, 2),
            },
          ],
        };
      }
    );

    server.tool(
      "get_waba_info",
      "Retorna informacoes gerais da WhatsApp Business Account: nome, timezone, namespace de templates, moeda de faturamento e status de verificacao do negocio.",
      {
        access_token: z.string().describe(ACCESS_TOKEN_DESCRIPTION),
        waba_id: z
          .string()
          .optional()
          .describe("ID da WhatsApp Business Account. Se omitido, usa META_WABA_ID configurado no ambiente."),
      },
      async ({ access_token, waba_id }) => {
        const wabaId = waba_id || getDefaultWabaId();
        if (!wabaId) {
          throw new Error("Informe waba_id ou configure META_WABA_ID no ambiente.");
        }
        const info = await getWabaInfo(access_token, wabaId);
        return {
          content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
        };
      }
    );

    server.tool(
      "get_business_profile",
      "Retorna o perfil de negocio associado a um numero de telefone: sobre, descricao, endereco, email, sites e categoria (vertical). Util para validar se as informacoes publicas do numero estao corretas.",
      {
        access_token: z.string().describe(ACCESS_TOKEN_DESCRIPTION),
        phone_number_id: z.string().describe("ID do numero de telefone (phone_number_id, nao o numero em si)."),
      },
      async ({ access_token, phone_number_id }) => {
        const profile = await getBusinessProfile(access_token, phone_number_id);
        return {
          content: [{ type: "text", text: JSON.stringify(profile, null, 2) }],
        };
      }
    );

    server.tool(
      "get_template_details",
      "Retorna os detalhes completos de um template especifico por ID: todos os componentes (header, body, footer, botoes), categoria, idioma, status e quality score. Use para validar o conteudo exato de um template de marketing ou utility.",
      {
        access_token: z.string().describe(ACCESS_TOKEN_DESCRIPTION),
        template_id: z.string().describe("ID do template de mensagem."),
      },
      async ({ access_token, template_id }) => {
        const details = await getTemplateDetails(access_token, template_id);
        return {
          content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
        };
      }
    );

    server.tool(
      "list_subscribed_apps",
      "Lista os apps/integracoes inscritos para receber webhooks (mensagens, status de entrega) da WABA. Use para diagnosticar problemas de integracao — por exemplo, se o app que deveria receber confirmacoes de leitura/entrega esta de fato inscrito.",
      {
        access_token: z.string().describe(ACCESS_TOKEN_DESCRIPTION),
        waba_id: z
          .string()
          .optional()
          .describe("ID da WhatsApp Business Account. Se omitido, usa META_WABA_ID configurado no ambiente."),
      },
      async ({ access_token, waba_id }) => {
        const wabaId = waba_id || getDefaultWabaId();
        if (!wabaId) {
          throw new Error("Informe waba_id ou configure META_WABA_ID no ambiente.");
        }
        const apps = await listSubscribedApps(access_token, wabaId);
        return {
          content: [{ type: "text", text: JSON.stringify(apps, null, 2) }],
        };
      }
    );
  },
  { instructions: SERVER_INSTRUCTIONS },
  { basePath: "/api", disableSse: true }
);

export { handler as GET, handler as POST, handler as DELETE };
