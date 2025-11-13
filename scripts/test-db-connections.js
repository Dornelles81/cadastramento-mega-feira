/**
 * Teste de Conexões Simultâneas com NEON Database
 *
 * Este script testa:
 * - Connection pooling
 * - Múltiplas queries simultâneas
 * - Performance e latência
 * - Limite de conexões
 */

const { PrismaClient } = require('@prisma/client');

// Configurações do teste
const CONFIG = {
  simultaneousConnections: 10,
  queriesPerConnection: 5,
  delayBetweenQueries: 100, // ms
};

// Estatísticas
const stats = {
  totalQueries: 0,
  successfulQueries: 0,
  failedQueries: 0,
  totalTime: 0,
  minLatency: Infinity,
  maxLatency: 0,
  latencies: [],
};

// Criar múltiplos clientes Prisma
const prismaClients = [];

async function initializeClients() {
  console.log('\n🔧 Inicializando clientes Prisma...');
  for (let i = 0; i < CONFIG.simultaneousConnections; i++) {
    const client = new PrismaClient({
      log: ['error', 'warn'],
    });
    prismaClients.push(client);
  }
  console.log(`✅ ${CONFIG.simultaneousConnections} clientes criados\n`);
}

async function testSingleQuery(clientIndex, queryIndex) {
  const start = Date.now();
  try {
    // Teste 1: Count de participantes
    const participantCount = await prismaClients[clientIndex].participant.count();

    // Teste 2: Buscar estandes ativos
    const activeStands = await prismaClients[clientIndex].stand.findMany({
      where: { isActive: true },
      take: 10,
    });

    // Teste 3: Buscar participantes recentes
    const recentParticipants = await prismaClients[clientIndex].participant.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        name: true,
        cpf: true,
        createdAt: true,
      },
    });

    const latency = Date.now() - start;

    stats.totalQueries++;
    stats.successfulQueries++;
    stats.totalTime += latency;
    stats.latencies.push(latency);
    stats.minLatency = Math.min(stats.minLatency, latency);
    stats.maxLatency = Math.max(stats.maxLatency, latency);

    console.log(
      `✅ Cliente ${clientIndex + 1} | Query ${queryIndex + 1} | ` +
      `${latency}ms | Participantes: ${participantCount} | ` +
      `Estandes: ${activeStands.length}`
    );

    return { success: true, latency };
  } catch (error) {
    stats.totalQueries++;
    stats.failedQueries++;
    console.error(
      `❌ Cliente ${clientIndex + 1} | Query ${queryIndex + 1} | ` +
      `Erro: ${error.message}`
    );
    return { success: false, error: error.message };
  }
}

async function runConnectionTest(clientIndex) {
  console.log(`\n🚀 Iniciando teste no Cliente ${clientIndex + 1}...`);

  const promises = [];
  for (let i = 0; i < CONFIG.queriesPerConnection; i++) {
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenQueries));
    }
    promises.push(testSingleQuery(clientIndex, i));
  }

  return Promise.all(promises);
}

