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
} from "@/lib/meta-api";

// Descricao reutilizada em toda ferramenta: o token nunca fica salvo no
// servidor (sem env var, sem banco) — ele trafega so na chamada e e usado
// na hora, direto contra a Graph API.
const ACCESS_TOKEN_DESCRIPTION =
  "Token de acesso da Meta com escopo whatsapp_business_management. Informado pelo usuario na conversa — nunca armazenado no servidor.";

const handler = createMcpHandler(
  (server) => {
    // ============================================================
    // Ferramentas de WhatsApp Business Account (WABA)
    // ============================================================

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
      "Busca analytics por template: quantidade enviada, entregue, lida e clicada para cada template de mensagem (marketing/utility/authentication), num periodo de datas. Use para validar performance real das mensagens de marketing e utility disparadas.",
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
      },
      async ({ access_token, waba_id, since, until, template_ids }) => {
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
        });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
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
  {},
  { basePath: "/api", disableSse: true }
);

export { handler as GET, handler as POST, handler as DELETE };
