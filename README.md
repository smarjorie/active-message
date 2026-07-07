# WABA Notifications MCP

Servidor MCP (Model Context Protocol) focado em **notificações ativas do
WhatsApp Business Account (WABA)**: templates de marketing/utility/authentication,
saúde dos números de telefone, e analytics de conversas e mensagens.

## Sobre o token de acesso

**O token NUNCA é armazenado no servidor.** Ele não vive em variável de
ambiente, banco de dados ou qualquer config da Vercel. Cada ferramenta
recebe o token como parâmetro (`access_token`) na própria chamada — você
informa ele na conversa com o Claude, e ele trafega só naquela requisição,
direto até a Graph API.

Isso significa que o deploy na Vercel contém **apenas o código do servidor**,
nada de credenciais.

> Trade-off importante: o token ainda precisa trafegar pela internet a cada
> chamada (isso é inevitável — é assim que qualquer chamada de API funciona).
> O que este design evita é ele ficar *persistido* em algum lugar do servidor.
> Se quiser zero exposição do token em texto puro nas mensagens, a alternativa
> seria implementar OAuth no servidor MCP — pode ser um próximo passo.

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

## 1. Rodar localmente (opcional, para testar antes de subir)

```bash
npm install
cp .env.example .env.local
# (opcional) edite .env.local e coloque META_WABA_ID como padrao
npm run dev
```

Teste com o MCP Inspector — o token você informa na hora de chamar cada ferramenta:

```bash
npx @modelcontextprotocol/inspector
# aponte para http://localhost:3000/api/mcp
```

## 2. Subir no GitHub

```bash
git init
git add .
git commit -m "WABA Notifications MCP server"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/waba-notifications-mcp.git
git push -u origin main
```

## 3. Deploy na Vercel

1. Acesse [vercel.com/new](https://vercel.com/new) e importe o repositório do GitHub.
2. Em **Environment Variables**, adicione (ambas opcionais, nenhuma é credencial):
   - `META_WABA_ID` = ID da sua WhatsApp Business Account, se quiser fixar um padrão
   - `META_API_VERSION` = `v23.0` (opcional)
3. Deploy.
4. Sua URL do MCP será: `https://SEU-PROJETO.vercel.app/api/mcp`

Note que **não há `META_ACCESS_TOKEN` na Vercel** — o token é informado por você, na conversa, a cada uso.

## 4. Conectar no Claude

No claude.ai: **Settings → Conectores → Adicionar conector personalizado** e
cole a URL `https://SEU-PROJETO.vercel.app/api/mcp`.

Depois disso, ao pedir para o Claude usar uma das ferramentas (ex:
`list_message_templates`), ele vai pedir (ou você pode informar direto na
mensagem) seu token de acesso com escopo `whatsapp_business_management`.

## Segurança do token

- Use um **System User Token** (via Business Settings) em vez de um token de
  usuário pessoal — não expira e não fica atrelado à sua conta pessoal.
- Escopo necessário: `whatsapp_business_management`.
- Como o token passa pela conversa, trate a conversa com o mesmo cuidado que
  trataria qualquer lugar onde credenciais aparecem em texto — evite
  compartilhar capturas de tela da conversa com o token visível.

## Erros comuns

| Erro | Causa | Solução |
|---|---|---|
| `access_token nao informado` | Ferramenta chamada sem o parâmetro `access_token` | Informe seu token na mensagem ao pedir a consulta |
| `#200 Permissions error` | Token sem escopo `whatsapp_business_management` | Gerar novo token com o escopo correto, ou dar acesso ao system user na WABA (Business Settings → WhatsApp Account Access) |
| `#100 Invalid parameter` | `waba_id` ou `phone_number_id` incorretos | Confirme os IDs no WhatsApp Manager (Business Settings → WhatsApp Accounts) |