async function runAllTests() {
  console.log('\n' + '='.repeat(80));
  console.log('🔥 TESTE DE CARGA - NEON DATABASE');
  console.log('='.repeat(80));
  console.log(`\n📊 Configuração:`);
  console.log(`   - Conexões simultâneas: ${CONFIG.simultaneousConnections}`);
  console.log(`   - Queries por conexão: ${CONFIG.queriesPerConnection}`);
  console.log(`   - Total de queries: ${CONFIG.simultaneousConnections * CONFIG.queriesPerConnection}`);
  console.log(`   - Delay entre queries: ${CONFIG.delayBetweenQueries}ms`);

  const startTime = Date.now();

  // Executar todos os testes em paralelo
  const testPromises = [];
  for (let i = 0; i < CONFIG.simultaneousConnections; i++) {
    testPromises.push(runConnectionTest(i));
  }

  await Promise.all(testPromises);

  const totalTestTime = Date.now() - startTime;

  // Calcular estatísticas
  const avgLatency = stats.totalTime / stats.successfulQueries;
  const sortedLatencies = stats.latencies.sort((a, b) => a - b);
  const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)];
  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)];
  const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)];

  // Exibir resultados
  console.log('\n' + '='.repeat(80));
  console.log('📈 RESULTADOS DO TESTE');
  console.log('='.repeat(80));
  console.log(`\n✅ Queries executadas com sucesso: ${stats.successfulQueries}/${stats.totalQueries}`);
  console.log(`❌ Queries com falha: ${stats.failedQueries}/${stats.totalQueries}`);
  console.log(`\n⏱️  Latência:`);
  console.log(`   - Mínima: ${stats.minLatency}ms`);
  console.log(`   - Máxima: ${stats.maxLatency}ms`);
  console.log(`   - Média: ${avgLatency.toFixed(2)}ms`);
  console.log(`   - P50 (mediana): ${p50}ms`);
  console.log(`   - P95: ${p95}ms`);
  console.log(`   - P99: ${p99}ms`);
  console.log(`\n🕐 Tempo total do teste: ${(totalTestTime / 1000).toFixed(2)}s`);
  console.log(`📊 Throughput: ${(stats.totalQueries / (totalTestTime / 1000)).toFixed(2)} queries/segundo`);

  // Análise de performance
  console.log('\n' + '='.repeat(80));
  console.log('🎯 ANÁLISE DE PERFORMANCE');
  console.log('='.repeat(80));

  const successRate = (stats.successfulQueries / stats.totalQueries) * 100;

  if (successRate === 100) {
    console.log('\n✅ EXCELENTE: Todas as queries executadas com sucesso!');
  } else if (successRate >= 95) {
    console.log('\n⚠️  BOM: Mais de 95% de sucesso, mas há algumas falhas.');
  } else {
    console.log('\n❌ ATENÇÃO: Taxa de sucesso abaixo de 95%. Revisar configuração.');
  }

  if (avgLatency < 100) {
    console.log('✅ EXCELENTE: Latência média abaixo de 100ms');
  } else if (avgLatency < 500) {
    console.log('⚠️  BOM: Latência média aceitável (100-500ms)');
  } else {
    console.log('❌ ATENÇÃO: Latência média acima de 500ms. Considerar otimizações.');
  }

  if (p95 < 500) {
    console.log('✅ EXCELENTE: 95% das queries abaixo de 500ms');
  } else if (p95 < 1000) {
    console.log('⚠️  BOM: 95% das queries abaixo de 1 segundo');
  } else {
    console.log('❌ ATENÇÃO: P95 acima de 1 segundo. Revisar índices e queries.');
  }

  console.log('\n' + '='.repeat(80));
  console.log('💡 RECOMENDAÇÕES');
  console.log('='.repeat(80));

  if (stats.failedQueries > 0) {
    console.log('\n⚠️  Há queries falhando. Verificar:');
    console.log('   - Connection pooling está configurado?');
    console.log('   - Limite de conexões no NEON é suficiente?');
    console.log('   - Há timeout configurado no Prisma?');
  }

  if (avgLatency > 200) {
    console.log('\n⚠️  Latência pode ser melhorada. Considerar:');
    console.log('   - Adicionar índices nas colunas mais consultadas');
    console.log('   - Usar select para buscar apenas campos necessários');
    console.log('   - Implementar cache para queries frequentes');
    console.log('   - Verificar região do banco vs servidor');
  }

  if (p99 > 1000) {
    console.log('\n⚠️  Alguns requests muito lentos (P99). Verificar:');
    console.log('   - Queries sem índices adequados');
    console.log('   - Tabelas sem VACUUM/ANALYZE');
    console.log('   - Throttling do NEON (verificar plano)');
  }

  console.log('\n✅ Teste concluído!');
  console.log('='.repeat(80) + '\n');
}

async function cleanup() {
  console.log('\n🧹 Limpando conexões...');
  for (const client of prismaClients) {
    await client.$disconnect();
  }
  console.log('✅ Todas as conexões fechadas\n');
}

// Executar teste
async function main() {
  try {
    await initializeClients();
    await runAllTests();
  } catch (error) {
    console.error('\n❌ Erro fatal:', error);
  } finally {
    await cleanup();
  }
}

// Tratar sinais de interrupção
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Teste interrompido pelo usuário');
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n⚠️  Teste terminado');
  await cleanup();
  process.exit(0);
});

// Executar
main().catch(console.error);
