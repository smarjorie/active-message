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

/**
 * Descobre as WABAs (e respectivos numeros de telefone) acessiveis pelo
 * token, sem precisar que o usuario ja saiba o waba_id de antemao.
 * Percorre /me/businesses -> owned_whatsapp_business_accounts e
 * client_whatsapp_business_accounts -> phone_numbers de cada WABA.
 */
export async function listAccessibleWabas(accessToken: string) {
  const businesses = await metaFetch(accessToken, "/me/businesses", {
    fields: "id,name",
    limit: 100,
  });

  const results: any[] = [];

  for (const biz of businesses.data || []) {
    const wabaLists = await Promise.all([
      metaFetch(accessToken, `/${biz.id}/owned_whatsapp_business_accounts`, {
        fields: "id,name",
        limit: 100,
      }).catch(() => ({ data: [] })),
      metaFetch(accessToken, `/${biz.id}/client_whatsapp_business_accounts`, {
        fields: "id,name",
        limit: 100,
      }).catch(() => ({ data: [] })),
    ]);

    const wabas = [
      ...(wabaLists[0].data || []).map((w: any) => ({ ...w, relationship: "owned" })),
      ...(wabaLists[1].data || []).map((w: any) => ({ ...w, relationship: "client" })),
    ];

    for (const waba of wabas) {
      let phoneNumbers: any[] = [];
      try {
        const phones = await metaFetch(accessToken, `/${waba.id}/phone_numbers`, {
          fields: "id,display_phone_number,verified_name,quality_rating,messaging_limit_tier",
          limit: 100,
        });
        phoneNumbers = phones.data || [];
      } catch {
        // sem acesso aos numeros dessa WABA especifica; segue sem eles
      }

      results.push({
        business_id: biz.id,
        business_name: biz.name,
        waba_id: waba.id,
        waba_name: waba.name,
        relationship: waba.relationship,
        phone_numbers: phoneNumbers,
      });
    }
  }

  return results;
}

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
      "id,name,category,language,status,quality_score,components,rejected_reason,ad_id,ad_account_id,ad_campaign_id,ad_adset_id",
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
  start: number;
  end: number;
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
  metricTypes?: Array<"SENT" | "DELIVERED" | "READ" | "CLICKED" | "COST">;
}) {
  const {
    accessToken,
    wabaId,
    start,
    end,
    templateIds,
    granularity = "DAILY",
    metricTypes = ["SENT", "DELIVERED", "READ", "CLICKED", "COST"],
  } = params;

  const fieldsParts = [
    `start(${start})`,
    `end(${end})`,
    `granularity(${granularity})`,
  ];
  if (templateIds && templateIds.length > 0) {
    fieldsParts.push(`template_ids(${JSON.stringify(templateIds)})`);
  }
  fieldsParts.push(`metric_types(${JSON.stringify(metricTypes)})`);

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
      "id,name,category,language,status,quality_score,components,rejected_reason,previous_category,ad_id,ad_account_id,ad_campaign_id,ad_adset_id",
  });
  return data;
}

/**
 * Metricas da Marketing Messages API for WhatsApp: mensagens enviadas,
 * entregues, lidas, cliques no botao (CTA URL), taxas, e metricas de custo
 * (valor gasto, custo por entrega, custo por clique no botao).
 *
 * Corresponde exatamente ao que aparece no WhatsApp Manager / aba
 * "Marketing Messages" do Ads Manager para um template. O entity_id deve
 * ser o ad_id, ad_campaign_id, ad_adset_id ou ad_account_id retornado por
 * listMessageTemplates/getTemplateDetails (campos ad_id/ad_campaign_id/etc) —
 * so existe depois que o template foi enviado pela Marketing Messages API
 * for WhatsApp (nao pela Cloud API tradicional).
 */
const DEFAULT_MARKETING_INSIGHTS_FIELDS = [
  "marketing_messages_sent",
  "marketing_messages_delivered",
  "marketing_messages_read",
  "marketing_messages_delivery_rate",
  "marketing_messages_read_rate",
  "marketing_messages_link_btn_click",
  "marketing_messages_link_btn_click_rate",
  "marketing_messages_spend",
  "marketing_messages_cost_per_delivered",
  "marketing_messages_cost_per_link_btn_click",
];

/**
 * Resolve automaticamente o objeto de anuncio (ad_campaign_id de preferencia,
 * com fallback para ad_adset_id/ad_id/ad_account_id) vinculado a um template,
 * para que quem chama a ferramenta nao precise saber/colar nenhum ID de
 * campanha manualmente — so o ID (ou nome) do template.
 */
export async function resolveTemplateAdEntity(accessToken: string, templateId: string) {
  const details = await getTemplateDetails(accessToken, templateId);

  const entityId = details.ad_campaign_id || details.ad_id || details.ad_adset_id || details.ad_account_id;
  const resolvedFrom = details.ad_campaign_id
    ? "ad_campaign_id"
    : details.ad_id
    ? "ad_id"
    : details.ad_adset_id
    ? "ad_adset_id"
    : details.ad_account_id
    ? "ad_account_id"
    : null;

  if (!entityId) {
    throw new Error(
      `O template "${details.name || templateId}" nao tem nenhum objeto de anuncio vinculado (ad_id/ad_campaign_id/ad_adset_id/ad_account_id). ` +
        `Isso normalmente significa que ele nao foi enviado via Marketing Messages API for WhatsApp (so via Cloud API tradicional), ` +
        `ou que a WABA ainda nao esta registrada na Marketing Messages API for WhatsApp — nesse caso use get_template_analytics em vez desta ferramenta.`
    );
  }

  return {
    template_id: details.id,
    template_name: details.name,
    entity_id: entityId,
    resolved_from: resolvedFrom,
    ad_id: details.ad_id,
    ad_campaign_id: details.ad_campaign_id,
    ad_adset_id: details.ad_adset_id,
    ad_account_id: details.ad_account_id,
  };
}

/**
 * Encontra o(s) template_id(s) de um template pelo nome (a Graph API nao
 * tem filtro server-side por nome nesse endpoint, entao filtramos aqui).
 */
export async function findTemplatesByName(params: {
  accessToken: string;
  wabaId: string;
  name: string;
}) {
  const { accessToken, wabaId, name } = params;
  const all = await listMessageTemplates({ accessToken, wabaId, limit: 250 });
  const needle = name.trim().toLowerCase();
  return all.filter((t: any) => (t.name || "").toLowerCase().includes(needle));
}

export async function getMarketingMessageInsights(params: {
  accessToken: string;
  entityId: string;
  since?: string;
  until?: string;
  datePreset?: string;
  fields?: string[];
  includeConversions?: boolean;
}) {
  const {
    accessToken,
    entityId,
    since,
    until,
    datePreset,
    fields,
    includeConversions = false,
  } = params;

  let selectedFields = fields && fields.length > 0 ? fields : DEFAULT_MARKETING_INSIGHTS_FIELDS;
  if (includeConversions) {
    selectedFields = [
      ...selectedFields,
      "marketing_messages_website_add_to_cart",
      "marketing_messages_website_initiate_checkout",
      "marketing_messages_website_purchase",
      "marketing_messages_website_purchase_values",
    ];
  }

  const queryParams: Record<string, any> = {
    fields: selectedFields.join(","),
  };
  if (since && until) {
    queryParams.time_range = JSON.stringify({ since, until });
  } else if (datePreset) {
    queryParams.date_preset = datePreset;
  }

  const data = await metaFetch(accessToken, `/${entityId}/insights`, queryParams);
  return data.data || data;
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
