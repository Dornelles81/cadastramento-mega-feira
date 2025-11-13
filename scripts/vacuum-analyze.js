/**
 * Script para executar VACUUM ANALYZE nas tabelas principais
 * Otimiza o plano de execução do PostgreSQL
 *
 * Usa apenas ANALYZE pois VACUUM requer conexão direta e não funciona com pooling
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function analyzeTable(table) {
  try {
    const startTime = Date.now();
    console.log(`⏳ Analisando tabela: ${table}...`);

    // Executar ANALYZE (não requer transação fora)
    await prisma.$executeRawUnsafe(`ANALYZE ${table}`);

    const duration = Date.now() - startTime;
    console.log(`✅ ${table} - Concluído em ${duration}ms`);
    return { success: true, table, duration };
  } catch (error) {
    console.log(`⚠️  ${table} - ${error.message}`);
    return { success: false, table, error: error.message };
  }
}

async function analyzeDatabase() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 ANALYZE - Atualização de Estatísticas do Banco');
  console.log('='.repeat(80));
  console.log('\nIniciando análise das tabelas...\n');

  const tables = [
    'participants',
    'stands',
    'custom_fields',
    'events',
    'event_configs',
    'document_configs',
    'audit_logs',
    'approval_logs',
    'hikcental_configs',
    'hikcental_sync_logs',
    'hikcental_sync_batches',
    'hikcental_webhook_logs'
  ];

  const results = [];
  let successCount = 0;
  let failedCount = 0;

  for (const table of tables) {
    const result = await analyzeTable(table);
    results.push(result);
    if (result.success) {
      successCount++;
    } else {
      failedCount++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📊 RESULTADOS');
  console.log('='.repeat(80));
  console.log(`\n✅ Tabelas analisadas: ${successCount}`);
  console.log(`⚠️  Tabelas com erro: ${failedCount}`);
  console.log(`📋 Total: ${tables.length}`);

  if (successCount === tables.length) {
    console.log('\n🎉 Todas as tabelas foram analisadas com sucesso!');
  } else if (successCount > 0) {
    console.log('\n✅ Análise parcial concluída.');
  } else {
    console.log('\n❌ Nenhuma tabela foi analisada.');
  }

  console.log('\n💡 Benefícios do ANALYZE:');
  console.log('   - Atualiza estatísticas do otimizador de queries');
  console.log('   - Melhora planos de execução');
  console.log('   - Reduz latência de queries complexas');
  console.log('   - Identifica distribuição de dados');

  console.log('\n📝 Nota sobre VACUUM:');
  console.log('   VACUUM completo não pode ser executado via Prisma pooling.');
  console.log('   O NEON executa VACUUM automático em background.');
  console.log('   ANALYZE é suficiente para otimizar query planning.');

  console.log('\n' + '='.repeat(80) + '\n');

  return results;
}

async function main() {
  try {
    await analyzeDatabase();
  } catch (error) {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
