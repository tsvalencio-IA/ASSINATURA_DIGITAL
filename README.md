# Assinador Digital thIAguinho Soluções - Android APK

Versão V7 com melhorias profissionais:

- Marca `Powered by thIAguinho Soluções Digitais` somente na tela, não no PDF final.
- Correção de toque para arrastar assinatura no Android/WebView.
- Controle de tamanho do quadro da assinatura, de 70% a 180%.
- Importação de planilhas melhorada:
  - escolha da aba importada;
  - exportação da aba selecionada ou de todas as abas;
  - PDF da planilha em A4/A3 paisagem automático;
  - exportação sem corte artificial de 12 colunas;
  - quebra horizontal de páginas para planilhas largas;
  - preview com rolagem e aviso quando a planilha for grande.
- Funcionamento offline com bibliotecas locais.
- GitHub Actions configurado para gerar APK Android.

## Como gerar o APK

1. Suba todos os arquivos deste ZIP na raiz de um repositório GitHub.
2. Abra a aba **Actions**.
3. Execute o workflow **Gerar APK Android - Assinador Digital**.
4. Baixe o artifact gerado.
5. Instale o APK no celular Android.

## Observação importante sobre planilhas

Planilhas XLS/XLSX têm estilos, fórmulas, abas, larguras, mesclas e layouts que nem sempre podem ser preservados 100% dentro de um conversor HTML/JavaScript offline. Esta versão melhora o resultado profissionalmente, evita corte de colunas, permite exportar todas as abas e gera PDF paginado, mas não substitui uma renderização nativa do Excel.
