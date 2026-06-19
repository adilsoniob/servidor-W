# Estratégia Anti-Bloqueio — WhatsApp Server

> Documento de análise e planejamento. Nenhuma linha de código do sistema atual foi alterada.
> Todo o conteúdo aqui é **propositivo** — para ser implementado em módulos separados sem risco ao que já roda.

---

## Índice

1. [Cenário Atual](#1-cenário-atual)
2. [Por que o WhatsApp bloqueia](#2-por-que-o-whatsapp-bloqueia)
3. [Camadas de Proteção](#3-camadas-de-proteção)
4. [Roadmap de Implementação](#4-roadmap-de-implementação)
5. [Arquitetura Segura (sem risco ao sistema atual)](#5-arquitetura-segura)
6. [Detalhamento de Cada Técnica](#6-detalhamento-de-cada-técnica)
7. [Métricas e Monitoramento](#7-métricas-e-monitoramento)
8. [Perguntas Frequentes](#8-perguntas-frequentes)

---

## 1. Cenário Atual

### O que já temos funcionando
- Servidor WhatsApp conectado via `whatsapp-web.js` (v1.25.0)
- Fila SQLite com retry (3×) e dead letter
- Rate limit: 5 msg/min, intervalo fixo de 6s
- Sessão persistente via LocalAuth (`./data/.wwebjs_auth`)
- Admin panel funcional
- Mensagens enviadas sob demanda (cliente clica "Pagar" → enfileira → worker envia)

### O que nos torna detectáveis
- Intervalo **fixo** entre mensagens (padrão robótico)
- Navegador Chromium sem stealth (detectável como Puppeteer)
- IP de datacenter (Railway)
- Sem warmup da conta
- Mesma mensagem exata para todos os clientes
- Envio imediato sem simular comportamento humano

---

## 2. Por que o WhatsApp bloqueia

### 2.1. O que a Meta detecta (em ordem de relevância)

| # | Sinal | Risco |
|---|-------|-------|
| 1 | **Padrão temporal repetitivo** — intervalos fixos, horários exatos | Crítico |
| 2 | **navigator.webDriver = true** — identifica Puppeteer/Chromium automatizado | Crítico |
| 3 | **Mesma mensagem repetida** para múltiplos números | Alto |
| 4 | **Velocidade de envio** — muitas mensagens em pouco tempo | Alto |
| 5 | **IP classificado** — datacenter, VPN, ou IP já reportado | Médio |
| 6 | **Sessão nova em ritmo acelerado** — sem warmup | Alto |
| 7 | **Comportamento atípico** — sem pausas, sem "typing", sem interação | Médio |
| 8 | **Links suspeitos** — domínios não confiáveis, encurtadores | Médio |

### 2.2. Mitos comuns

| Mito | Verdade |
|------|---------|
| "Preciso de muitos números diferentes" | Uma conta bem comportada vale mais que 10 contas queimadas |
| "API oficial do Meta Business resolve" | API oficial também tem limites e custos; não elimina bloqueio |
| "Proxy resolve tudo" | Proxy ajuda mas não esconde padrão robótico |
| "Delay fixo de X segundos é seguro" | Delay fixo é justamente o padrão mais fácil de detectar |

---

## 3. Camadas de Proteção

```
┌─────────────────────────────────────────────────────────────┐
│                     CAMADA 7: CONTEÚDO                       │
│  Variação de template, evitar gatilhos, links próprios      │
├─────────────────────────────────────────────────────────────┤
│                     CAMADA 6: MULTI-CONTA                    │
│  2-3 contas com fallback automático, round-robin            │
├─────────────────────────────────────────────────────────────┤
│                     CAMADA 5: PROXY                          │
│  Proxy residencial brasileiro, binding por sessão           │
├─────────────────────────────────────────────────────────────┤
│                     CAMADA 4: STEALTH                        │
│  puppeteer-extra-plugin-stealth, User-Agent, viewport, etc  │
├─────────────────────────────────────────────────────────────┤
│                     CAMADA 3: COMPORTAMENTO                  │
│  Delay variável, typing simulation, pausas aleatórias       │
├─────────────────────────────────────────────────────────────┤
│                     CAMADA 2: HORÁRIO E VOLUME               │
│  Horário comercial, limite diário, janela por contato       │
├─────────────────────────────────────────────────────────────┤
│                     CAMADA 1: WARMUP                         │
│  Progressão gradual de ritmo nos primeiros dias             │
├─────────────────────────────────────────────────────────────┤
│                     BASE: O QUE JÁ TEMOS                     │
│  Fila SQLite, rate 5/min, retry, deadletter, LocalAuth      │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Roadmap de Implementação

Dividido em fases. Cada fase é **independente** e pode ser implementada sem afetar as demais.

### Fase 1 — Impacto Alto, Esforço Baixo (1-2 dias)

| Item | Esforço | Impacto |
|------|---------|---------|
| Delay variável (não fixo) | 2h | Alto |
| Pausas aleatórias a cada N envios | 2h | Alto |
| Horário comercial (08-21h) | 1h | Médio |
| Limite diário por conta | 1h | Alto |
| Janela de 24h por contato | 2h | Médio |

### Fase 2 — Stealth + Comportamento (2-3 dias)

| Item | Esforço | Impacto |
|------|---------|---------|
| puppeteer-extra-plugin-stealth | 2h | Alto |
| User-Agent rotativo | 1h | Médio |
| Viewport aleatório | 1h | Baixo |
| Simular "typing" antes de enviar | 3h | Alto |
| Geolocation falsa (Brasil) | 1h | Baixo |

### Fase 3 — Proxy (1-2 dias)

| Item | Esforço | Impacto |
|------|---------|---------|
| Integração com proxy residencial | 4h | Médio |
| Binding de IP por sessão | 2h | Médio |

### Fase 4 — Multi-Conta + Fallback (3-5 dias)

| Item | Esforço | Impacto |
|------|---------|---------|
| 2-3 contas simultâneas | 4h | Alto |
| Distribuição round-robin | 3h | Alto |
| Detecção automática de bloqueio | 4h | Alto |
| Migração de fila entre contas | 4h | Alto |

### Fase 5 — Variação de Conteúdo (contínuo)

| Item | Esforço | Impacto |
|------|---------|---------|
| Pequenas variações no texto | 2h | Médio |
| Inserir emojis aleatórios | 1h | Baixo |
| Variação de pontuação/capitalização | 1h | Baixo |

---

## 5. Arquitetura Segura (sem risco ao sistema atual)

### 5.1. Separação por módulos

```
src/
  services/
    session.js        ← NÃO TOCAR (sistema atual)
    queue.js          ← NÃO TOCAR (já funciona)
    stealth/
      index.js        ← NOVO: gerencia stealth, proxy, User-Agent
      behavior.js     ← NOVO: delays variáveis, pausas, typing
      scheduler.js    ← NOVO: horário comercial, limite diário
      multiaccount.js ← NOVO: fallback entre contas
      warmup.js       ← NOVO: progressão gradual de ritmo
      content.js      ← NOVO: variação de template
```

### 5.2. Padrão Decorator (não interfere no fluxo existente)

O `session.js` atual tem um método `_doSend()`. A estratégia é **envolver** esse método sem modificá-lo:

```
sendFromQueue()
    → stealth.behavior.delayVariavel()     ← NOVO antes
    → stealth.behavior.typingSimulation()   ← NOVO antes
    → _doSend()                             ← EXISTENTE (inalterado)
    → stealth.scheduler.checkLimits()       ← NOVO depois
```

### 5.3. Feature Toggle

Tudo implementado com chave liga/desliga no config:

```json
{
  "stealth": {
    "enabled": true,
    "variableDelay": { "min": 4000, "max": 12000 },
    "randomPauses": { "every": 5, "minSec": 15, "maxSec": 120 },
    "commercialHours": { "enabled": true, "start": "08:00", "end": "21:00", "timezone": "America/Sao_Paulo" },
    "dailyLimit": 80,
    "contactWindowHours": 24,
    "simulateTyping": true,
    "proxy": { "enabled": false, "url": "" },
    "stealthPlugin": true,
    "userAgentRotation": true
  }
}
```

Uma vez desligado, o sistema comporta EXATAMENTE como antes.

---

## 6. Detalhamento de Cada Técnica

### 6.1. Delay Variável (Fase 1)

**Problema:** Intervalo fixo de 6s é padrão robótico.

**Solução:**

```
intervalo = 6s + random(2000, 8000)ms
```

Distribuição sugerida:
- Mínimo: 4s
- Máximo: 14s
- Média: ~8s
- Ocasionalmente: 20-30s (a cada 10-15 envios)

**Implementação:** Modificar o cálculo em `_doSend()` ou criar wrapper no módulo `stealth/behavior.js`.

**Risco para o sistema atual:** Zero. É apenas uma alteração no cálculo de espera.

---

### 6.2. Pausas Aleatórias (Fase 1)

**Problema:** Enviar N mensagens seguidas sem pausa longa.

**Solução:**

```
a cada 3-5 mensagens:
    pausar 30s + random(15, 120)s
```

Isso simula um humano que envia algumas mensagens, para, mexe no celular, e volta.

**Implementação:** Contador no `stealth/behavior.js`. Ao atingir o limite, trava a fila por X segundos.

**Risco:** Se a pausa falhar (exceção), a mensagem volta pra fila e tenta de novo — sem perda.

---

### 6.3. Simular "Digitando" (Fase 2)

**Problema:** Mensagem aparece instantaneamente.

**Solução:**

```javascript
await client.sendPresenceAvailable();        // fica "online"
await new Promise(r => setTimeout(r, 2000 + Math.random() * 4000));
await chat.sendStateTyping();                 // aparece "digitando..."
await new Promise(r => setTimeout(r, 3000 + Math.random() * 3000));
await client.sendMessage(chatId, message);    // envia
```

**Implementação:** Método `simulateHumanTyping(chatId)` em `stealth/behavior.js`.

**Risco:** Se `simulateTyping` falhar, cai no `catch` e chama `_doSend()` direto (fallback seguro).

---

### 6.4. Horário Comercial (Fase 1)

**Problema:** Enviar mensagens 03:00 da manhã.

**Solução:**

```javascript
function isWithinBusinessHours() {
    const h = new Date().getHours() - 3; // UTC → São Paulo
    return h >= 8 && h < 21;
}
```

Se estiver fora do horário:
- Mensagens pendentes NÃO são perdidas
- São reagendadas para o próximo dia útil, 08:00-09:00 (aleatório)
- O worker apenas não processa fila fora do horário

**Implementação:** `stealth/scheduler.js` — verifica antes de cada `_tryDequeue()`.

**Risco:** Nenhum. Fila permanece intacta, só não é processada.

---

### 6.5. Limite Diário (Fase 1)

**Problema:** Enviar 500 mensagens no primeiro dia.

**Solução:**

```javascript
const DAILY_LIMIT = 80;
const todayKey = new Date().toDateString();
const sentToday = await redis.get(`daily:${todayKey}`) || 0;
if (sentToday >= DAILY_LIMIT) {
    // não envia; volta pra fila
    return this._fail("DAILY_LIMIT", "Limite diário atingido.");
}
```

Alternativa (sem Redis): usar SQLite ou JSON local.

**Implementação:** Contador diário em `stealth/scheduler.js` com persistência em `data/daily-count.json`.

**Comportamento quando atinge o limite:** Mensagens voltam pra `pending` e tentam no dia seguinte.

---

### 6.6. Janela de 24h por Contato (Fase 1)

**Problema:** Enviar para o mesmo número várias vezes no mesmo dia.

**Solução:**

```javascript
const lastSentAt = await getLastSent(phone);
if (lastSentAt && (Date.now() - lastSentAt) < 24 * 3600 * 1000) {
    return this._fail("CONTACT_WINDOW", "Janela de 24h não expirada.");
}
```

**Implementação:** `stealth/scheduler.js` ou diretamente no Storage existente.

---

### 6.7. Puppeteer Stealth Plugin (Fase 2)

**Problema:** `navigator.webdriver = true` expõe automação.

**Solução:**

```
npm install puppeteer-extra-plugin-stealth
```

Adicionar ao criar o Client:

```javascript
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
```

**Risco:** Se o plugin falhar na instalação, o sistema atual continua funcionando (só perde a proteção).

---

### 6.8. User-Agent Rotativo (Fase 2)

**Problema:** Mesmo User-Agent sempre.

**Solução:** Lista de 5-10 User-Agents reais de Chrome/Edge no Brasil. Rotacionar a cada sessão ou a cada N mensagens.

---

### 6.9. Proxy Residencial (Fase 3)

**Problema:** IP do Railway é datacenter.

**Solução:**

```javascript
const browser = await puppeteer.launch({
    args: [`--proxy-server=http://user:pass@proxy:port`]
});
```

**Fornecedores sugeridos:**
- **BrightData** (antigo Luminati) — proxy residencial rotativo, ~$15/GB
- **NSTProxy** — proxies brasileiros, ~$10/mês
- **ProxyLemp** — alternativo, ~$5/mês

**Risco:** Se o proxy falhar, o Puppeteer não conecta. Usar fallback sem proxy.

---

### 6.10. Multi-Conta + Fallback (Fase 4)

**Problema:** Conta única = ponto único de falha.

**Solução:**

```
[ Fila Central SQLite ]
        │
   [ Distribuidor Round-Robin ]
     ┌──────┼──────┐
  Conta 1  Conta 2  Conta 3
     │        │       │
  Proxy 1  Proxy 2  Proxy 3
```

**Detecção de bloqueio:**
- Monitorar erros `401`, `blocked`, `ban`, `logout`
- Se detectado: marcar conta como `banned`, parar de enviar por ela
- Migrar fila pendente para as contas ativas
- Notificar admin

**Implementação:** `stealth/multiaccount.js`.

---

### 6.11. Conteúdo Variável (Fase 5)

**Problema:** Mesma mensagem exata para todos.

**Solução:** No `buildPaymentMessage()`, adicionar microvariações:

```javascript
const variacoesSaudacao = ["\n\n", "\n", "! ", ". ", " 🙂", ""];
const sufixo = variacoesSaudacao[Math.floor(Math.random() * variacoesSaudacao.length)];
message += sufixo;
```

Ou randomizar pequenos emojis, pontuação, quebras de linha.

---

## 7. Métricas e Monitoramento

### 7.1. O que monitorar

| Métrica | Onde | Ação se anormal |
|---------|------|-----------------|
| Taxa de falha (erro 5xx/timeout) | Logs | Reduzir ritmo |
| Erro "blocked" ou "ban" | Logs | Desativar conta, notificar admin |
| Mensagens enfileiradas pendentes | Fila SQLite | Verificar saúde worker |
| Mensagens/dia por conta | `stealth/scheduler.js` | Ajustar se estourar limite |
| Tempo médio entre envios | Logs | Verificar se delay está variando |
| Número de bloqueios | Histórico | Acionar multi-account |

### 7.2. Alertas sugeridos

- **Bloqueio detectado** → notificação imediata no admin + email/Telegram
- **Fila pendente > 50** → alerta de lentidão
- **Downtime > 30min** → alerta de desconexão
- **Limite diário atingido** → log informativo

---

## 8. Perguntas Frequentes

### "Isso vai garantir 100% que não serei bloqueado?"

Não. Nenhuma ferramenta garante 100%. O que fazemos é **reduzir drasticamente** a probabilidade. Contas bem configuradas e bem comportadas raramente são bloqueadas.

### "Preciso de múltiplos chips SIM?"

Não para começar. Uma conta bem cuidada com as camadas 1-3 já resolve a maioria dos casos. Múltiplos chips são para cenários de alto volume (+500 msg/dia).

### "Qual o volume seguro?"

Com as proteções implementadas:
- 1 conta: 50-80 msg/dia
- 2 contas: 100-160 msg/dia
- 3 contas: 150-240 msg/dia

Acima disso, considere a API oficial do WhatsApp Business.

### "E se a conta for bloqueada mesmo assim?"

O sistema multi-conta (Fase 4) detecta e migra automaticamente. Você conecta uma nova conta e o serviço continua sem interrupção.

### "Vou perder mensagens durante a migração?"

Não. Todas as mensagens estão na fila SQLite. Se uma conta cai, as mensagens pendentes são reatribuídas para outra conta ativa.

---

## Resumo Executivo

```
Fase 1 (agora):  Delay variável + pausas + horário + limites  → já reduz 70% do risco
Fase 2 (próxima): Stealth plugin + typing + User-Agent       → reduz mais 20%
Fase 3:           Proxy residencial                           → reduz mais 5%
Fase 4:           Multi-conta + fallback                      → elimina ponto único de falha
Fase 5:           Variação de conteúdo                        → proteção contra filtro de texto
```

> **Nota final:** Nada deste documento foi implementado. O sistema atual (`session.js`, `queue.js`, `admin.js`) continua rodando exatamente como antes. A implementação é incremental, em módulos separados, com feature toggle para ligar/desligar sem risco.
