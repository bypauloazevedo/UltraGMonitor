<p align="center"><img src="assets/logo.png" width="112" alt="UltraGMonitor" /></p>

<h1 align="center">UltraGMonitor</h1>

<p align="center">
  <strong>Monitor de hardware, FPS, relógio, clima, captura de tela e gravação de vídeo num app só, pro Windows.</strong><br />
  Leve, gratuito, de código aberto e feito pra ficar num canto da tela ou por cima do jogo sem atrapalhar.
</p>

<p align="center">
  <a href="../../releases"><img alt="Baixar o instalador" src="https://img.shields.io/badge/baixar-instalador-2ee6c5?style=for-the-badge&logo=windows&logoColor=white" /></a>
</p>

<p align="center">
  <img alt="Windows 10 e 11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?logo=windows&logoColor=white" />
  <img alt="Licença GPL-3.0" src="https://img.shields.io/badge/licen%C3%A7a-GPL--3.0-blue" />
  <img alt="Electron" src="https://img.shields.io/badge/Electron-45-47848F?logo=electron&logoColor=white" />
  <img alt=".NET" src="https://img.shields.io/badge/.NET%20Framework-4.7.2-512BD4?logo=dotnet&logoColor=white" />
  <img alt="Idiomas" src="https://img.shields.io/badge/idiomas-PT%20%C2%B7%20EN%20%C2%B7%20ES-2ee6c5" />
</p>

<p align="center">
  <a href="#por-que-o-ultragmonitor-existe">Por que existe</a> ·
  <a href="#recursos">Recursos</a> ·
  <a href="#instalação">Instalação</a> ·
  <a href="#atalhos">Atalhos</a> ·
  <a href="#privacidade">Privacidade</a> ·
  <a href="#como-funciona">Como funciona</a> ·
  <a href="#rodando-a-partir-do-código">Código</a>
</p>

![UltraGMonitor nos estilos Card, Card em pé, Compacto, Lista e Barra](docs/images/hero.png)

## Por que o UltraGMonitor existe

Sou desenvolvedor e jogo no mesmo PC em que trabalho. Com o tempo, percebi que vivia abrindo um programa diferente pra cada coisa: um pra ver o FPS e saber se o jogo estava rodando liso, outro pra conferir o uso e a temperatura da CPU e da GPU, outro pra tirar um print e marcar o que importava, outro pra gravar a tela e mostrar um bug pro time. E eu ainda queria ter relógio, data e clima sempre à vista, sem precisar abrir nada.

Cada uma dessas ferramentas resolvia um pedaço do problema. Juntas, pesavam no sistema, lotavam a bandeja do Windows e nenhuma conversava com a outra.

O UltraGMonitor nasceu pra resolver isso: **um app só, leve e bonito, que reúne as necessidades do dia a dia de quem desenvolve e joga**, e que fica discreto num canto da tela até a hora em que você precisa dele. Entender como o jogo está rodando, acompanhar a saúde do PC, registrar um bug com print anotado ou vídeo: tudo no mesmo lugar, com o mesmo visual e os mesmos atalhos.

Se você também vive entre o código e o jogo, ou só quer entender de verdade como o seu PC está se comportando, ele foi feito pra você. E por ser código aberto, a comunidade pode ajudar a deixá-lo ainda melhor.

— **Paulo Azevedo**, criador do UltraGMonitor

## Destaques

- **FPS do jogo em foco**, com 1% low e frametime, medido sem injetar nada no jogo
- **CPU, GPU, RAM e SSD em tempo real**: uso, temperatura, clock, VRAM, consumo em watts e velocidade do disco
- **Relógio, data e clima** sempre à vista
- **Captura de tela com anotação**: seta, texto, desfoque, numeração e mais, no estilo das melhores ferramentas de print
- **Gravação de vídeo** de uma área da tela, com som do PC e microfone, pronta pra colar no chat
- **4 estilos** (Card, Compacto, Barra e Dock na barra de tarefas) e **3 arrumações** do Card
- **Personalização completa**: 16 fontes, 10 cores, tamanhos, transparência e fundo animado
- **Tema claro, escuro ou do sistema** e o app inteiro em **português, inglês e espanhol**
- **Sem conta, sem anúncio, sem telemetria**

## Recursos

### Monitoramento em tempo real

| | O que mostra |
|---|---|
| **CPU** | Uso, clock real (o mesmo número do Gerenciador de Tarefas), núcleo mais usado, temperatura e consumo em watts* |
| **GPU** | Uso, temperatura, VRAM usada e total, consumo em watts |
| **RAM** | Uso em porcentagem e em GB |
| **SSD / HD** | Atividade, velocidade de leitura e escrita e temperatura. Você escolhe qual disco aparece |

<sub>* Temperatura e watts da CPU precisam do driver PawnIO, que o instalador já instala.</sub>

