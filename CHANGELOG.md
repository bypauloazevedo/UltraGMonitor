# Histórico de versões

## 0.5.0 — 2026-11-05

### Novidades

- **Extrair texto de imagens:** reconhecimento offline em português, inglês e espanhol, com prévia editável. Dá pra copiar tudo ou só o trecho selecionado, sem enviar imagens pra um servidor e sem serviço pago.
- **Revisão do reconhecimento:** aviso de baixa confiança, tratamento de fundos ilustrados e uma leitura extra com contraste para revisar palavras incertas. Nomes e números reconhecidos recebem verificações antes de uma substituição.
- **Prévia ao vivo da aparência:** veja as leituras atuais do PC enquanto ajusta o widget e compare amostras das fontes antes de escolher.

### Melhorias

- Sensores mostram quando a leitura está carregando, interrompida ou desatualizada. A temperatura explica quando falta permissão, driver ou suporte do hardware.
- Reconexão dos sensores preserva a permissão de administrador quando ela já foi concedida.
- Gravação salva os blocos durante a captura. Se houver uma interrupção, mantém o arquivo parcial e identifica essa situação em Últimos prints.
- Avisos de áudio deixam claro quando o som do PC ou o microfone não está sendo gravado.
- Últimos prints carrega os arquivos sem bloquear a janela e reaproveita miniaturas já lidas.
- Widget ganhou ajustes de contraste, alertas de uso persistente e pausa das atualizações visuais quando fica escondido.
- Configurações usam gravação atômica, cópia de segurança e validação dos valores, com aviso quando não é possível salvar.

### Correções

- Configurações aguardam a tela carregar antes de aparecer, evitando a janela preta na abertura.
- Cursor de mover fica restrito à área que permite arrastar o widget, inclusive quando aparece Reiniciar sensores.
- Ferramentas da captura aparecem assim que ela abre. Copiar, salvar, fixar, extrair texto e gravar ficam disponíveis depois de selecionar a área.
- Prévia de texto libera os atalhos normais de edição e mantém o print ao voltar à captura.
- Cópia e salvamento de prints e vídeos confirmam o resultado e mostram mensagens diferentes quando só parte da operação funciona.

### Downloads

- **Windows 10/11, 64 bits:** `UltraGMonitor-Setup.exe`. Rode por cima da versão anterior para manter as configurações.
- **Ubuntu, Mint e derivados do Debian:** `UltraGMonitor-linux-amd64.deb`.
- **Outras distribuições Linux:** `UltraGMonitor-linux-x86_64.AppImage`. No Ubuntu 24.04 ou mais novo, prefira o `.deb`.

O Linux continua em beta, com limitações de atalhos no Wayland, áudio do PC e sem FPS ou Dock. Fontes desenhadas, letras pequenas ou borradas ainda podem causar erros no reconhecimento de texto; confira a prévia antes de copiar.

[Todas as mudanças desde a 0.4.0](https://github.com/bypauloazevedo/UltraGMonitor/compare/v0.4.0...v0.5.0)

## 0.4.0 — 2026-11-04

- Primeiros downloads para Linux em `.deb` e `.AppImage`.
- Janela Últimos prints com os 30 prints e vídeos mais recentes, cópia, arrastar e soltar, fixação e ações sobre os arquivos.
- Pastas de prints e vídeos configuráveis e opção de salvar automaticamente os prints copiados.
- Atalho opcional `Win+Shift+S` para abrir a captura do app no Windows.
- Opção de desligar o monitoramento e usar só captura e gravação.
- RAM do Windows corrigida para mostrar a memória física, sem somar o arquivo de paginação.

[Notas da 0.4.0](https://github.com/bypauloazevedo/UltraGMonitor/releases/tag/v0.4.0)

## 0.3.0 — 2026-11-02

- Instalação e atualização pelo winget.
- Ajustes de transparência das letras e das linhas do estilo Compacto.
- Melhorias no atalho de cópia da captura, na alça e na transparência do widget.

[Notas da 0.3.0](https://github.com/bypauloazevedo/UltraGMonitor/releases/tag/v0.3.0)

## 0.2.0 — 2026-11-01

- Aviso quando existe uma versão nova disponível.

[Notas da 0.2.0](https://github.com/bypauloazevedo/UltraGMonitor/releases/tag/v0.2.0)

## 0.1.0 — 2026-11-01

- Primeira versão pública do UltraGMonitor.

[Notas da 0.1.0](https://github.com/bypauloazevedo/UltraGMonitor/releases/tag/v0.1.0)
