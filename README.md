# MCHOSE V9 Pro — Silenciar os avisos de voz (PT-BR)

Silencie os avisos de voz do headset **MCHOSE V9 Pro** (e irmãos com chip **C-Media CM2025**).

O V9 Pro fala um aviso toda vez que você alterna o mute do microfone e, enquanto fala, **emudece o áudio por 1–2 segundos**. No firmware chinês o aviso é em chinês; no internacional, em inglês. Não existe opção para desligar, nem o app oficial desliga.

Este repositório permite **silenciar avisos específicos (por padrão, mic on/off)** aplicando patch no firmware e regravando via **dongle 2.4G, direto do navegador**. Todo o resto permanece idêntico — incluindo o aviso de bateria fraca.

Baseado em [`Ashbborn/Be-Quiet-MCHOSE`](https://github.com/Ashbborn/Be-Quiet-MCHOSE) (MIT). Formato, “criptografia” e protocolo de gravação estão detalhados em [DECRYPTION.md](DECRYPTION.md) (em inglês).

## O que dá / não dá para fazer

| Recurso | Status |
|---|---|
| Silenciar um aviso | Sim. O clip escolhido passa a tocar ruído de conforto (quase silêncio). |
| Colocar sua própria voz | Não. O áudio usa codec proprietário C-Media sem encoder público. Só dá para trocar de idioma flasheando o firmware inglês oficial da MCHOSE. |
| Remover o gap de ~1,5 s de mute | Não. É comportamento do firmware. Você passa a ter um gap curto e silencioso em vez de voz. |

Testado e confirmado em um V9 Pro real. O chip aceita imagem remontada (sem checagem de assinatura) e **reflashear o firmware stock reverte 100%**.

## Compatibilidade: Windows / Linux / Mac

| Etapa | Windows | Linux | macOS |
|---|---|---|---|
| `build_firmware.py` (listar + gerar `.bin`) | Sim | Sim | Sim |
| `flasher.html` (gravar no headset) | **Sim — OBRIGATÓRIO** | Não | Não |

Motivo: o `flasher.html` usa **WebHID**, que o Firefox não suporta, e o projeto exige **Windows + Chrome ou Edge**. O flash **exige o dongle USB 2.4G** — Bluetooth não serve.

Fluxo se você usa Linux/Mac: gere os `.bin` no seu SO e flasheie em um Windows.

## Requisitos

- Dongle USB 2.4G do headset (o que veio na caixa).
- Windows com **Chrome ou Edge** atualizados (só para o flash).
- **Python 3** (qualquer SO, só stdlib: `os, sys, struct, zlib`).
- Headset com bateria carregada (>50%, ideal 100%).
- Firmware stock baixado (seção 1 — é sua imagem de recuperação).

## 0. Segurança — leia antes de tocar em qualquer coisa

1. **Sem o firmware stock em mãos, não comece.** Ele é sua única volta garantida ao original.
2. Guarde **2 cópias** do stock em locais diferentes + anote o **SHA256**.
3. **Nunca commite `.bin` neste repo** — o `.gitignore` já bloqueia `*.bin`.
4. Ordem de flash **obrigatória**: primeiro `_noop.bin`, depois `_silenced.bin`.
5. Durante o flash: aba do navegador **sempre em primeiro plano**, headset perto do PC, dongle firme, sem economizar bateria.
6. Flash parcial/falho é **descartado pelo headset** (ele volta ao stock) — basta reflashear limpo.
7. Você modifica firmware por sua conta e risco. Funciona e é reversível, mas nenhuma unidade ou revisão futura de firmware é garantida idêntica.

## 1. Instalação do zero

### 1.1 Windows

```powershell
# Python (Microsoft Store ou python.org) — confirme:
python --version

# Chrome ou Edge atualizado — confirme WebHID abrindo:
# chrome://settings/content/hid
# Deve existir a permissão de dispositivos HID.

# Git (opcional, só para clonar):
git --version
```

### 1.2 Linux (Debian/Ubuntu)

```bash
python3 --version
# Chrome ou Chromium só para gerar .bin (o flash será no Windows)
git --version
```

### 1.3 macOS

```bash
python3 --version
git --version
# Navegador: Chrome ou Edge atualizados (só para gerar; o flash será no Windows)
```

### 1.4 Clonar este repositório

```bash
git clone https://github.com/romeci/mchose-v9-pro.git
cd mchose-v9-pro
```

Sem git: baixe o ZIP na página do repo e extraia.

## 2. Backup do firmware original (etapa mais importante)

1. Abra o config OTA oficial e localize a entrada `headset` com `type` `1` (firmware inglês):
   - config: `https://cdn.mchose.com.cn/OTA/PC/prod/otaFile/otaConfig_prod.json`
   - arquivo: `https://cdn.mchose.com.cn/OTA/PC/prod/otaFile/V9Pro/headset/<fileName>.bin`
2. Baixe o `.bin` e **renomeie para algo versionado**, ex.: `V9Pro_headset_EN_original.bin`.
3. Faça **2 cópias** (ex.: pasta do projeto + backup externo) e registre tamanho + hash:

Windows:
```powershell
Get-FileHash .\V9Pro_headset_EN_original.bin -Algorithm SHA256
```

Linux/macOS:
```bash
sha256sum V9Pro_headset_EN_original.bin
```

4. Anote em um `backup.txt` local (NÃO commitar): nome do arquivo, data, URL de origem, SHA256, tamanho em bytes.
5. Validação do backup: o arquivo deve começar com o magic `AOTA`. Teste rápido:

```bash
python build_firmware.py V9Pro_headset_EN_original.bin
```

Sucesso = lista `matched EN clip table (18 clips)` com `clip 8 <- mic on` e `clip 9 <- mic off`. Se der erro, o download está truncado ou é outro firmware — baixe de novo e compare o tamanho.

> Firmware é da MCHOSE e **não é redistribuído aqui** por licença. Guarde o seu.

## 3. Listar os clips (inspeção, sem alterar nada)

```bash
python build_firmware.py V9Pro_headset_EN_original.bin
```

Saída esperada (firmware EN confirmado):

```text
matched EN clip table (18 clips)
  clip  8  ...  <- mic on
  clip  9  ...  <- mic off
run again with clip indices to silence, e.g.: python build_firmware.py V9Pro_headset_EN_original.bin 8 9
```

Se aparecer `could not match a known clip table`, **pare**: seu firmware é outra versão/produto. Mapeie por bisseção (ver [docs/clip-map.md](docs/clip-map.md)) antes de qualquer flash.

## 4. Gerar as imagens (noop + silenciada)

```bash
python build_firmware.py V9Pro_headset_EN_original.bin 8 9
```

Gera dois arquivos ao lado do original:

| Arquivo | Conteúdo |
|---|---|
| `V9Pro_headset_EN_original_noop.bin` | Remontado sem alterações — deve ser **byte-idêntico ao stock**. Serve para validar o caminho de flash. |
| `V9Pro_headset_EN_original_silenced.bin` | O real: só os clips 8 e 9 + CRCs mudam. |

### 4.1 Validação obrigatória — noop deve ser idêntico ao stock

Windows:
```powershell
fc /b V9Pro_headset_EN_original.bin V9Pro_headset_EN_original_noop.bin
```

Linux/macOS:
```bash
cmp V9Pro_headset_EN_original.bin V9Pro_headset_EN_original_noop.bin && echo IDENTICOS
sha256sum V9Pro_headset_EN_original*.bin
```

- `fc`/`cmp` sem diferença = OK, prossiga.
- **Qualquer diferença = PARE.** Não flasheie. Rebaixe Python/arquivo e repita. Só o `_silenced.bin` pode diferir do stock.

## 5. Flash (somente Windows + Chrome/Edge)

Pré-checklist:

- [ ] Headset com bateria alta, ligado, **perto do PC**.
- [ ] Dongle 2.4G plugado direto no PC (evite hub).
- [ ] Fechado app/OTA da MCHOSE que possa disputar o dongle.
- [ ] `_noop.bin` validado como idêntico ao stock (seção 4.1).
- [ ] Aba do navegador ficará **em primeiro plano o tempo todo**.

Passos:

1. Abra `flasher.html` (duplo clique ou `File > Open`) no **Chrome ou Edge**.
2. Clique **Connect (MCHOSE V9 Pro dongle)** e selecione o dongle (VID `0x291D` / PID `0x385D`).
3. Selecione o arquivo `..._noop.bin` e clique **FLASH (headset)**.
4. Aguarde o sucesso (`[01 01 00]` / mensagem de êxito no log). **Não troque de aba — aba em segundo plano sofre throttle e o headset aborta após ~10 s.**
5. Repita o passo 3–4 com o arquivo `..._silenced.bin`.
6. Desligue/ligue o headset.

Botões de diagnóstico na página (`Diag` / verbose) servem para capturar o log em caso de erro — copie o log antes de fechar.

## 6. Teste e validação (checklist de 100%)

| # | Teste | Esperado |
|---|---|---|
| 1 | Apertar botão mute do mic (on) | **Sem voz**, gap curto silencioso |
| 2 | Apertar de novo (off) | **Sem voz**, gap curto silencioso |
| 3 | Ligar/desligar o headset | Voz normal de power on/off |
| 4 | Bateria fraca (se reproduzível) | Aviso de bateria **preservado** |
| 5 | Ouvir música/podcast contínuo | Sem cortes além do gap do mute |
| 6 | Reconectar dongle / sleep / reboot do PC | Headset reconecta normal |

Tudo passou = concluído. Se 1–2 ainda falam, os índices mudaram no seu firmware — volte ao stock (seção 7) e mapeie por bisseção.

## 7. Restauração exata do estado original (qualquer falha ou arrependimento)

Caminho A (recomendado) — reflash do seu backup:

1. No `flasher.html`, selecione seu `V9Pro_headset_EN_original.bin` (o stock guardado na seção 2).
2. FLASH com a aba em primeiro plano.
3. Teste a seção 6: os avisos de mic **voltam a falar** = original restaurado.

Caminho B — OTA oficial da MCHOSE: rode o atualizador oficial; ele sobrescreve com firmware de fábrica.

Caminho C — flash interrompido/parcial: o headset **descarta** e boota o stock. Apenas reflasheie limpo (noop primeiro).

Sem o `.bin` stock você perde a volta garantida — por isso a seção 2 vem antes de tudo.

## 8. Erros comuns e solução

| Erro / sintoma | Causa provável | Solução |
|---|---|---|
| `not an AOTA firmware image` | Arquivo errado ou download truncado | Baixar de novo, comparar tamanho, conferir magic `AOTA` |
| `tone.bin did not decrypt to an sdfs bank` | Firmware inesperado | Não forçar; validar origem do `.bin` |
| `could not match a known clip table` | Firmware novo ou outro modelo | Mapear por bisseção (`docs/clip-map.md`) |
| `clip N does not start with a sync frame` | Índice errado para esse firmware | Listar sem índices e remapear |
| Headset aborta após ~10 s | Aba em segundo plano / throttle | Repetir com aba em primeiro plano |
| Dongle não aparece no Chrome | Porta, driver ou navegador | Trocar porta USB, usar Chrome/Edge no Windows, fechar app da MCHOSE |
| `fc`/`cmp` acusa diferença no noop | Build/arquivo corrompido | **Não flashear**; refazer download + build |
| Flash parcial | Interrupção / dongle solto | Reflashear limpo; headset volta ao stock |

## 9. Outros headsets da linha V9

X9, V9 Turbo, G9 Pro e S9 Pro usam o mesmo chip e formato — o método vale, mas **os índices podem diferir**. Procedimento: rode o comando de listagem no firmware deles e encontre os clips do mic por bisseção (silencie um grupo, flasheie, teste, estreite). Detalhes em [docs/clip-map.md](docs/clip-map.md).

## 10. Como funciona (resumo)

- O `.bin` é um contêiner `AOTA` com partições (`app.bin`, `tone.bin`, `mbrec.bin`, `param.bin`, `ota.xml`).
- `tone.bin` é o banco de vozes (18 clips no EN), “cifrado” com XOR de pad fixo de 32 bytes.
- Silenciar = manter o frame de sync do clip e trocar o resto por frame de ruído de conforto, recalculando os 4 CRCs.
- O `flasher.html` fala com o headset via dongle (HID VID `0x291D`/PID `0x385D`): `ENTER UPDATE` → stream de 63 bytes → resultado. Detalhes em [DECRYPTION.md](DECRYPTION.md).

## Licença

[MIT](LICENSE) — original de Ashbborn (2026). Esta cópia mantém a mesma licença.
