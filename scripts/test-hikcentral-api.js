const axios = require('axios');

// Configuração
const HIKCENTAL_URL = 'http://localhost:80';
const USERNAME = process.env.HIKCENTAL_USERNAME || 'admin';
const PASSWORD = process.env.HIKCENTAL_PASSWORD || '';

// Dados de teste
const testPerson = {
  employeeNo: '12345678900',
  name: 'Teste API',
  userType: 'normal',
  Valid: {
    enable: true,
    beginTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
  },
  doorRight: '1',
  RightPlan: [{
    doorNo: 1,
    planTemplateNo: '1'
  }],
  faceData: {
    faceLibType: 'blackFD',
    libMatching: {
      libID: '1',
      FDID: '1',
      FPID: '1'
    },
    face: {
      binaryData: '/9j/4AAQSkZJRgABAQAAAQ...' // Base64 simplificado
    }
  }
};

async function testHikCentralAPI() {
  console.log('🔍 Testando API do HikCentral Professional');
  console.log('📍 URL:', HIKCENTAL_URL);
  console.log('👤 Usuário:', USERNAME);
  console.log('========================================\n');

  // Lista de endpoints para testar
  const endpoints = [
    {
      name: 'Listar Pessoas (v1)',
      method: 'GET',
      url: '/api/acs/v1/person/list',
      data: null
    },
    {
      name: 'Buscar Portas (v1)',
      method: 'GET',
      url: '/api/acs/v1/door/search',
      data: null
    },
    {
      name: 'Adicionar Pessoa (v1)',
      method: 'POST',
      url: '/api/acs/v1/person/single/add',
      data: testPerson
    },
    {
      name: 'Info do Sistema',
      method: 'GET',
      url: '/api/system/v1/info',
      data: null
    },
    {
      name: 'Health Check',
      method: 'GET',
      url: '/artemis/api/common/v1/health',
      data: null
    }
  ];

  let workingEndpoint = null;

  for (const endpoint of endpoints) {
    console.log(`\n📡 Testando: ${endpoint.name}`);
    console.log(`   Método: ${endpoint.method}`);
    console.log(`   URL: ${HIKCENTAL_URL}${endpoint.url}`);
    
    try {
      const config = {
        method: endpoint.method,
        url: `${HIKCENTAL_URL}${endpoint.url}`,
        auth: {
          username: USERNAME,
          password: PASSWORD
        },
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 10000,
        validateStatus: () => true // Aceita qualquer status
      };

      if (endpoint.data) {
        config.data = endpoint.data;
      }

      const response = await axios(config);
      
      console.log(`   Status: ${response.status}`);
      
      if (response.status === 200 || response.status === 201) {
        console.log(`   ✅ SUCESSO!`);
        workingEndpoint = endpoint;
        if (response.data) {
          console.log(`   Resposta:`, JSON.stringify(response.data, null, 2).substring(0, 200));
        }
      } else if (response.status === 401) {
        console.log(`   ⚠️ Não autorizado - verifique credenciais`);
      } else if (response.status === 404) {
        console.log(`   ❌ Endpoint não encontrado`);
      } else {
        console.log(`   ⚠️ Status: ${response.status}`);
        if (response.data) {
          console.log(`   Resposta:`, JSON.stringify(response.data, null, 2).substring(0, 200));
        }
      }
    } catch (error) {
      console.log(`   ❌ Erro: ${error.message}`);
    }
  }

  console.log('\n========================================');
  if (workingEndpoint) {
    console.log('✅ ENDPOINT FUNCIONANDO:');
    console.log(`   ${workingEndpoint.method} ${HIKCENTAL_URL}${workingEndpoint.url}`);
    console.log('\n📝 Use este endpoint na integração!');
  } else {
    console.log('❌ Nenhum endpoint funcionou completamente');
    console.log('\n🔧 Possíveis soluções:');
    console.log('1. Verifique se o HikCentral Professional está rodando');
    console.log('2. Confirme as credenciais de acesso');
    console.log('3. Verifique a versão do HikCentral (v1.x ou v2.x)');
    console.log('4. Consulte a documentação da API do seu HikCentral');
  }

  // Teste adicional: verificar se é uma instalação web
  console.log('\n\n🌐 Verificando interface web...');
  try {
    const webResponse = await axios.get(HIKCENTAL_URL, {
      timeout: 5000,
      validateStatus: () => true
    });
    
    if (webResponse.status === 200) {
      console.log('✅ Interface web acessível');
      console.log('📱 Tente acessar no navegador:', HIKCENTAL_URL);
      
      // Verifica se é HikCentral pelo conteúdo
      const content = webResponse.data.toString();
      if (content.includes('HikCentral') || content.includes('hikvision')) {
        console.log('✅ Parece ser HikCentral!');
      }
    }
  } catch (error) {
    console.log('❌ Interface web não acessível');
  }
}

// Executar teste
testHikCentralAPI();