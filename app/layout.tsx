export const metadata = {
  title: "WABA Notifications MCP",
  description: "Servidor MCP para insights de notificacoes ativas do WhatsApp Business Account",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-br">
      <body>{children}</body>
    </html>
  );
}
