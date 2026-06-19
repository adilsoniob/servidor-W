/**
 * Script de teste de carga para a fila de mensagens WhatsApp.
 *
 * Uso:
 *   node test-load.js                    # 10 envios simultâneos (padrão)
 *   node test-load.js 5                  # 5 envios
 *   node test-load.js 20 5511988810768   # 20 envios para número específico
 *
 * Requer servidor WhatsApp rodando localmente ou URL via env VAR:
 *   WHATSAPP_URL=http://localhost:4320 node test-load.js
 */

const BASE_URL = process.env.WHATSAPP_URL || "http://localhost:4320";
const API_KEY = process.env.WHATSAPP_API_KEY || "VALE_SAUDE_2026";
const DEFAULT_COUNT = 10;
const DEFAULT_PHONE = "5511988810768";

async function testEnqueue(phone, message, index) {
  const start = Date.now();
  try {
    const response = await fetch(`${BASE_URL}/api/queue/enqueue`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone,
        message,
        metadata: { test: true, index, ts: start },
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json().catch(() => ({}));
    const duration = Date.now() - start;
    return {
      index,
      ok: response.ok && data.success,
      status: response.status,
      queueId: data.queueId,
      duration,
      error: data.error,
    };
  } catch (err) {
    return { index, ok: false, status: 0, error: err.message, duration: Date.now() - start };
  }
}

async function getQueueStats() {
  try {
    const response = await fetch(`${BASE_URL}/api/queue/stats`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    return await response.json();
  } catch {
    return { success: false, stats: { error: "Falha ao obter stats" } };
  }
}

async function runLoadTest(count, phone) {
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  TESTE DE CARGA - FILA WHATSAPP`);
  console.log(`  ${count} envios simultâneos`);
  console.log(`  Servidor: ${BASE_URL}`);
  console.log(`  Telefone: ${phone}`);
  console.log(`═══════════════════════════════════════════\n`);

  // Stats antes
  const before = await getQueueStats();
  console.log(`Stats antes:`, before.stats || "indisponivel");

  console.log(`\nEnfileirando ${count} mensagens...\n`);

  const promises = [];
  for (let i = 0; i < count; i++) {
    const msg = `🧪 Teste de carga #${i + 1} - ${new Date().toLocaleTimeString()}`;
    promises.push(testEnqueue(phone, msg, i + 1));
  }

  const results = await Promise.all(promises);

  // Resultados
  const success = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log(`Resultados:`);
  console.log(`  ✅ Sucesso: ${success.length}/${count}`);
  console.log(`  ❌ Falhas:  ${failed.length}/${count}`);

  if (success.length > 0) {
    const durations = success.map((r) => r.duration);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    console.log(`  ⏱  Tempo médio: ${avg.toFixed(0)}ms (min: ${min}ms, max: ${max}ms)`);
  }

  if (failed.length > 0) {
    console.log(`\nDetalhes das falhas:`);
    failed.forEach((f) => console.log(`  #${f.index}: ${f.error || `HTTP ${f.status}`}`));
  }

  // Stats depois
  await new Promise((r) => setTimeout(r, 1000));
  const after = await getQueueStats();
  console.log(`\nStats depois:`, after.stats || "indisponivel");

  // Aguarda processamento da fila
  console.log(`\nAguardando processamento da fila...`);
  let pending = after.stats?.pending || 0;
  let waited = 0;
  while (pending > 0 && waited < 60) {
    await new Promise((r) => setTimeout(r, 3000));
    waited += 3;
    const s = await getQueueStats();
    pending = s.stats?.pending || 0;
    const processing = s.stats?.processing || 0;
    const completed = s.stats?.completed || 0;
    const deadletter = s.stats?.deadletter || 0;
    process.stdout.write(`\r  ⌛ ${waited}s | pending: ${pending} | processing: ${processing} | completed: ${completed} | deadletter: ${deadletter}  `);
  }
  console.log(`\n`);

  const final = await getQueueStats();
  console.log(`Stats finais:`, final.stats || "indisponivel");

  const totalOk = results.filter((r) => r.ok).length;
  const rate = ((totalOk / count) * 100).toFixed(1);
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  RESULTADO FINAL`);
  console.log(`  Taxa de sucesso: ${rate}% (${totalOk}/${count})`);
  console.log(`  Concluído em ${waited}s`);
  console.log(`═══════════════════════════════════════════\n`);

  return { totalOk, totalFail: count - totalOk, rate, waited };
}

// Main
const count = parseInt(process.argv[2], 10) || DEFAULT_COUNT;
const phone = process.argv[3] || DEFAULT_PHONE;

runLoadTest(count, phone).then((result) => {
  process.exit(result.totalFail > 0 ? 1 : 0);
}).catch((err) => {
  console.error("Erro no teste:", err);
  process.exit(1);
});
