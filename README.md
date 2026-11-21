# Controle da TV

App para TV Samsung (Tizen 5.5 ou mais novo, testado no Tizen 9) que limita o tempo de YouTube por dia e mantém o
launcher [Free My TV](https://github.com/JoaoPedroSilva0710/free-my-tv) como tela inicial.

## O que ele faz

- **Cota diária de YouTube:** um serviço em segundo plano (`TVStartPrb.Service`) consulta a cada 2 segundos a API
  local da TV (`http://127.0.0.1:8001/api/v2/applications/111299001912`) e soma o tempo em que o YouTube está
  visível. O limite é de **60 minutos por dia** (`LIMIT` em `startup-probe/service/quota.js`).
- **Quando o tempo acaba:** se o YouTube estiver na tela, o serviço abre o Free My TV por cima, o que esconde o
  YouTube. Reabrir o YouTube volta a ser bloqueado em poucos segundos.
- **Virada do dia:** a cota zera quando a data local muda. Se o relógio da TV voltar para um dia anterior, o serviço
  para de contar e mostra o erro, em vez de zerar a cota.
- **Ao ligar a TV:** o serviço é declarado `on-boot` e `auto-restart`. Quando a TV sai do modo de espera (ou depois de
  uma pausa longa), ele abre o Free My TV.
- **Persistência:** o tempo usado fica em `quota.json`, na pasta privada do app (`wgt-private`), e é gravado de forma
  atômica (arquivo temporário e depois `rename`). Reinstalar por cima, sem desinstalar, preserva a cota.
- **Diagnóstico:** o serviço responde em `http://127.0.0.1:8134/`, só dentro da TV, com um JSON:

  ```json
  {"started": "2026-11-12T16:30:00.000Z", "remaining": 3514, "protection": "Ativa", "error": null, "launch": "OK"}
  ```

  `remaining` é o tempo restante em segundos. `protection` pode ser `Iniciando`, `Ativa`, `Limite atingido`,
  `TV em espera` ou `Falha`. A tela do app ("Controle da TV" na lista de apps) mostra esses dados e, se o serviço não
  responder, pede à TV para iniciá-lo.

A amostragem de 2 segundos pode perder até cerca de 4 segundos a cada vez que o YouTube é aberto.

## Estrutura

```
startup-probe/            o app (empacotado como ControleTV.wgt)
  config.xml              manifesto: app TVStartPrb.Probe + serviço TVStartPrb.Service (on-boot)
  index.html              tela de status
  service/service.js      serviço: cota, abertura do Free My TV, HTTP em 127.0.0.1:8134
  service/quota.js        regra da cota (pura, testável)
tests/                    testes em Node (sem dependências)
ferramentas/              empacotar, instalar e ler o status
```

O `config.xml` libera explicitamente `http://127.0.0.1:8134` em `<access origin>`. Sem a porta na origem, a tela
recebe `TypeError: Failed to fetch`.

## Testes

```bash
node tests/startup-probe.js
node tests/control-page.js
```

## Empacotar

```bash
bash ferramentas/empacotar.sh     # gera ControleTV.wgt (sem assinatura)
```

O pacote fica sem assinatura: quem assina é o TizenBrew Installer, com o seu certificado Samsung. Os arquivos `.wgt`
não entram no Git.

## Instalar na TV

Requisitos: TV em *Developer Mode* com o IP deste computador como *Host PC IP*, e o
[TizenBrew Installer](https://github.com/reisxd/TizenBrewInstaller) configurado com os certificados Samsung
(autor e distribuidor) dessa TV. Certificados e senhas ficam só na configuração do instalador
(`~/share/tizenbrewInstallerConfig.json`) e **nunca** vão para o repositório.

1. Abra o instalador (`./TizenBrewInstaller-linux-x64`). Ele sobe a interface em
   `http://localhost:8091/ui/dist/index.html`.
2. Instale por cima da versão atual, sem desinstalar, para manter a cota salva:

   ```bash
   node ferramentas/instalar.js <IP da TV> ControleTV.wgt
   ```

   Também dá para usar a interface web: digite o IP da TV e escolha o arquivo `.wgt`.

**Atenção, dois problemas do instalador** (o `ferramentas/instalar.js` contorna os dois):

- Depois de cada instalação, ele apaga os certificados da própria configuração, que fica com `authorCert`,
  `distributorCert` e `password` em `null`. No código dele, o `case InstallFile` não tem `break` e cai em
  `DeleteConfiguration`. O script faz uma cópia antes e a devolve depois. Se usar a interface web, mantenha um backup
  desse arquivo (com permissão `600`) e restaure-o depois.
- Ele responde "conectado" antes de descobrir a versão do Tizen. Um pacote enviado logo em seguida é instalado
  **sem** ser reassinado, e a TV recusa com `install failed[118, -12], reason: Check certificate error`. O script
  espera 3 segundos antes de enviar.

A TV aceita uma conexão SDB por vez: feche o instalador antes de usar o `ler-status.py`, senão aparece
`Connection reset by peer`.

Atualizações precisam do mesmo certificado de autor. A TV recusa um pacote assinado por outro, e aí seria preciso
desinstalar, o que apaga a cota salva.

## Ler o status pelo computador

Sem Web Inspector, por um stream SDB até a porta 8134 da TV (só leitura):

```bash
python3 ferramentas/ler-status.py <IP da TV> [caminho/para/free-my-tv/tizen]
```

O script usa o cliente SDB do Free My TV (`tizen/install.py`) e também mostra se o YouTube está visível.

## Limitações conhecidas

- O botão Home do controle sempre abre a tela inicial da Samsung. A tecla é reservada ao sistema, a API de rede da
  TV não enxerga essa tela, e `tizen.application.addAppStatusChangeListener` aceitou o registro mas não entregou
  nenhum evento ao serviço (testado na versão 1.0.17, em 20/11/2026). Por isso não dá para redirecionar o Home para o
  Free My TV. O serviço só abre o Free My TV quando a TV liga.

- Não foi verificado depois de uma atualização de firmware nem de um desligamento completo da tomada.
- O limite de tempo está fixo no código. Para mudar, edite `LIMIT` em `service/quota.js`, empacote e instale de novo.
- A cota acompanha só o YouTube (`111299001912`). Outros apps de vídeo não contam.
