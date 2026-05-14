# Assinador Digital thIAguinho Soluções - APK Android

Sistema local/offline para assinar PDF e planilhas e gerar um novo PDF assinado.

## O que esta versão entrega

- Interface HTML profissional do assinador.
- Marca `Powered by thIAguinho Soluções Digitais` somente no rodapé da tela.
- A marca foi removida do PDF gerado.
- Geração de PDF assinado a partir de PDF, XLSX, XLS e CSV.
- Captura de assinatura por dedo/caneta/mouse, imagem ou colagem.
- Funcionamento offline.
- Estrutura de fábrica Android com Capacitor.
- Workflow do GitHub Actions para gerar APK automaticamente.
- No APK Android, o PDF é salvo no armazenamento local do app em `Documentos/Assinaturas_thIAguinho/`.

## Como gerar o APK pelo GitHub Actions

1. Crie um repositório novo no GitHub.
2. Envie todos os arquivos deste ZIP para a raiz do repositório.
3. Entre na aba **Actions**.
4. Abra o workflow **Gerar APK Android - Assinador Digital**.
5. Clique em **Run workflow**.
6. Ao terminar, baixe o artifact **ASSINADOR-DIGITAL-THIAGUINHO-APK**.
7. Dentro do artifact estará o arquivo `.apk` debug para instalar no Android.

## Estrutura principal

```txt
.github/workflows/build-android-apk.yml
capacitor.config.json
package.json
scripts/prepare-www.mjs
src/index.html
src/js/assinador-local.js
src/js/vendor/
```

## Observação importante sobre assinatura

Este sistema aplica uma assinatura gráfica/local no PDF com nome, documento, cargo, observação e data/hora.  
Ele não é uma assinatura ICP-Brasil com certificado A1/A3 e validação criptográfica oficial.

## Uso no navegador

Também é possível abrir `src/index.html` no navegador.  
No navegador comum, quando não estiver dentro do APK, o salvamento usa escolha de pasta quando o navegador permitir ou download padrão.

## Uso no APK Android

Dentro do APK, o sistema tenta salvar automaticamente o PDF em:

```txt
Documentos/Assinaturas_thIAguinho/
```

Depois de salvar, tenta abrir a tela de compartilhamento do Android para facilitar enviar o arquivo por WhatsApp, e-mail ou outro app.
