const axios = require('axios');
const https = require('https');

// Ignorar certificado SSL autoassinado
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// Configurações para testar
const configs = [
  { url: 'http://localhost:8080', desc: 'HikCentral HTTP porta 8080' },
  { url: 'https://localhost:8443', desc: 'HikCentral HTTPS porta 8443' },
  { url: 'http://localhost:80', desc: 'HikCentral HTTP porta 80' },
  { url: 'https://localhost:443', desc: 'HikCentral HTTPS porta 443' },
  { url: 'http://127.0.0.1:8080', desc: 'HikCentral via 127.0.0.1:8080' },
  { url: 'http://192.168.1.20:80', desc: 'HikCentral IP Local HTTP' },
  { url: 'https://192.168.1.20:443', desc: 'HikCentral IP Local HTTPS' }
];

const username = 'admin';
const password = 'Index2016';

async function testHikCentralConnection() {
  console.log('🔍 Testando conexões possíveis com HikCentral...');
  console.log('👤 Usuário:', username);
  console.log('========================================\n');

  for (const config of configs) {
    console.log(`\n📡 Testando: ${config.desc}`);
    console.log(`🔗 URL: ${config.url}`);
    
    try {
      // Teste 1: API v1 (HikCentral Professional)
      const response1 = await axios.get(
        `${config.url}/api/acs/v1/door/search`,
        {
          auth: { username, password },
          httpsAgent,
          timeout: 5000,
          validateStatus: () => true // Aceita qualquer status
        }
      );
      
      if (response1.status < 500) {
        console.log(`✅ CONECTADO! Status: ${response1.status}`);
        console.log('📋 Resposta:', response1.data ? 'Dados recebidos' : 'Sem dados');
        console.log('\n🎉 CONFIGURAÇÃO FUNCIONANDO!');
        console.log('Adicione ao .env.local:');
        console.log(`HIKCENTAL_URL="${config.url}"`);
        return;
      }
    } catch (error) {
      // Silenciosamente continua para próximo teste
    }

    try {
      // Teste 2: API v2
      const response2 = await axios.get(
        `${config.url}/api/v2/person/list`,
        {
          auth: { username, password },
          httpsAgent,
          timeout: 5000,
          validateStatus: () => true
        }
      );
      
      if (response2.status < 500) {
        console.log(`✅ CONECTADO (API v2)! Status: ${response2.status}`);
        console.log('📋 Resposta:', response2.data ? 'Dados recebidos' : 'Sem dados');
        console.log('\n🎉 CONFIGURAÇÃO FUNCIONANDO!');
        console.log('Adicione ao .env.local:');
        console.log(`HIKCENTAL_URL="${config.url}"`);
        return;
      }
    } catch (error) {
      // Silenciosamente continua para próximo teste
    }

    try {
      // Teste 3: OpenAPI
      const response3 = await axios.get(
        `${config.url}/artemis/api/common/v1/health`,
        {
          auth: { username, password },
          httpsAgent,
          timeout: 5000,
          validateStatus: () => true
        }
      );
      
      if (response3.status < 500) {
        console.log(`✅ CONECTADO (OpenAPI)! Status: ${response3.status}`);
        console.log('📋 Resposta:', response3.data ? 'Dados recebidos' : 'Sem dados');
        console.log('\n🎉 CONFIGURAÇÃO FUNCIONANDO!');
        console.log('Adicione ao .env.local:');
        console.log(`HIKCENTAL_URL="${config.url}"`);
        return;
      }
    } catch (error) {
      console.log('❌ Não conectou');
    }
  }

  console.log('\n\n❌ NENHUMA CONFIGURAÇÃO FUNCIONOU!');
  console.log('\n🔧 Verificações necessárias:');
  console.log('1. O HikCentral Professional está instalado e rodando?');
  console.log('2. Verifique a porta no arquivo de configuração do HikCentral');
  console.log('3. No Windows, verifique os serviços:');
  console.log('   - Pressione Win+R, digite "services.msc"');
  console.log('   - Procure por "HikCentral" ou "HCP"');
  console.log('4. Verifique o firewall do Windows');
  console.log('5. Tente acessar no navegador:');
  console.log('   - http://localhost:8080');
  console.log('   - http://localhost:80');
  console.log('\n📚 Documentação HikCentral:');
  console.log('Por padrão, o HikCentral Professional usa:');
  console.log('- Porta 8080 para HTTP');
  console.log('- Porta 8443 para HTTPS');
  console.log('- API Path: /api/acs/v1/');
}

async function checkLocalServices() {
  console.log('\n\n🔍 Verificando serviços locais...\n');
  
  const ports = [80, 443, 8080, 8443, 3000, 5000, 7001, 8000, 8088];
  
  for (const port of ports) {
    try {
      const response = await axios.get(
        `http://localhost:${port}`,
        {
          timeout: 2000,
          validateStatus: () => true
        }
      );
      console.log(`✅ Porta ${port}: ABERTA (Status: ${response.status})`);
    } catch (error) {
      // Porta fechada ou sem resposta
    }
  }
}

// Executar testes
async function runTests() {
  await testHikCentralConnection();
  await checkLocalServices();
}

runTests();