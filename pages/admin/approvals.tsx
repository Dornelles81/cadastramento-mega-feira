import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

interface Participant {
  id: string;
  name: string;
  cpf: string;
  email: string;
  phone: string;
  createdAt: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvedAt?: string;
  approvedBy?: string;
  rejectionReason?: string;
  hikCentralSyncStatus?: string;
  hikCentralErrorMsg?: string;
  faceImageUrl?: string;
}

export default function ApprovalsAdmin() {
  const router = useRouter();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [rejectionModal, setRejectionModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);

  useEffect(() => {
    // Check if we have password in URL params (from admin page)
    const urlParams = new URLSearchParams(window.location.search);
    const passwordFromUrl = urlParams.get('auth');
    
    if (passwordFromUrl) {
      sessionStorage.setItem('adminPassword', passwordFromUrl);
      // Remove auth from URL for security
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    fetchParticipants();
  }, []);

  const fetchParticipants = async () => {
    try {
      const password = sessionStorage.getItem('adminPassword') || 'admin123';
      if (!password) {
        router.push('/admin');
        return;
      }

      const response = await fetch('/api/admin/participants-with-approval', {
        headers: {
          'Authorization': `Bearer ${password}`
        }
      });

      if (!response.ok) throw new Error('Failed to fetch participants');

      const data = await response.json();
      setParticipants(data.participants || []);
    } catch (error) {
      console.error('Error fetching participants:', error);
      setMessage({ type: 'error', text: 'Erro ao carregar participantes' });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (participant: Participant) => {
    setProcessing(true);
    setMessage({ type: 'info', text: `Aprovando ${participant.name} e enviando para Hikvision...` });

    try {
      const password = sessionStorage.getItem('adminPassword');
      const response = await fetch('/api/admin/approve-participant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${password}`
        },
        body: JSON.stringify({
          participantId: participant.id,
          action: 'approve'
        })
      });

      const result = await response.json();

      if (response.ok) {
        if (result.hikvisionSync === 'success') {
          setMessage({ type: 'success', text: `✅ ${participant.name} aprovado e sincronizado com sucesso!` });
        } else {
          setMessage({ type: 'error', text: `⚠️ ${participant.name} aprovado mas falha na sincronização: ${result.participant.hikCentralErrorMsg}` });
        }
        await fetchParticipants();
      } else {
        throw new Error(result.error || 'Erro ao aprovar');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Erro ao aprovar: ${error.message}` });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedParticipant || !rejectionReason.trim()) return;

    setProcessing(true);
    setRejectionModal(false);

    try {
      const password = sessionStorage.getItem('adminPassword');
      const response = await fetch('/api/admin/approve-participant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${password}`
        },
        body: JSON.stringify({
          participantId: selectedParticipant.id,
          action: 'reject',
          rejectionReason: rejectionReason
        })
      });

      const result = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: `❌ ${selectedParticipant.name} rejeitado` });
        await fetchParticipants();
      } else {
        throw new Error(result.error || 'Erro ao rejeitar');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Erro ao rejeitar: ${error.message}` });
    } finally {
      setProcessing(false);
      setRejectionReason('');
      setSelectedParticipant(null);
    }
  };

  const filteredParticipants = participants.filter(p => {
    if (filter === 'all') return true;
    return p.approvalStatus === filter;
  });

  const getStatusBadge = (participant: Participant) => {
    if (participant.approvalStatus === 'approved') {
      if (participant.hikCentralSyncStatus === 'synced') {
        return { icon: '✅', text: 'Aprovado e Sincronizado', color: '#00b09b' };
      } else if (participant.hikCentralSyncStatus === 'failed') {
        return { icon: '⚠️', text: 'Aprovado (Falha Sync)', color: '#f093fb' };
      }
      return { icon: '✅', text: 'Aprovado', color: '#00b09b' };
    } else if (participant.approvalStatus === 'rejected') {
      return { icon: '❌', text: 'Rejeitado', color: '#fc5c7d' };
    }
    return { icon: '⏳', text: 'Pendente', color: '#667eea' };
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #7CC69B 0%, #16a34a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'white', fontSize: '24px' }}>Carregando...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #7CC69B 0%, #16a34a 100%)' }}>
      {/* Header */}
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
                  fontWeight: 'bold'
                }}>
                  ← Voltar
                </button>
              </Link>
              
              <div>
                <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: 0, color: '#1a202c' }}>
                  ✅ Central de Aprovações
                </h1>
                <p style={{ color: '#718096', margin: '5px 0 0 0', fontSize: '14px' }}>
                  Aprovar participantes e enviar para terminal Hikvision
                </p>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#667eea' }}>
                  {participants.filter(p => p.approvalStatus === 'pending').length}
                </div>
                <div style={{ fontSize: '12px', color: '#718096' }}>Pendentes</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#00b09b' }}>
                  {participants.filter(p => p.approvalStatus === 'approved').length}
                </div>
                <div style={{ fontSize: '12px', color: '#718096' }}>Aprovados</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fc5c7d' }}>
                  {participants.filter(p => p.approvalStatus === 'rejected').length}
                </div>
                <div style={{ fontSize: '12px', color: '#718096' }}>Rejeitados</div>
              </div>
              <div style={{ marginLeft: '20px' }}>
                <button
                  onClick={async () => {
                    const password = sessionStorage.getItem('adminPassword');
                    window.open(`/api/admin/export-approved?format=xlsx&auth=${password}`, '_blank');
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #00b09b 0%, #96c93d 100%)',
                    color: 'white',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  title="Exportar aprovados para importar no HikCentral"
                >
                  📥 Exportar Excel
                </button>
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            {[
              { id: 'all', label: '📋 Todos', count: participants.length },
              { id: 'pending', label: '⏳ Pendentes', count: participants.filter(p => p.approvalStatus === 'pending').length },
              { id: 'approved', label: '✅ Aprovados', count: participants.filter(p => p.approvalStatus === 'approved').length },
              { id: 'rejected', label: '❌ Rejeitados', count: participants.filter(p => p.approvalStatus === 'rejected').length }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id as any)}
                style={{
                  padding: '12px 24px',
                  background: filter === tab.id 
                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    : 'white',
                  color: filter === tab.id ? 'white' : '#4a5568',
                  border: `2px solid ${filter === tab.id ? '#667eea' : '#e2e8f0'}`,
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {tab.label} <span style={{ opacity: 0.8 }}>({tab.count})</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Message */}
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
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontWeight: 'bold' }}>{message.text}</span>
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
                fontSize: '20px'
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Participants List */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
        <div style={{
          background: 'white',
          borderRadius: '20px',
          padding: '30px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
        }}>
          {filteredParticipants.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px' }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>📭</div>
              <h3 style={{ fontSize: '20px', color: '#4a5568', marginBottom: '10px' }}>
                Nenhum participante {filter !== 'all' ? filter === 'pending' ? 'pendente' : filter === 'approved' ? 'aprovado' : 'rejeitado' : ''}
              </h3>
              <p style={{ color: '#718096' }}>
                Os participantes aparecerão aqui quando se cadastrarem
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 10px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#718096', fontSize: '14px' }}>Foto</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#718096', fontSize: '14px' }}>Nome</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#718096', fontSize: '14px' }}>CPF</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#718096', fontSize: '14px' }}>Contato</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#718096', fontSize: '14px' }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#718096', fontSize: '14px' }}>Hikvision</th>
                    <th style={{ textAlign: 'center', padding: '12px', color: '#718096', fontSize: '14px' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParticipants.map((participant) => {
                    const status = getStatusBadge(participant);
                    return (
                      <tr key={participant.id} style={{
                        background: '#f7fafc',
                        borderRadius: '12px'
                      }}>
                        <td style={{ padding: '16px', borderRadius: '12px 0 0 12px' }}>
                          {participant.faceImageUrl ? (
                            <img 
                              src={participant.faceImageUrl} 
                              alt={participant.name}
                              style={{
                                width: '50px',
                                height: '50px',
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: '2px solid #e2e8f0'
                              }}
                            />
                          ) : (
                            <div style={{
                              width: '50px',
                              height: '50px',
                              borderRadius: '50%',
                              background: '#e2e8f0',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '24px'
                            }}>
                              👤
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '16px' }}>
                          <div style={{ fontWeight: 'bold', color: '#1a202c' }}>{participant.name}</div>
                          <div style={{ fontSize: '12px', color: '#718096' }}>
                            {new Date(participant.createdAt).toLocaleDateString('pt-BR')}
                          </div>
                        </td>
                        <td style={{ padding: '16px', color: '#4a5568' }}>{participant.cpf}</td>
                        <td style={{ padding: '16px' }}>
                          <div style={{ fontSize: '14px', color: '#4a5568' }}>{participant.email}</div>
                          <div style={{ fontSize: '12px', color: '#718096' }}>{participant.phone}</div>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <span style={{
                            padding: '6px 12px',
                            background: `${status.color}20`,
                            color: status.color,
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            {status.icon} {status.text}
                          </span>
                        </td>
                        <td style={{ padding: '16px' }}>
                          {participant.hikCentralSyncStatus === 'synced' && (
                            <span style={{ color: '#00b09b', fontSize: '12px' }}>✅ Sincronizado</span>
                          )}
                          {participant.hikCentralSyncStatus === 'failed' && (
                            <div>
                              <span style={{ color: '#fc5c7d', fontSize: '12px' }}>❌ Falha</span>
                              <div style={{ fontSize: '11px', color: '#718096', marginTop: '4px' }}>
                                {participant.hikCentralErrorMsg}
                              </div>
                            </div>
                          )}
                          {participant.hikCentralSyncStatus === 'pending' && (
                            <span style={{ color: '#667eea', fontSize: '12px' }}>⏳ Pendente</span>
                          )}
                        </td>
                        <td style={{ padding: '16px', borderRadius: '0 12px 12px 0' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            {participant.approvalStatus === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleApprove(participant)}
                                  disabled={processing}
                                  style={{
                                    padding: '8px 16px',
                                    background: processing ? '#cbd5e0' : 'linear-gradient(135deg, #00b09b 0%, #96c93d 100%)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    cursor: processing ? 'not-allowed' : 'pointer'
                                  }}
                                >
                                  Aprovar
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedParticipant(participant);
                                    setRejectionModal(true);
                                  }}
                                  disabled={processing}
                                  style={{
                                    padding: '8px 16px',
                                    background: processing ? '#cbd5e0' : 'linear-gradient(135deg, #fc5c7d 0%, #eb3349 100%)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    cursor: processing ? 'not-allowed' : 'pointer'
                                  }}
                                >
                                  Rejeitar
                                </button>
                              </>
                            )}
                            {participant.approvalStatus === 'approved' && participant.hikCentralSyncStatus === 'failed' && (
                              <button
                                onClick={() => handleApprove(participant)}
                                disabled={processing}
                                style={{
                                  padding: '8px 16px',
                                  background: processing ? '#cbd5e0' : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '8px',
                                  fontSize: '12px',
                                  fontWeight: 'bold',
                                  cursor: processing ? 'not-allowed' : 'pointer'
                                }}
                              >
                                Reenviar
                              </button>
                            )}
                            {participant.approvalStatus === 'rejected' && (
                              <div style={{ fontSize: '12px', color: '#718096' }}>
                                {participant.rejectionReason}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Rejection Modal */}
      {rejectionModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '20px',
            padding: '30px',
            maxWidth: '500px',
            width: '90%'
          }}>
            <h3 style={{ fontSize: '20px', marginBottom: '20px', color: '#1a202c' }}>
              Rejeitar Participante
            </h3>
            <p style={{ color: '#718096', marginBottom: '20px' }}>
              Informe o motivo da rejeição para {selectedParticipant?.name}:
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Digite o motivo da rejeição..."
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '12px',
                border: '2px solid #e2e8f0',
                borderRadius: '12px',
                fontSize: '14px',
                resize: 'vertical'
              }}
            />
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button
                onClick={handleReject}
                disabled={!rejectionReason.trim() || processing}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: !rejectionReason.trim() || processing 
                    ? '#cbd5e0' 
                    : 'linear-gradient(135deg, #fc5c7d 0%, #eb3349 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: !rejectionReason.trim() || processing ? 'not-allowed' : 'pointer'
                }}
              >
                Confirmar Rejeição
              </button>
              <button
                onClick={() => {
                  setRejectionModal(false);
                  setRejectionReason('');
                  setSelectedParticipant(null);
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'white',
                  color: '#4a5568',
                  border: '2px solid #e2e8f0',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}