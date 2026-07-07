const API_VERSION = process.env.META_API_VERSION || "v23.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

/**
 * Faz uma chamada GET a Graph API. O access_token NUNCA vem de variavel de
 * ambiente/config do servidor — ele e sempre passado explicitamente pelo
 * chamador (recebido como parametro na ferramenta MCP). O servidor nao
 * armazena nem loga o token em nenhum momento.
 */
async function metaFetch(
  accessToken: string,
  path: string,
  params: Record<string, any>
) {
  if (!accessToken) {
    throw new Error(
      "access_token nao informado. Passe seu token da Meta como parametro 'access_token' na chamada da ferramenta."
    );
  }
  const url = new URL(`${BASE_URL}${path}`);
  const searchParams = new URLSearchParams({
    access_token: accessToken,
    ...Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])
    ),
  });
  url.search = searchParams.toString();

  const res = await fetch(url.toString(), { method: "GET" });
  const data = await res.json();

  if (!res.ok) {
    const err = data?.error;
    throw new Error(
      `Erro Meta API (${res.status}): ${err?.message || JSON.stringify(data)}`
    );
  }
  return data;
}

/**
 * Segue paginas seguintes (paging.next) usando fetch puro — a URL do
 * "next" ja vem com o token embutido pela propria Graph API.
 */
async function followPaging(nextUrl: string | null, results: any[]) {
  while (nextUrl) {
    const res = await fetch(nextUrl);
    const page = await res.json();
    if (!res.ok) break;
    results = results.concat(page.data || []);
    nextUrl = page.paging?.next || null;
  }
  return results;
}

// ============================================================
// WhatsApp Business Management API (WABA) — templates, saude do
// numero, e analytics de conversas/mensagens
// ============================================================

export function getDefaultWabaId(): string | undefined {
  return process.env.META_WABA_ID;
}

/**
 * Lista os templates de mensagem (marketing, utility, authentication)
 * da WABA, com status de aprovacao e quality rating.
 */
export async function listMessageTemplates(params: {
  accessToken: string;
  wabaId: string;
  limit?: number;
  category?: string; // MARKETING | UTILITY | AUTHENTICATION
  status?: string; // APPROVED | REJECTED | PENDING | PAUSED | DISABLED
}) {
  const { accessToken, wabaId, limit = 100, category, status } = params;
  const queryParams: Record<string, any> = {
    fields:
      "id,name,category,language,status,quality_score,components,rejected_reason",
    limit,
  };
  if (category) queryParams.category = category;
  if (status) queryParams.status = status;

  const data = await metaFetch(accessToken, `/${wabaId}/message_templates`, queryParams);
  const results = await followPaging(data.paging?.next || null, data.data || []);
  return results;
}

/**
 * Lista os numeros de telefone vinculados a WABA, com quality_rating,
 * messaging_limit_tier e status do nome/verificacao (saude do numero).
 */
export async function listPhoneNumberHealth(accessToken: string, wabaId: string) {
  const data = await metaFetch(accessToken, `/${wabaId}/phone_numbers`, {
    fields:
      "id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status,code_verification_status,status,throughput",
    limit: 100,
  });
  return data.data || [];
}

/**
 * Analytics de conversas: volume e custo, segmentado por categoria
 * (MARKETING, UTILITY, AUTHENTICATION, SERVICE) e por tipo (FREE_TIER, etc).
 */
export async function getConversationAnalytics(params: {
  accessToken: string;
  wabaId: string;
  start: number; // unix timestamp (seconds)
  end: number; // unix timestamp (seconds)
  granularity?: "HALF_HOUR" | "DAILY" | "MONTHLY";
}) {
  const { accessToken, wabaId, start, end, granularity = "DAILY" } = params;

  const data = await metaFetch(accessToken, `/${wabaId}`, {
    fields: `conversation_analytics.start(${start}).end(${end}).granularity(${granularity}).dimensions(["CONVERSATION_CATEGORY","CONVERSATION_TYPE","PHONE"])`,
  });
  return data.conversation_analytics || data;
}

/**
 * Analytics por template: quantas mensagens foram enviadas, entregues,
 * lidas e clicadas para cada template (ex: templates de marketing/utility).
 */
export async function getTemplateAnalytics(params: {
  accessToken: string;
  wabaId: string;
  start: number;
  end: number;
  templateIds?: string[];
  granularity?: "DAILY";
}) {
  const { accessToken, wabaId, start, end, templateIds, granularity = "DAILY" } = params;

  const fieldsParts = [
    `start(${start})`,
    `end(${end})`,
    `granularity(${granularity})`,
  ];
  if (templateIds && templateIds.length > 0) {
    fieldsParts.push(`template_ids(${JSON.stringify(templateIds)})`);
  }
  fieldsParts.push(
    `metric_types(${JSON.stringify(["SENT", "DELIVERED", "READ", "CLICKED"])})`
  );

  const data = await metaFetch(accessToken, `/${wabaId}`, {
    fields: `template_analytics.${fieldsParts.join(".")}`,
  });
  return data.template_analytics || data;
}

/**
 * Informacoes gerais da WABA: nome, timezone, namespace de templates,
 * moeda de faturamento, status de verificacao do negocio.
 */
export async function getWabaInfo(accessToken: string, wabaId: string) {
  const data = await metaFetch(accessToken, `/${wabaId}`, {
    fields:
      "id,name,timezone_id,message_template_namespace,currency,business_verification_status,account_review_status",
  });
  return data;
}

/**
 * Perfil de negocio associado a um numero de telefone: sobre, descricao,
 * endereco, email, sites, categoria (vertical) e foto de perfil.
 */
export async function getBusinessProfile(accessToken: string, phoneNumberId: string) {
  const data = await metaFetch(accessToken, `/${phoneNumberId}/whatsapp_business_profile`, {
    fields: "about,address,description,email,profile_picture_url,websites,vertical",
  });
  return data.data?.[0] || data;
}

/**
 * Detalhes completos de um template especifico (todos os componentes:
 * header, body, footer, buttons) por ID.
 */
export async function getTemplateDetails(accessToken: string, templateId: string) {
  const data = await metaFetch(accessToken, `/${templateId}`, {
    fields:
      "id,name,category,language,status,quality_score,components,rejected_reason,previous_category",
  });
  return data;
}

/**
 * Apps (integracoes/webhooks) inscritos para receber eventos da WABA.
 * Util para diagnosticar se a integracao de recebimento de status/mensagens
 * esta configurada corretamente.
 */
export async function listSubscribedApps(accessToken: string, wabaId: string) {
  const data = await metaFetch(accessToken, `/${wabaId}/subscribed_apps`, {});
  return data.data || [];
}
