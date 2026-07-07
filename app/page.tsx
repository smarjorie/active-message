export default function Home() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: 40 }}>
      <h1>WABA Notifications MCP</h1>
      <p>
        Este e um servidor MCP (Model Context Protocol) para insights de
        notificacoes ativas do WhatsApp Business Account. O endpoint MCP
        fica em <code>/api/mcp</code>.
      </p>
      <p>
        Adicione essa URL como conector remoto no Claude (Settings →
        Conectores) ou em outro cliente MCP compativel com HTTP.
      </p>
    </main>
  );
}
