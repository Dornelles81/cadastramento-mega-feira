import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

interface SyncStatus {
  totalParticipants: number;
  syncedCount: number;
  pendingCount: number;
  failedCount: number;
  lastSyncDate?: string;
  isConnected: boolean;
}

export default function HikCentralAdmin() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    totalParticipants: 127,
    syncedCount: 85,
    pendingCount: 35,
    failedCount: 7,
    lastSyncDate: new Date().toISOString(),
    isConnected: false
  });
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'sync' | 'logs' | 'settings' | 'errors'>('dashboard');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  const [syncErrors, setSyncErrors] = useState<any[]>([]);

  useEffect(() => {
    // Check authentication
    const password = sessionStorage.getItem('adminPassword');
    if (password !== 'admin123') {
      router.push('/admin');
      return;
    }
    setIsAuthenticated(true);
    
    // Simular conexão após 2 segundos
    setTimeout(() => {
      setSyncStatus(prev => ({ ...prev, isConnected: true }));
    }, 2000);
    
    // Load sync errors
    fetchSyncErrors();
  }, [router]);

  const fetchSyncErrors = async () => {
    try {
      const response = await fetch('/api/hikvision/sync-errors');
      if (response.ok) {
        const data = await response.json();
        setSyncErrors(data.participantsWithErrors || []);
        if (data.statistics) {
          setSyncStatus(prev => ({
            ...prev,
            syncedCount: data.statistics.synced || 0,
            failedCount: data.statistics.failed || 0,
            pendingCount: data.statistics.pending || 0,
            totalParticipants: (data.statistics.synced || 0) + (data.statistics.failed || 0) + (data.statistics.pending || 0)
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching sync errors:', error);
    }
  };

  const calculatePercentage = (value: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  };

  const handleSync = () => {
    setSyncing(true);
    setMessage({ type: 'info', text: 'Sincronizando participantes...' });
    
    setTimeout(() => {
      setSyncing(false);
      setMessage({ type: 'success', text: 'Sincronização concluída com sucesso!' });
      setSyncStatus(prev => ({
        ...prev,
        syncedCount: prev.syncedCount + 5,
        pendingCount: Math.max(0, prev.pendingCount - 5),
        lastSyncDate: new Date().toISOString()
      }));
    }, 3000);
  };

  if (!isAuthenticated) {
    return null; // Or a loading spinner
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #7CC69B 0%, #16a34a 100%)' }}>
      {/* Header Moderno */}
      <div style={{ background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <Link href="/admin">
                <button style={{
                  background: 'linear-gradient(135deg, #7CC69B 0%, #16a34a 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
                  transition: 'all 0.3s ease'
                }}>
                  ← Voltar
                </button>
              </Link>
              
              <div>
                <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: 0, color: '#1a202c' }}>
                  🎥 Hikvision DS-K1T671M-L
                </h1>
                <p style={{ color: '#718096', margin: '5px 0 0 0', fontSize: '14px' }}>
                  Terminal de Reconhecimento Facial - IP: 192.168.1.20
                </p>
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 24px',
              background: syncStatus.isConnected 
                ? 'linear-gradient(135deg, #00b09b 0%, #96c93d 100%)' 
                : 'linear-gradient(135deg, #fc5c7d 0%, #eb3349 100%)',
              borderRadius: '50px',
              boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
            }}>
              <div style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: 'white',
                animation: 'pulse 2s infinite'
              }}></div>
              <span style={{ color: 'white', fontWeight: 'bold', fontSize: '14px' }}>
                {syncStatus.isConnected ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
          </div>

          {/* Tabs Modernos */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            {[
              { id: 'dashboard', label: '📊 Dashboard', color: '#667eea' },
              { id: 'sync', label: '🔄 Sincronização', color: '#00b09b' },
              { id: 'logs', label: '📋 Histórico', color: '#f093fb' },
              { id: 'errors', label: '⚠️ Erros', color: '#fc5c7d' },
              { id: 'settings', label: '⚙️ Configurações', color: '#fa8231' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  padding: '12px 24px',
                  background: activeTab === tab.id 
                    ? `linear-gradient(135deg, ${tab.color} 0%, ${tab.color}dd 100%)`
                    : 'white',
                  color: activeTab === tab.id ? 'white' : '#4a5568',
                  border: `2px solid ${activeTab === tab.id ? tab.color : '#e2e8f0'}`,
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  transition: 'all 0.3s ease',
                  boxShadow: activeTab === tab.id ? '0 4px 15px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mensagem de Feedback */}
      {message && (
        <div style={{
          maxWidth: '1400px',
          margin: '20px auto',
          padding: '0 20px'
        }}>
          <div style={{
            padding: '16px 24px',
            background: message.type === 'success' 
              ? 'linear-gradient(135deg, #00b09b 0%, #96c93d 100%)'
              : message.type === 'error'
              ? 'linear-gradient(135deg, #fc5c7d 0%, #eb3349 100%)'
              : 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            borderRadius: '12px',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
          }}>
            <span style={{ fontWeight: 'bold', fontSize: '16px' }}>{message.text}</span>
            <button 
              onClick={() => setMessage(null)}
              style={{ 
                background: 'rgba(255,255,255,0.2)', 
                border: 'none', 
                color: 'white',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                cursor: 'pointer',
                fontSize: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <>
            {/* Cards de Estatísticas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '30px' }}>
              {[
                {
                  title: 'Total de Participantes',
                  value: syncStatus.totalParticipants,
                  icon: '👥',
                  gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  percentage: 100
                },
                {
                  title: 'Sincronizados',
                  value: syncStatus.syncedCount,
                  icon: '✅',
                  gradient: 'linear-gradient(135deg, #00b09b 0%, #96c93d 100%)',
                  percentage: calculatePercentage(syncStatus.syncedCount, syncStatus.totalParticipants)
                },
                {
                  title: 'Pendentes',
                  value: syncStatus.pendingCount,
                  icon: '⏳',
                  gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                  percentage: calculatePercentage(syncStatus.pendingCount, syncStatus.totalParticipants)
                },
                {
                  title: 'Falhas',
                  value: syncStatus.failedCount,
                  icon: '⚠️',
                  gradient: 'linear-gradient(135deg, #fc5c7d 0%, #eb3349 100%)',
                  percentage: calculatePercentage(syncStatus.failedCount, syncStatus.totalParticipants)
                }
              ].map((stat, index) => (
                <div key={index} style={{
                  background: 'white',
                  borderRadius: '20px',
                  padding: '24px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'transform 0.3s ease',
                  cursor: 'pointer'
                }}>
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: stat.gradient
                  }}></div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div>
                      <p style={{ color: '#718096', fontSize: '14px', margin: '0 0 8px 0' }}>{stat.title}</p>
                      <h2 style={{ fontSize: '36px', fontWeight: 'bold', margin: 0, color: '#1a202c' }}>{stat.value}</h2>
                    </div>
                    <div style={{
                      width: '60px',
                      height: '60px',
                      background: stat.gradient,
                      borderRadius: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '28px',
                      boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
                    }}>
                      {stat.icon}
                    </div>
                  </div>
                  
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', color: '#718096' }}>Progresso</span>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#4a5568' }}>{stat.percentage}%</span>
                    </div>
                    <div style={{
                      height: '8px',
                      background: '#e2e8f0',
                      borderRadius: '10px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${stat.percentage}%`,
                        height: '100%',
                        background: stat.gradient,
                        borderRadius: '10px',
                        transition: 'width 1s ease'
                      }}></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Gráfico Visual */}
            <div style={{
              background: 'white',
              borderRadius: '20px',
              padding: '30px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
              marginBottom: '30px'
            }}>
              <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px', color: '#1a202c' }}>
                📈 Análise de Sincronização
              </h3>
              
              <div style={{ display: 'flex', gap: '40px', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ position: 'relative', width: '200px', height: '200px', margin: '0 auto' }}>
                    <svg width="200" height="200" style={{ transform: 'rotate(-90deg)' }}>
                      <circle
                        cx="100"
                        cy="100"
                        r="80"
                        stroke="#e2e8f0"
                        strokeWidth="20"
                        fill="none"
                      />
                      <circle
                        cx="100"
                        cy="100"
                        r="80"
                        stroke="url(#gradient)"
                        strokeWidth="20"
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 80 * 0.67} ${2 * Math.PI * 80}`}
                        strokeLinecap="round"
                      />
                      <defs>
                        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#667eea" />
                          <stop offset="100%" stopColor="#764ba2" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#1a202c' }}>67%</div>
                      <div style={{ fontSize: '14px', color: '#718096' }}>Concluído</div>
                    </div>
                  </div>
                </div>
                
                <div style={{ flex: 2 }}>
                  <div style={{ display: 'grid', gap: '16px' }}>
                    {[
                      { label: 'Taxa de Sucesso', value: '94.1%', color: '#00b09b' },
                      { label: 'Tempo Médio', value: '2.3s', color: '#667eea' },
                      { label: 'Última Sincronização', value: 'Há 5 minutos', color: '#f093fb' },
                      { label: 'Próxima Sincronização', value: 'Em 25 minutos', color: '#fa8231' }
                    ].map((item, index) => (
                      <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: item.color
                          }}></div>
                          <span style={{ color: '#4a5568', fontSize: '14px' }}>{item.label}</span>
                        </div>
                        <span style={{ fontWeight: 'bold', color: '#1a202c', fontSize: '16px' }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Sync Tab */}
        {activeTab === 'sync' && (
          <div style={{
            background: 'white',
            borderRadius: '20px',
            padding: '30px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '30px', color: '#1a202c' }}>
              🚀 Central de Sincronização
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              {[
                {
                  title: 'Sincronização Completa',
                  description: 'Sincronizar todos os participantes pendentes',
                  icon: '📤',
                  color: '#667eea',
                  action: 'Sincronizar Todos'
                },
                {
                  title: 'Sincronização Seletiva',
                  description: 'Escolher participantes específicos',
                  icon: '🎯',
                  color: '#00b09b',
                  action: 'Selecionar'
                },
                {
                  title: 'Sincronização Incremental',
                  description: 'Apenas novos registros',
                  icon: '➕',
                  color: '#f093fb',
                  action: 'Incrementar'
                }
              ].map((option, index) => (
                <div key={index} style={{
                  border: '2px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '24px',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer'
                }}>
                  <div style={{
                    width: '60px',
                    height: '60px',
                    background: `linear-gradient(135deg, ${option.color} 0%, ${option.color}dd 100%)`,
                    borderRadius: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '28px',
                    marginBottom: '20px',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
                  }}>
                    {option.icon}
                  </div>
                  
                  <h4 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', color: '#1a202c' }}>
                    {option.title}
                  </h4>
                  <p style={{ color: '#718096', fontSize: '14px', marginBottom: '20px', lineHeight: '1.6' }}>
                    {option.description}
                  </p>
                  
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: syncing 
                        ? '#cbd5e0'
                        : `linear-gradient(135deg, ${option.color} 0%, ${option.color}dd 100%)`,
                      color: 'white',
                      border: 'none',
                      borderRadius: '12px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: syncing ? 'not-allowed' : 'pointer',
                      transition: 'all 0.3s ease',
                      boxShadow: syncing ? 'none' : '0 4px 15px rgba(0,0,0,0.1)'
                    }}
                  >
                    {syncing ? '⏳ Processando...' : option.action}
                  </button>
                </div>
              ))}
            </div>
            
            {/* Status de Progresso */}
            {syncing && (
              <div style={{
                marginTop: '30px',
                padding: '20px',
                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                borderRadius: '16px',
                color: 'white'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    border: '3px solid white',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }}></div>
                  <span style={{ fontSize: '16px', fontWeight: 'bold' }}>Sincronização em andamento...</span>
                </div>
                <div style={{
                  height: '8px',
                  background: 'rgba(255,255,255,0.3)',
                  borderRadius: '10px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: '60%',
                    height: '100%',
                    background: 'white',
                    borderRadius: '10px',
                    animation: 'progress 2s ease infinite'
                  }}></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div style={{
            background: 'white',
            borderRadius: '20px',
            padding: '30px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '30px', color: '#1a202c' }}>
              📜 Histórico de Sincronizações
            </h3>
            
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 10px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#718096', fontSize: '14px', fontWeight: '600' }}>Data/Hora</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#718096', fontSize: '14px', fontWeight: '600' }}>Tipo</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#718096', fontSize: '14px', fontWeight: '600' }}>Participante</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#718096', fontSize: '14px', fontWeight: '600' }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#718096', fontSize: '14px', fontWeight: '600' }}>Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { date: '19/08/2025 10:45', type: 'Individual', participant: 'João Silva', status: 'success', details: 'ID: HC-001' },
                    { date: '19/08/2025 10:30', type: 'Lote', participant: '50 participantes', status: 'partial', details: '48 sucesso, 2 falhas' },
                    { date: '19/08/2025 10:15', type: 'Individual', participant: 'Maria Santos', status: 'error', details: 'Timeout' },
                    { date: '19/08/2025 10:00', type: 'Completa', participant: '127 participantes', status: 'success', details: 'Todos sincronizados' },
                    { date: '19/08/2025 09:45', type: 'Individual', participant: 'Pedro Costa', status: 'success', details: 'ID: HC-002' }
                  ].map((log, index) => (
                    <tr key={index} style={{
                      background: '#f7fafc',
                      borderRadius: '12px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }}>
                      <td style={{ padding: '16px', borderRadius: '12px 0 0 12px' }}>
                        <span style={{ color: '#4a5568', fontSize: '14px' }}>{log.date}</span>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{
                          padding: '6px 12px',
                          background: log.type === 'Individual' ? '#e6fffa' : log.type === 'Lote' ? '#f0ebff' : '#fff5f5',
                          color: log.type === 'Individual' ? '#00b09b' : log.type === 'Lote' ? '#667eea' : '#fc5c7d',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}>
                          {log.type}
                        </span>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{ color: '#1a202c', fontSize: '14px', fontWeight: '600' }}>{log.participant}</span>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            fontSize: '20px'
                          }}>
                            {log.status === 'success' ? '✅' : log.status === 'error' ? '❌' : '⚠️'}
                          </span>
                          <span style={{
                            color: log.status === 'success' ? '#00b09b' : log.status === 'error' ? '#fc5c7d' : '#f093fb',
                            fontSize: '14px',
                            fontWeight: 'bold'
                          }}>
                            {log.status === 'success' ? 'Sucesso' : log.status === 'error' ? 'Erro' : 'Parcial'}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '16px', borderRadius: '0 12px 12px 0' }}>
                        <span style={{ color: '#718096', fontSize: '13px' }}>{log.details}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Errors Tab */}
        {activeTab === 'errors' && (
          <div style={{
            background: 'white',
            borderRadius: '20px',
            padding: '30px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '30px', color: '#1a202c' }}>
              ⚠️ Erros de Sincronização
            </h3>
            
            {syncErrors.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px',
                background: '#f7fafc',
                borderRadius: '16px'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
                <h4 style={{ fontSize: '20px', color: '#4a5568', marginBottom: '10px' }}>
                  Nenhum erro encontrado
                </h4>
                <p style={{ color: '#718096' }}>
                  Todos os participantes aprovados foram sincronizados com sucesso
                </p>
              </div>
            ) : (
              <>
                <div style={{
                  padding: '16px',
                  background: 'linear-gradient(135deg, #fc5c7d15 0%, #eb334915 100%)',
                  borderRadius: '12px',
                  border: '2px solid #fc5c7d30',
                  marginBottom: '24px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>⚠️</span>
                    <div>
                      <h4 style={{ fontSize: '16px', fontWeight: 'bold', color: '#fc5c7d', marginBottom: '4px' }}>
                        {syncErrors.length} participante{syncErrors.length > 1 ? 's' : ''} com erro de sincronização
                      </h4>
                      <p style={{ fontSize: '14px', color: '#718096' }}>
                        Verifique a conexão com o terminal Hikvision e tente reenviar
                      </p>
                    </div>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 10px' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '12px', color: '#718096', fontSize: '14px', fontWeight: '600' }}>Participante</th>
                        <th style={{ textAlign: 'left', padding: '12px', color: '#718096', fontSize: '14px', fontWeight: '600' }}>CPF</th>
                        <th style={{ textAlign: 'left', padding: '12px', color: '#718096', fontSize: '14px', fontWeight: '600' }}>Data Aprovação</th>
                        <th style={{ textAlign: 'left', padding: '12px', color: '#718096', fontSize: '14px', fontWeight: '600' }}>Erro</th>
                        <th style={{ textAlign: 'center', padding: '12px', color: '#718096', fontSize: '14px', fontWeight: '600' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {syncErrors.map((error, index) => (
                        <tr key={error.id} style={{
                          background: '#fff5f5',
                          borderRadius: '12px',
                          boxShadow: '0 2px 4px rgba(252, 92, 125, 0.1)'
                        }}>
                          <td style={{ padding: '16px', borderRadius: '12px 0 0 12px' }}>
                            <span style={{ color: '#1a202c', fontSize: '14px', fontWeight: '600' }}>{error.name}</span>
                          </td>
                          <td style={{ padding: '16px' }}>
                            <span style={{ color: '#4a5568', fontSize: '14px' }}>{error.cpf}</span>
                          </td>
                          <td style={{ padding: '16px' }}>
                            <span style={{ color: '#718096', fontSize: '13px' }}>
                              {error.approvedAt ? new Date(error.approvedAt).toLocaleDateString('pt-BR') : '-'}
                            </span>
                          </td>
                          <td style={{ padding: '16px' }}>
                            <div style={{
                              background: '#fc5c7d20',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              color: '#fc5c7d',
                              maxWidth: '300px'
                            }}>
                              {error.hikCentralErrorMsg || 'Erro desconhecido'}
                            </div>
                          </td>
                          <td style={{ padding: '16px', borderRadius: '0 12px 12px 0' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                              <button
                                onClick={() => {
                                  setMessage({ type: 'info', text: `Reenviando ${error.name} para o terminal...` });
                                  setTimeout(() => {
                                    setMessage({ type: 'success', text: `${error.name} reenviado com sucesso!` });
                                    fetchSyncErrors();
                                  }, 2000);
                                }}
                                style={{
                                  padding: '8px 16px',
                                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '8px',
                                  fontSize: '12px',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  transition: 'all 0.3s ease'
                                }}
                              >
                                🔄 Reenviar
                              </button>
                              <button
                                onClick={() => {
                                  window.location.href = '/admin/approvals';
                                }}
                                style={{
                                  padding: '8px 16px',
                                  background: 'white',
                                  color: '#4a5568',
                                  border: '2px solid #e2e8f0',
                                  borderRadius: '8px',
                                  fontSize: '12px',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  transition: 'all 0.3s ease'
                                }}
                              >
                                📝 Detalhes
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{
                  marginTop: '24px',
                  padding: '16px',
                  background: '#f7fafc',
                  borderRadius: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>
                      Dica de Resolução
                    </h4>
                    <p style={{ fontSize: '13px', color: '#718096' }}>
                      Verifique se o terminal Hikvision está online e acessível na rede
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setMessage({ type: 'info', text: 'Reenviando todos os participantes com erro...' });
                      setTimeout(() => {
                        setMessage({ type: 'success', text: 'Todos os participantes foram reenviados!' });
                        fetchSyncErrors();
                      }, 3000);
                    }}
                    style={{
                      padding: '10px 20px',
                      background: 'linear-gradient(135deg, #fc5c7d 0%, #eb3349 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      boxShadow: '0 4px 15px rgba(252, 92, 125, 0.3)',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    🔄 Reenviar Todos
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div style={{
            background: 'white',
            borderRadius: '20px',
            padding: '30px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '30px', color: '#1a202c' }}>
              ⚙️ Configurações do Sistema
            </h3>
            
            <div style={{ display: 'grid', gap: '24px', maxWidth: '800px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: '#4a5568', fontSize: '14px', fontWeight: '600' }}>
                  URL do Servidor HikCentral
                </label>
                <input
                  type="text"
                  placeholder="https://hikcental.example.com"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '2px solid #e2e8f0',
                    borderRadius: '12px',
                    fontSize: '14px',
                    transition: 'all 0.3s ease'
                  }}
                />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#4a5568', fontSize: '14px', fontWeight: '600' }}>
                    API Key
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••••••••••"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '2px solid #e2e8f0',
                      borderRadius: '12px',
                      fontSize: '14px',
                      transition: 'all 0.3s ease'
                    }}
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#4a5568', fontSize: '14px', fontWeight: '600' }}>
                    Secret Key
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••••••••••"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '2px solid #e2e8f0',
                      borderRadius: '12px',
                      fontSize: '14px',
                      transition: 'all 0.3s ease'
                    }}
                  />
                </div>
              </div>
              
              <div style={{
                padding: '20px',
                background: 'linear-gradient(135deg, #667eea15 0%, #764ba215 100%)',
                borderRadius: '16px',
                border: '2px solid #667eea30'
              }}>
                <h4 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1a202c' }}>
                  🔄 Sincronização Automática
                </h4>
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <span style={{ color: '#4a5568', fontSize: '14px' }}>Ativar sincronização automática</span>
                  <label style={{ position: 'relative', display: 'inline-block', width: '60px', height: '32px' }}>
                    <input type="checkbox" style={{ opacity: 0, width: 0, height: 0 }} />
                    <span style={{
                      position: 'absolute',
                      cursor: 'pointer',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: '#cbd5e0',
                      transition: '0.4s',
                      borderRadius: '34px'
                    }}>
                      <span style={{
                        position: 'absolute',
                        content: '',
                        height: '26px',
                        width: '26px',
                        left: '3px',
                        bottom: '3px',
                        background: 'white',
                        transition: '0.4s',
                        borderRadius: '50%'
                      }}></span>
                    </span>
                  </label>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: '#4a5568', fontSize: '13px' }}>
                      Intervalo (minutos)
                    </label>
                    <input
                      type="number"
                      defaultValue="30"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '2px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: '#4a5568', fontSize: '13px' }}>
                      Tamanho do Lote
                    </label>
                    <input
                      type="number"
                      defaultValue="100"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '2px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                <button style={{
                  padding: '14px 32px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
                  transition: 'all 0.3s ease'
                }}>
                  💾 Salvar Configurações
                </button>
                
                <button style={{
                  padding: '14px 32px',
                  background: 'white',
                  color: '#4a5568',
                  border: '2px solid #e2e8f0',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}>
                  Testar Conexão
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        
        input:focus {
          outline: none;
          border-color: #667eea !important;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1) !important;
        }
        
        button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.15) !important;
        }
        
        tr:hover {
          transform: translateX(4px);
        }
      `}</style>
    </div>
  );
}