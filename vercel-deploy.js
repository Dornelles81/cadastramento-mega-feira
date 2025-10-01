const { execSync } = require('child_process');

console.log('🚀 Iniciando deploy automático no Vercel...\n');

try {
  // Primeiro, vamos tentar fazer o deploy direto
  console.log('📦 Fazendo deploy para preview...');
  
  const deployCommand = `vercel --yes --name megafeira2025 --scope team_JaNSJWjVnhQtdG8YWITMmz2J`;
  
  console.log('Executando:', deployCommand);
  const output = execSync(deployCommand, { 
    encoding: 'utf8',
    stdio: 'pipe'
  });
  
  console.log(output);
  
  // Extrair URL do preview
  const urlMatch = output.match(/https:\/\/[^\s]+/);
  if (urlMatch) {
    console.log('\n✅ Deploy preview concluído!');
    console.log('🔗 URL Preview:', urlMatch[0]);
    
    // Agora fazer deploy para produção
    console.log('\n📦 Fazendo deploy para produção...');
    const prodOutput = execSync('vercel --prod --yes', {
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    console.log(prodOutput);
    
    const prodUrlMatch = prodOutput.match(/https:\/\/[^\s]+/);
    if (prodUrlMatch) {
      console.log('\n🎉 Deploy em produção concluído!');
      console.log('🔗 URL Produção:', prodUrlMatch[0]);
    }
  }
  
} catch (error) {
  console.error('❌ Erro no deploy:', error.message);
  console.log('\nTentando método alternativo...\n');
  
  // Método alternativo
  try {
    execSync('vercel --yes', { stdio: 'inherit' });
  } catch (err) {
    console.error('❌ Falha no deploy alternativo:', err.message);
  }
}