- **Cores de alerta:** o uso fica amarelo a partir de 65% e vermelho a partir de 80%. As temperaturas têm limites próprios pra CPU, GPU e SSD.
- **Nome do hardware do seu jeito:** só "CPU" e "GPU", o nome (i7-12700F, RTX 4060 Ti) ou só o modelo (12700F, 4060 Ti).

### FPS do jogo

- FPS, **1% low** e **frametime** do jogo que está em foco, com o nome do jogo numa etiqueta em cima do quadro.
- Medido pelo [PresentMon](https://github.com/GameTechDev/PresentMon), da Intel, que lê os eventos do próprio Windows. Nada é injetado no jogo e nenhum arquivo dele é tocado.
- Sem jogo rodando, o FPS sai de cena. Quando o jogo abre, ele volta sozinho com uma transição suave.
- O número muda de cor quando o FPS cai: amarelo em 50 ou menos, vermelho em 30 ou menos.
- Liga e desliga com um atalho, sem abrir nada.

### Relógio, data e clima

- Relógio com ou sem segundos, em 24h ou AM/PM, com dia da semana e data no idioma escolhido.
- Clima da sua cidade: temperatura atual, se está chovendo, chance de chuva no dia e a máxima e a mínima. Os dados vêm do [Open-Meteo](https://open-meteo.com/), sem cadastro e sem chave.

### Quatro estilos

![Estilos Card, Compacto, Barra e Dock](docs/images/estilos.png)

- **Card:** o painel completo, com tudo em destaque.
- **Compacto:** uma lista enxuta, ótima pra deixar por cima do jogo.
- **Barra:** tudo numa linha só, pra encostar na borda da tela.
- **Dock:** encaixado na barra de tarefas do Windows. É só arrastar o widget até ela.

### Três jeitos de arrumar o Card

![Card em Grade, Lista e Em pé](docs/images/arrumacao.png)

- **Grade:** dois quadros por linha. Se sobrar um sozinho, ele ocupa a linha inteira.
- **Lista:** um item embaixo do outro, com mais espaço pros detalhes.
- **Em pé:** estreito e comprido, perfeito pra lateral do monitor.

### Captura de tela

![Captura de tela com seta, texto, retângulo, desfoque e numeração](docs/images/captura.png)

- Abre com um atalho (**Print Screen** por padrão). É só arrastar pra escolher a área e ajustar pelas bordas.
- **10 ferramentas:** lápis, linha, seta, retângulo, retângulo cheio, círculo, marcador, texto, desfoque (pra esconder senha, chave e dado pessoal) e numeração de passos.
- 5 cores e espessura ajustável, com desfazer e refazer.
- **Copiar** com `Ctrl+C`, **salvar** com `Ctrl+S` (PNG em `Imagens\UltraGMonitor`) ou **fixar na tela**, como uma janelinha que fica por cima de tudo.

### Gravação de vídeo

![Gravando uma área da tela: escolher a área, ligar o microfone, gravar, parar e colar](docs/images/gravacao.gif)

- Escolha a área e grave com o **som do PC** e o **microfone**, ligando e desligando cada um na hora.
- Uma barra flutuante mostra o tempo e deixa pausar, continuar e parar.
- O vídeo vai pra `Vídeos\UltraGMonitor` em MP4 e **já fica copiado**: é só dar `Ctrl+V` no chat, no e-mail ou na issue.

### Personalização

![O mesmo Card com cores e fontes diferentes](docs/images/cores.png)

- **16 fontes** e **10 cores de destaque**.
- Tamanho de cada parte: relógio, espessura do relógio, data, clima e números.
- **Transparência do fundo**, que dá pra ajustar também direto na barra de edição do widget, sem abrir as configurações.
- **Fundo animado** com GIF, WebP, imagem ou vídeo (no Card e no Compacto).
- Cada estilo guarda o próprio tamanho.
- Você escolhe o que aparece: relógio, data, clima, FPS, CPU, GPU, RAM e SSD.

### Feito pra ficar por cima do jogo

- Funciona por cima de jogos em janela ou em tela cheia sem borda.
- O clique atravessa o widget, então ele nunca rouba o foco do jogo.
- Opcional: fica quase invisível quando você deixa o mouse parado em cima, pra ver o que está embaixo.
- Arraste pra qualquer canto de qualquer monitor e redimensione puxando o canto.

### Configurações

<table>
  <tr>
    <td><img src="docs/images/configuracoes.png" alt="Configurações no tema escuro, aba Aparência" /></td>
    <td><img src="docs/images/configuracoes-claro.png" alt="Configurações no tema claro, aba Sistema" /></td>
  </tr>
</table>

- Organizadas em abas: **Sistema, Captura, Conteúdo, Atalhos e Aparência**.
- **Tema** escuro, claro ou o mesmo do Windows.
- **Português, inglês e espanhol.** O idioma muda o app inteiro: widget, captura, bandeja, avisos e até o nome dos arquivos salvos.
- Todos os atalhos são configuráveis, e o app avisa se outro programa já usa a tecla.

## Instalação

1. Baixe o `UltraGMonitor-Setup.exe` na página [Releases](../../releases).
2. Rode o instalador. Ele instala o app, o driver PawnIO (temperatura da CPU) e configura o UltraGMonitor pra abrir junto com o Windows.
3. Pronto: o widget aparece no canto da tela e o ícone fica na bandeja.

**Requisitos:** Windows 10 ou 11, 64 bits.

> **Aviso do Windows:** o instalador ainda não tem assinatura digital. Se o Windows mostrar "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo**. Com o Smart App Control ligado, o Windows bloqueia instaladores sem assinatura. A assinatura digital está nos planos.

### Permissão de administrador

O FPS e as temperaturas da CPU e do SSD precisam de admin. O app só pede quando você liga o FPS ou marca **Pedir admin ao abrir**, na aba Sistema. Sem admin, todo o resto funciona normalmente.

## Atalhos

Todos podem ser trocados na aba **Atalhos**.

| Atalho padrão | Ação |
|---|---|
| `Print Screen` | Abrir a captura de tela |
| sem atalho | Gravar vídeo (defina o seu, ou use o botão de vídeo na captura) |
| `Ctrl+Shift+H` | Destravar e travar o widget pra mover, redimensionar e trocar o estilo |
| `Ctrl+Shift+F` | Ligar e desligar o FPS |
| `Ctrl+Shift+O` | Mostrar e esconder o widget |

Dentro da captura:

| Tecla | Ação |
|---|---|
| `Ctrl+C` | Copiar o print |
| `Ctrl+S` | Salvar o print |
| `Ctrl+Z` / `Ctrl+Y` | Desfazer / refazer |
| `Enter` | Começar a gravar (no modo vídeo) |
| `Esc` | Cancelar |

## Privacidade

- Sem conta, sem anúncio e sem telemetria.
- A única conexão com a internet é com o Open-Meteo, pra buscar a cidade e o clima.
- Prints e vídeos ficam só no seu computador.
- As configurações ficam num arquivo local, na pasta de dados do app (`%APPDATA%\UltraGMonitor`).

## Como funciona

```mermaid
flowchart LR
    LHM["LibreHardwareMonitor<br/>e contadores do Windows"] --> Sensor
    PM["PresentMon<br/>(FPS)"] --> Sensor
    Sensor["Ajudante em C#"] -- "named pipe" --> App["Electron"]
    Meteo["Open-Meteo<br/>(clima)"] --> App
    App --> Widget["Widget"]
    App --> Captura["Captura e gravação"]
    App --> Config["Configurações"]
```

- **Electron** cuida das janelas, do visual, das configurações, da captura e da gravação.
- Um **ajudante em C#** (`sensor/`) lê os sensores com a LibreHardwareMonitorLib, os contadores de CPU e de disco do Windows, o FPS pelo PresentMon e tira o print da tela. Ele manda tudo pro Electron por um named pipe, uma linha de JSON por leitura.
- O ajudante só roda como admin quando precisa: pra ler o FPS e as temperaturas.

### Estrutura do projeto

```
src/main/        processo principal: janelas, bandeja, atalhos, captura, gravação e clima
src/preload/     ponte segura entre as telas e o processo principal
src/renderer/    as telas: widget, configurações, captura, gravação e avisos
sensor/          ajudante em C# que lê os sensores, o FPS e tira o print
scripts/         baixar dependências, compilar o ajudante, gerar ícones e o instalador
resources/       PresentMon, PawnIO e scripts do instalador
assets/          logo e ícones
```

## Rodando a partir do código

Precisa de **Node.js 20+** e do **.NET SDK 8+**.

```bash
npm install
npm run setup
npm start
```

O `npm run setup` baixa o PresentMon e o PawnIO e compila o ajudante em C#.

Pra gerar o instalador:

```bash
npm run dist
```

O instalador sai em `dist/`. Pra regenerar os ícones depois de mexer em `assets/logo.svg` ou `assets/logo-mark.svg`, rode `npm run icons`.

### Publicando uma versão

Ao criar uma tag `v*` (por exemplo, `v0.1.0`), o GitHub Actions gera o instalador e publica a versão na página de Releases.

## Contribuindo

Contribuições são muito bem-vindas.

- **Encontrou um bug ou tem uma ideia?** Abra uma [issue](../../issues) contando a versão do Windows, o modelo da CPU e da GPU e o que aconteceu.
- **Quer traduzir pra outro idioma?** Os textos ficam em `src/renderer/shared/i18n.js`. Cada idioma é um dicionário que parte do texto em português.
- **Quer mexer no código?** Faça um fork, crie um branch e abra um pull request explicando o que mudou e por quê.

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
- [Electron](https://www.electronjs.org/): base do app
- Fontes do [Google Fonts](https://fonts.google.com/) via [Fontsource](https://fontsource.org/)

---

<p align="center">Feito por <a href="https://github.com/bypauloazevedo">Paulo Azevedo</a>, pra quem vive entre o código e o jogo.</p>
