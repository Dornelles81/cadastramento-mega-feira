'use client'

import { useState, useEffect } from 'react'

interface Participant {
  id: string
  name: string
  cpf: string
  email?: string
  phone?: string
  faceImageUrl?: string
  faceData?: any
  approvalStatus: string
  hikCentralSyncStatus?: string
  hikCentralPersonId?: string
  hikCentralSyncedAt?: string
  standCode?: string
  createdAt: string
}

export default function HikCentralPage() {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [approvedCount, setApprovedCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [isPasswordValid, setIsPasswordValid] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Página protegida pelo middleware NextAuth (/admin/*) — sem gate de senha local
  useEffect(() => {
    setIsPasswordValid(true)
    loadParticipants()
  }, [])

  const loadParticipants = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/participants-full')
      if (response.ok) {
        const data = await response.json()
        const approvedParticipants = data.participants?.filter((p: Participant) =>
          p.approvalStatus === 'approved'
        ) || []
        setParticipants(approvedParticipants)
        setApprovedCount(approvedParticipants.length)
      }
    } catch (error) {
      console.error('Error loading participants:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleExportAll = async () => {
    setExporting(true)
    try {
      // Criar links temporários para forçar download
      const downloadFile = (url: string, filename: string) => {
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        link.style.display = 'none'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }

      // Download Excel
      downloadFile('/api/admin/export-hikcentral?format=excel', `hikcentral-import-${new Date().toISOString().split('T')[0]}.xlsx`)

      // Wait 1.5 seconds and download Photos
      setTimeout(() => {
        downloadFile('/api/admin/export-hikcentral?format=photos', `hikcentral-photos-${new Date().toISOString().split('T')[0]}.zip`)

        setTimeout(() => {
          setExporting(false)
          alert('✅ Arquivos exportados com sucesso!\n\n📋 Próximos passos:\n1. Verifique a pasta Downloads - devem ter 2 arquivos\n2. Extraia as fotos do ZIP\n3. Abra o HikCentral (botão abaixo)\n4. Siga as instruções de importação')
          setShowInstructions(true)
        }, 500)
      }, 1500)
    } catch (error) {
      console.error('Export error:', error)
      alert('❌ Erro ao exportar arquivos. Tente novamente.')
      setExporting(false)
    }
  }

  const openHikCentral = () => {
    window.open('https://127.0.0.1', '_blank')
  }

  if (!isPasswordValid) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p>Redirecionando para login...</p>
          <a href="/admin" className="text-blue-600 hover:underline">
            Clique aqui se não for redirecionado
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                <span className="text-4xl">🔗</span>
                Integração HikCentral Professional
              </h1>
              <p className="text-gray-600 mt-2">
                Sincronize participantes aprovados com o sistema de reconhecimento facial
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={openHikCentral}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                🌐 Abrir HikCentral
              </button>
              <a
                href="/admin"
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                ← Voltar
              </a>
            </div>
          </div>
        </div>

        {/* Quick Action Card */}
        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg shadow-xl p-8 mb-6 text-white">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold mb-2">
                ⚡ Exportação Rápida
              </h2>
              <p className="text-green-100 text-lg">
                {approvedCount} participante{approvedCount !== 1 ? 's' : ''} aprovado{approvedCount !== 1 ? 's' : ''} pronto{approvedCount !== 1 ? 's' : ''} para sincronização
              </p>
              <div className="mt-3 flex gap-2 flex-wrap">
                <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm">
                  ✓ Fotos faciais incluídas
                </span>
                <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm">
                  ✓ Formato oficial HikCentral
                </span>
                <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm">
                  ✓ Pronto para importação
                </span>
              </div>
            </div>
            <button
              onClick={handleExportAll}
              disabled={exporting || approvedCount === 0}
              className="px-8 py-4 bg-white text-green-600 rounded-lg hover:bg-gray-100 transition-all disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed font-bold text-lg shadow-lg hover:shadow-xl transform hover:scale-105 flex items-center gap-3"
            >
              {exporting ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Exportando...
                </>
              ) : (
                <>
                  <span className="text-2xl">⬇️</span>
                  Exportar Tudo Agora
                </>
              )}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">📊 Estatísticas</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-3xl mb-2">✅</div>
              <div className="text-2xl font-bold text-green-800">
                {loading ? '...' : approvedCount}
              </div>
              <div className="text-green-600">Participantes Aprovados</div>
              <div className="text-sm text-green-500 mt-1">
                Prontos para exportação
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-3xl mb-2">📁</div>
              <div className="text-lg font-semibold text-gray-700">
                2 arquivos serão gerados
              </div>
              <div className="text-sm text-gray-600 mt-2">
                • Person Information Template.xlsx<br/>
                • photos.zip
              </div>
            </div>
          </div>
        </div>

        {/* Export Options */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            💾 Opções de Exportação
          </h2>

          <div className="space-y-4">
            {/* Excel Export */}
            <div className="border rounded-lg p-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-gray-800">
                    📄 Exportar Excel (Template HikCentral)
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Gera arquivo Excel no formato oficial do HikCentral com todos os {approvedCount} participantes aprovados
                  </p>
                </div>
                <a
                  href="/api/admin/export-hikcentral?format=excel"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Baixar Excel
                </a>
              </div>
            </div>

            {/* Photos Export */}
            <div className="border rounded-lg p-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-gray-800">
                    📸 Exportar Fotos (ZIP)
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Gera arquivo ZIP com as fotos dos {approvedCount} participantes (formato: CPF_Nome.jpg)
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    💡 Use CPF como First Name e Nome como Last Name ao importar no HikCentral
                  </p>
                </div>
                <a
                  href="/api/admin/export-hikcentral?format=photos"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Baixar Fotos
                </a>
              </div>
            </div>

            {/* CSV Reference */}
            <div className="border rounded-lg p-4 bg-blue-50">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-gray-800">
                    📄 Lista de Referência (CSV)
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Tabela com ID, CPF (First Name) e Nome (Last Name) para consulta rápida
                  </p>
                </div>
                <a
                  href="/api/admin/export-hikcentral?format=csv"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Baixar CSV
                </a>
              </div>
            </div>

            {/* Complete Package */}
            <div className="border-2 border-yellow-400 bg-yellow-50 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-gray-800">
                    📦 Pacote Completo (Excel + Fotos)
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Baixa todos os arquivos necessários para importação no HikCentral
                  </p>
                  <div className="flex gap-2 mt-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      {approvedCount} aprovados
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      Formato oficial
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleExportAll}
                  disabled={exporting || approvedCount === 0}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  ⬇️ Baixar Tudo
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Participants List */}
        {participants.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <span>👥</span>
              Participantes Aprovados ({participants.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
              {participants.slice(0, 20).map((participant) => (
                <div key={participant.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex gap-3">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                      {participant.faceImageUrl ? (
                        <img
                          src={participant.faceImageUrl}
                          alt={participant.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-2xl">
                          👤
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-800 truncate">{participant.name}</h3>
                      <p className="text-sm text-gray-600">CPF: {participant.cpf}</p>
                      {participant.standCode && (
                        <p className="text-xs text-blue-600 mt-1">
                          {participant.standCode}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {participants.length > 20 && (
              <p className="text-center text-gray-500 text-sm mt-4">
                E mais {participants.length - 20} participante(s)...
              </p>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-lg p-6 mt-6">
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="w-full flex justify-between items-center text-left"
          >
            <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              <span>📋</span>
              Guia de Importação no HikCentral
            </h2>
            <span className="text-2xl">{showInstructions ? '▲' : '▼'}</span>
          </button>

          {showInstructions && (
            <div className="mt-6 space-y-6">
              {/* Step 1 */}
              <div className="bg-white rounded-lg p-4 border-l-4 border-blue-500">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                    1
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800 mb-2">Exportar Arquivos</h3>
                    <p className="text-gray-700 mb-2">
                      Clique no botão <strong>"⬇️ Exportar Tudo Agora"</strong> acima para baixar:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-gray-600 ml-4">
                      <li>📄 <strong>hikcentral-import-YYYY-MM-DD.xlsx</strong> - Planilha com dados dos participantes</li>
                      <li>📦 <strong>hikcentral-photos-YYYY-MM-DD.zip</strong> - Arquivo ZIP com as fotos faciais</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="bg-white rounded-lg p-4 border-l-4 border-green-500">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                    2
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800 mb-2">Extrair Fotos</h3>
                    <p className="text-gray-700 mb-2">
                      Extraia o conteúdo do arquivo ZIP para uma pasta no seu computador:
                    </p>
                    <div className="bg-gray-50 rounded p-3 font-mono text-sm text-gray-700">
                      C:\HikCentral\Import\Photos\
                    </div>
                    <p className="text-sm text-gray-600 mt-2">
                      💡 Dica: As fotos já estão nomeadas com o CPF do participante (formato exigido pelo HikCentral)
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="bg-white rounded-lg p-4 border-l-4 border-yellow-500">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-yellow-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                    3
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800 mb-2">Abrir HikCentral</h3>
                    <p className="text-gray-700 mb-3">
                      Acesse o HikCentral Professional:
                    </p>
                    <button
                      onClick={openHikCentral}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                    >
                      <span>🌐</span>
                      Abrir HikCentral (https://127.0.0.1)
                    </button>
                    <p className="text-sm text-gray-600 mt-3">
                      📍 Navegue até: <strong>Person</strong> → <strong>Person Management</strong>
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="bg-white rounded-lg p-4 border-l-4 border-purple-500">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                    4
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800 mb-2">Importar Dados</h3>
                    <p className="text-gray-700 mb-2">
                      No HikCentral, siga estes passos:
                    </p>
                    <ol className="list-decimal list-inside space-y-2 text-gray-600 ml-4">
                      <li>Clique em <strong>"Import"</strong> ou <strong>"Batch Import"</strong></li>
                      <li>Selecione o arquivo Excel <strong>hikcentral-import-*.xlsx</strong></li>
                      <li>Configure o caminho da pasta com as fotos extraídas</li>
                      <li>Verifique o mapeamento das colunas:
                        <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
                          <li><strong>Employee No.</strong> → ID/CPF do participante</li>
                          <li><strong>Name</strong> → Nome completo</li>
                          <li><strong>Valid Begin/End Time</strong> → Período de validade</li>
                        </ul>
                      </li>
                      <li>Clique em <strong>"Import"</strong> e aguarde o processamento</li>
                    </ol>
                  </div>
                </div>
              </div>

              {/* Step 5 */}
              <div className="bg-white rounded-lg p-4 border-l-4 border-red-500">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                    5
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800 mb-2">Verificar Importação</h3>
                    <p className="text-gray-700 mb-2">
                      Após a importação, verifique:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-gray-600 ml-4">
                      <li>✅ Todos os participantes foram importados</li>
                      <li>✅ As fotos faciais estão associadas corretamente</li>
                      <li>✅ Os períodos de validade estão configurados (90 dias)</li>
                      <li>✅ O log de importação não apresenta erros</li>
                    </ul>
                    <div className="mt-3 bg-green-50 border border-green-200 rounded p-3">
                      <p className="text-green-800 text-sm">
                        <strong>✓ Pronto!</strong> Os participantes agora podem usar o reconhecimento facial nos terminais de acesso.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Troubleshooting */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="font-semibold text-yellow-800 mb-2 flex items-center gap-2">
                  <span>⚠️</span>
                  Problemas Comuns
                </h3>
                <ul className="space-y-2 text-yellow-700 text-sm">
                  <li>
                    <strong>Fotos não aparecem:</strong> Verifique se o caminho da pasta está correto e se os nomes dos arquivos correspondem ao Employee No.
                  </li>
                  <li>
                    <strong>Erro de formato:</strong> Certifique-se de que está usando o arquivo Excel (.xlsx) gerado pelo sistema
                  </li>
                  <li>
                    <strong>Dados duplicados:</strong> Se o participante já existe no HikCentral, ele será atualizado automaticamente
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}