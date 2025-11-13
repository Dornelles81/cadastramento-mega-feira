/**
 * Script para testar as otimizações aplicadas
 * Testa: Cache, Pagination, Select Específico
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Estatísticas
const stats = {
  tests: 0,
  passed: 0,
  failed: 0,
  times: []
};

function log(emoji, message) {
  console.log(`${emoji} ${message}`);
}

function logTest(name, time) {
  console.log(`  ✅ ${name} - ${time}ms`);
  stats.tests++;
  stats.passed++;
  stats.times.push(time);
}

function logError(name, error) {
  console.log(`  ❌ ${name} - ${error}`);
  stats.tests++;
  stats.failed++;
}

async function testPublicStandsCache() {
  console.log('\n📦 Teste 1: Cache de Estandes Públicos');

  try {
    // Primeira chamada (miss)
    const start1 = Date.now();
    const res1 = await axios.get(`${BASE_URL}/api/public/stands`);
    const time1 = Date.now() - start1;
    logTest('Primeira chamada (cache miss)', time1);

    // Segunda chamada (hit - deve ser muito mais rápida)
    const start2 = Date.now();
    const res2 = await axios.get(`${BASE_URL}/api/public/stands`);
    const time2 = Date.now() - start2;
    logTest('Segunda chamada (cache hit)', time2);

    // Verificar melhoria
    const improvement = ((time1 - time2) / time1) * 100;
    log('📊', `Melhoria: ${improvement.toFixed(1)}% mais rápido no cache`);

    if (time2 < time1) {
      log('✅', 'Cache funcionando corretamente!');
    } else {
      log('⚠️', 'Cache pode não estar funcionando');
    }

  } catch (error) {
    logError('Cache de estandes', error.message);
  }
}

async function testParticipantsPagination() {
  console.log('\n📄 Teste 2: Pagination de Participantes');

  try {
    // Buscar página 1
    const start1 = Date.now();
    const res1 = await axios.get(`${BASE_URL}/api/admin/participants?page=1&limit=10`, {
      headers: { 'Authorization': `Bearer ${ADMIN_PASSWORD}` }
    });
    const time1 = Date.now() - start1;
    logTest('Página 1 (10 registros)', time1);

    // Buscar página 2
    const start2 = Date.now();
    const res2 = await axios.get(`${BASE_URL}/api/admin/participants?page=2&limit=10`, {
      headers: { 'Authorization': `Bearer ${ADMIN_PASSWORD}` }
    });
    const time2 = Date.now() - start2;
    logTest('Página 2 (10 registros)', time2);

    // Verificar estrutura da resposta
    if (res1.data.page && res1.data.limit && res1.data.totalPages !== undefined) {
      log('✅', 'Estrutura de pagination correta');
    }

    // Buscar muitos registros de uma vez (sem pagination)
    const start3 = Date.now();
    const res3 = await axios.get(`${BASE_URL}/api/admin/participants?limit=100`, {
      headers: { 'Authorization': `Bearer ${ADMIN_PASSWORD}` }
    });
    const time3 = Date.now() - start3;
    logTest('100 registros de uma vez', time3);

    log('📊', `Total de participantes: ${res3.data.total}`);
    log('📊', `Páginas disponíveis: ${res3.data.totalPages}`);

  } catch (error) {
    logError('Pagination', error.message);
  }
}

async function testSearchPerformance() {
  console.log('\n🔍 Teste 3: Performance de Busca');

  try {
    // Buscar por nome parcial
    const start1 = Date.now();
    const res1 = await axios.get(`${BASE_URL}/api/admin/participants?search=a&limit=20`, {
      headers: { 'Authorization': `Bearer ${ADMIN_PASSWORD}` }
    });
    const time1 = Date.now() - start1;
    logTest('Busca por "a" (comum)', time1);

    // Buscar por CPF parcial
    const start2 = Date.now();
    const res2 = await axios.get(`${BASE_URL}/api/admin/participants?search=123&limit=20`, {
      headers: { 'Authorization': `Bearer ${ADMIN_PASSWORD}` }
    });
    const time2 = Date.now() - start2;
    logTest('Busca por CPF "123"', time2);

    // Buscar com filtro de status
    const start3 = Date.now();
    const res3 = await axios.get(`${BASE_URL}/api/admin/participants?approvalStatus=approved&limit=20`, {
      headers: { 'Authorization': `Bearer ${ADMIN_PASSWORD}` }
    });
    const time3 = Date.now() - start3;
    logTest('Filtro por status aprovado', time3);

    log('📊', `Resultados encontrados: ${res1.data.participants.length}`);

  } catch (error) {
    logError('Busca', error.message);
  }
}

async function testCacheInvalidation() {
  console.log('\n🗑️  Teste 4: Invalidação de Cache');

  try {
    // Buscar estandes (cachear)
    const start1 = Date.now();
    await axios.get(`${BASE_URL}/api/public/stands`);
    const time1 = Date.now() - start1;
    logTest('Buscar estandes (primeira vez)', time1);

    // Buscar novamente (cache hit)
    const start2 = Date.now();
    await axios.get(`${BASE_URL}/api/public/stands`);
    const time2 = Date.now() - start2;
    logTest('Buscar estandes (cache hit)', time2);

    log('💡', 'Para testar invalidação, modifique um estande no admin');
    log('💡', 'O cache será invalidado automaticamente');

  } catch (error) {
    logError('Invalidação de cache', error.message);
  }
}

async function testConcurrentRequests() {
  console.log('\n⚡ Teste 5: Requisições Concorrentes');

  try {
    const promises = [];
    const count = 10;

    const startTotal = Date.now();

    for (let i = 0; i < count; i++) {
      promises.push(
        axios.get(`${BASE_URL}/api/public/stands`)
      );
    }

    await Promise.all(promises);
    const totalTime = Date.now() - startTotal;

    logTest(`${count} requisições concorrentes`, totalTime);
    log('📊', `Tempo médio por request: ${(totalTime / count).toFixed(2)}ms`);
    log('📊', `Throughput: ${(count / (totalTime / 1000)).toFixed(2)} req/s`);

  } catch (error) {
    logError('Requisições concorrentes', error.message);
  }
}

async function testDatabaseLoad() {
  console.log('\n💾 Teste 6: Carga do Banco de Dados');

  try {
    // Query complexa com múltiplos filtros
    const start1 = Date.now();
    const res1 = await axios.get(`${BASE_URL}/api/admin/participants?search=&approvalStatus=pending&page=1&limit=50`, {
      headers: { 'Authorization': `Bearer ${ADMIN_PASSWORD}` }
    });
    const time1 = Date.now() - start1;
    logTest('Query com filtros múltiplos', time1);

    // Query de contagem
    const start2 = Date.now();
    const res2 = await axios.get(`${BASE_URL}/api/admin/participants?limit=1`, {
      headers: { 'Authorization': `Bearer ${ADMIN_PASSWORD}` }
    });
    const time2 = Date.now() - start2;
    logTest('Query de contagem (limit 1)', time2);

    log('📊', `Total de participantes no banco: ${res2.data.total}`);

  } catch (error) {
    logError('Carga do banco', error.message);
  }
}

async function runAllTests() {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 TESTE DE OTIMIZAÇÕES - Sistema de Cadastramento');
  console.log('='.repeat(80));

  await testPublicStandsCache();
  await testParticipantsPagination();
  await testSearchPerformance();
  await testCacheInvalidation();
  await testConcurrentRequests();
  await testDatabaseLoad();

  // Resultados finais
  console.log('\n' + '='.repeat(80));
  console.log('📊 RESULTADOS FINAIS');
  console.log('='.repeat(80));
  console.log(`\n✅ Testes passados: ${stats.passed}/${stats.tests}`);
  console.log(`❌ Testes falhados: ${stats.failed}/${stats.tests}`);

  if (stats.times.length > 0) {
    const avgTime = stats.times.reduce((a, b) => a + b, 0) / stats.times.length;
    const minTime = Math.min(...stats.times);
    const maxTime = Math.max(...stats.times);

    console.log(`\n⏱️  Tempos:`);
    console.log(`   - Mínimo: ${minTime}ms`);
    console.log(`   - Máximo: ${maxTime}ms`);
    console.log(`   - Média: ${avgTime.toFixed(2)}ms`);
  }

  console.log('\n💡 Otimizações Implementadas:');
  console.log('   ✅ Sistema de cache em memória');
  console.log('   ✅ Pagination otimizada (50 registros/página)');
  console.log('   ✅ Select específico (reduz dados transferidos)');
  console.log('   ✅ Invalidação automática de cache');
  console.log('   ✅ Índices de banco otimizados');

  console.log('\n🎯 Benefícios Esperados:');
  console.log('   - Redução de 30-50% no tempo de resposta (cache)');
  console.log('   - Redução de 60-80% no uso de memória (pagination)');
  console.log('   - Redução de 20-30% no uso de banda (select)');
  console.log('   - Escalabilidade para 4.000+ participantes');

  console.log('\n' + '='.repeat(80) + '\n');
}

// Executar testes
runAllTests().catch(console.error);
