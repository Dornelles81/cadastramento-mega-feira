const axios = require('axios');
const https = require('https');

// Configurações do dispositivo
const HIKVISION_IP = process.env.HIKVISION_DEVICE_IP || '192.168.1.20';
const HIKVISION_USER = process.env.HIKVISION_USER || 'admin';
const HIKVISION_PASSWORD = process.env.HIKVISION_PASSWORD || '';

// Ignorar certificado SSL autoassinado
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

async function testConnection() {
  console.log('🔌 Testando conexão com dispositivo Hikvision...');
  console.log(`📍 IP: ${HIKVISION_IP}`);
  console.log(`👤 Usuário: ${HIKVISION_USER}`);
  console.log('----------------------------------------\n');

  try {
    // Teste 1: Verificar informações do dispositivo
    console.log('1️⃣ Obtendo informações do dispositivo...');
    const deviceInfo = await axios.get(
      `http://${HIKVISION_IP}/ISAPI/System/deviceInfo`,
      {
        auth: {
          username: HIKVISION_USER,
          password: HIKVISION_PASSWORD
        },
        httpsAgent,
        timeout: 10000
      }
    );
    console.log('✅ Conectado com sucesso!');
    console.log('📋 Informações do dispositivo:', deviceInfo.data);
    console.log('----------------------------------------\n');

    // Teste 2: Verificar capacidade do dispositivo
    console.log('2️⃣ Verificando capacidade do dispositivo...');
    const capabilities = await axios.get(
      `http://${HIKVISION_IP}/ISAPI/AccessControl/UserInfo/capabilities`,
      {
        auth: {
          username: HIKVISION_USER,
          password: HIKVISION_PASSWORD
        },
        httpsAgent,
        timeout: 10000
      }
    );
    console.log('✅ Capacidades obtidas!');
    console.log('📊 Capacidades:', capabilities.data);
    console.log('----------------------------------------\n');

    // Teste 3: Listar usuários existentes
    console.log('3️⃣ Listando usuários existentes...');
    const users = await axios.post(
      `http://${HIKVISION_IP}/ISAPI/AccessControl/UserInfo/Search?format=json`,
      {
        UserInfoSearchCond: {
          searchID: '1',
          maxResults: 10,
          searchResultPosition: 0
        }
      },
      {
        auth: {
          username: HIKVISION_USER,
          password: HIKVISION_PASSWORD
        },
        headers: {
          'Content-Type': 'application/json'
        },
        httpsAgent,
        timeout: 10000
      }
    );
    console.log('✅ Usuários listados!');
    console.log('👥 Total de usuários:', users.data?.UserInfoSearch?.totalMatches || 0);
    console.log('----------------------------------------\n');

    // Teste 4: Verificar biblioteca facial
    console.log('4️⃣ Verificando biblioteca facial...');
    const faceLib = await axios.get(
      `http://${HIKVISION_IP}/ISAPI/Intelligent/FDLib/capabilities`,
      {
        auth: {
          username: HIKVISION_USER,
          password: HIKVISION_PASSWORD
        },
        httpsAgent,
        timeout: 10000
      }
    );
    console.log('✅ Biblioteca facial disponível!');
    console.log('📸 Capacidades faciais:', faceLib.data);
    console.log('----------------------------------------\n');

    console.log('🎉 TODOS OS TESTES PASSARAM!');
    console.log('✅ Dispositivo Hikvision está pronto para receber dados!');
    console.log('\n📝 Próximos passos:');
    console.log('1. Use a página /admin/hikcental para sincronizar participantes');
    console.log('2. Verifique os logs de sincronização');
    console.log('3. Confirme no dispositivo se os usuários foram adicionados');

  } catch (error) {
    console.error('❌ ERRO na conexão:', error.message);
    
    if (error.response) {
      console.error('📛 Status HTTP:', error.response.status);
      console.error('📝 Resposta:', error.response.data);
    }
    
    console.log('\n🔧 Possíveis soluções:');
    console.log('1. Verifique se o IP está correto:', HIKVISION_IP);
    console.log('2. Confirme usuário e senha');
    console.log('3. Verifique se o dispositivo está na mesma rede');
    console.log('4. Teste ping no IP:', `ping ${HIKVISION_IP}`);
    console.log('5. Verifique se a API ISAPI está habilitada no dispositivo');
  }
}

// Executar teste
testConnection();