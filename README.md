# Assinador Digital thIAguinho Soluções - Android

Versão V5 com correção real para PDF no APK Android.

## O que esta versão muda

- A marca `Powered by thIAguinho Soluções Digitais` fica somente na tela.
- O PDF gerado não recebe a marca no rodapé.
- No navegador comum, a prévia pode usar PDF.js.
- No APK Android, a prévia do PDF usa o renderizador nativo do Android (`PdfRenderer`) via `NativePdfBridge`.
- O APK não depende de `pdf.worker.min.js` para importar/visualizar PDF, eliminando o erro `WorkerMessageHandler of undefined` sem remover a prévia.
- A assinatura continua podendo ser posicionada na página pela prévia visual.
- O PDF final continua sendo gerado pelo `pdf-lib` no JavaScript, preservando o arquivo original e adicionando a assinatura na posição escolhida.

## Como gerar APK no GitHub

1. Extraia este ZIP.
2. Suba todos os arquivos na raiz do repositório.
3. Abra a aba **Actions**.
4. Execute o workflow **Gerar APK Android - Assinador Digital**.
5. Baixe o artifact `ASSINADOR-DIGITAL-THIAGUINHO-APK`.

## Observação importante

Esta versão não tenta consertar o PDF.js Worker dentro do Android. Ela troca a prévia do APK por um renderizador nativo Android, mantendo a funcionalidade de prévia e posicionamento sem quebrar a importação do PDF.
