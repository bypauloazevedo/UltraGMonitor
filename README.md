# UltraGMonitor

Monitor de hardware pro Windows que fica num canto da tela ou por cima do jogo: relógio, dia, clima, FPS, CPU, GPU, RAM e SSD.

## Recursos

- **4 estilos:** Card, Compacto, Barra e Dock (encaixado na barra de tarefas do Windows)
- **Monitoramento:** uso e temperatura de CPU, GPU e SSD, VRAM, RAM, consumo em watts, atividade e velocidade do disco
- **FPS do jogo em foco**, com 1% low e frametime (via PresentMon, sem injetar nada no jogo)
- **Clima** com temperatura, chuva e máxima/mínima do dia (Open-Meteo)
- **Personalização:** 16 fontes, 10 cores de destaque, tamanho de cada parte, fundo com opacidade e fundo animado (GIF ou vídeo)
- **Overlay:** fica por cima de jogo em janela ou tela cheia sem borda, deixa o clique passar e pode ficar quase invisível com o mouse em cima
- Arrastar pra qualquer canto, em qualquer monitor, e redimensionar puxando o canto

## Instalação

Baixe o `UltraGMonitor-Setup.exe` na página [Releases](../../releases). O instalador já instala o driver PawnIO (temperatura da CPU) e configura o app pra abrir junto com o Windows.

O instalador ainda não tem assinatura digital. Se o Windows mostrar "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo**.

## Atalhos

| Atalho | Ação |
|---|---|
| `Ctrl+Shift+H` | Destravar / travar pra mover e redimensionar |
| `Ctrl+Shift+F` | Liga / desliga o FPS |
| `Ctrl+Shift+O` | Mostrar / esconder |

## Rodando a partir do código

Precisa de Node.js 20+ e do .NET SDK 8+.

```bash
npm install
npm run setup
npm start
```

Pra gerar o instalador:

```bash
npm run dist
```

O instalador sai em `dist/`.

## Como funciona

- **Electron** cuida da janela, do visual e das configurações.
- Um **ajudante em C#** (`sensor/`) lê os sensores com a LibreHardwareMonitorLib, os contadores de disco do Windows e o FPS pelo PresentMon, e manda tudo pro Electron por um named pipe.
- Temperatura da CPU, temperatura do SSD e FPS precisam de admin; o app só pede quando você liga o FPS ou marca "Pedir admin ao abrir".

## Licença

Código sob a [GNU GPL v3.0](LICENSE). Você pode usar, estudar, modificar e redistribuir, desde que versões modificadas continuem abertas sob a mesma licença e mantenham o crédito ao autor original.

Copyright (C) 2026 Paulo Azevedo

## Nome e logo

O nome **UltraGMonitor** e o logo são de Paulo Azevedo e **não** estão cobertos pela GPL. Cópias e versões modificadas precisam usar outro nome e outro logo, e não podem se apresentar como o UltraGMonitor oficial.

## Créditos

- [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) (MPL-2.0): leitura dos sensores
- [PresentMon](https://github.com/GameTechDev/PresentMon) (MIT), da Intel: medição de FPS
- [PawnIO](https://pawnio.eu/): driver de acesso ao hardware
- [Open-Meteo](https://open-meteo.com/): dados do clima
- Fontes do [Google Fonts](https://fonts.google.com/) via [Fontsource](https://fontsource.org/)
