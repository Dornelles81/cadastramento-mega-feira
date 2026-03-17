'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

interface Participant {
  id: string
  name: string
  cpf: string
  email?: string
  phone?: string
  faceImageUrl?: string
  approvalStatus: string
  standCode?: string
  createdAt: string
}

export default function HikCentralPage() {
  const { slug } = useParams()
  const router = useRouter()
  const { data: session, status } = useSession()

  const [participants, setParticipants] = useState<Participant[]>([])
  const [approvedCount, setApprovedCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [eventId, setEventId] = useState<string | null>(null)
  const [eventName, setEventName] = useState('')

  // Auth check
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/admin/login')
    }
  }, [status, router])

  // Load event info from session
  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      const user = session.user as any
      if (user.events && user.events.length > 0) {
        const userEvent = user.events.find((e: any) => e.slug === slug)
        if (userEvent) {
          setEventId(userEvent.id)
          setEventName(userEvent.name)
        }
      }
      // Super Admin fallback
      if (user.role === 'SUPER_ADMIN' && !eventId) {
        fetch(`/api/admin/eventos/${slug}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data?.event) {
              setEventId(data.event.id)
              setEventName(data.event.name)
            }
          })
          .catch(() => {})
      }
    }
  }, [status, session, slug, eventId])

  // Load participants when eventId is ready
  useEffect(() => {
    if (eventId) {
      loadParticipants()
    }
  }, [eventId])

  const loadParticipants = async () => {
    if (!eventId) return
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/participants-full?eventId=${eventId}`)
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

  const exportUrl = (format: string) =>
    `/api/admin/export-hikcentral?format=${format}${eventId ? `&eventId=${eventId}` : ''}`

  const handleExportAll = async () => {
    setExporting(true)
    try {
      const downloadFile = (url: string, filename: string) => {
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        link.style.display = 'none'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }

      const dateStr = new Date().toISOString().split('T')[0]
      downloadFile(exportUrl('excel'), `hikcentral-import-${dateStr}.xlsx`)

      setTimeout(() => {
        downloadFile(exportUrl('photos'), `hikcentral-photos-${dateStr}.zip`)
        setTimeout(() => {
          setExporting(false)
          alert('Arquivos exportados com sucesso!\n\nVerifique a pasta Downloads - devem ter 2 arquivos:\n1. Excel com dados dos participantes\n2. ZIP com as fotos faciais\n\nSiga as instrucoes de importacao abaixo.')
          setShowInstructions(true)
        }, 500)
      }, 1500)
    } catch (error) {
      console.error('Export error:', error)
      alert('Erro ao exportar arquivos. Tente novamente.')
      setExporting(false)
    }
  }

  const openHikCentral = () => {
    window.open('https://127.0.0.1', '_blank')
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">&#9881;</div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                <span className="text-4xl">&#128279;</span>
                HikCentral Professional
              </h1>
              <p className="text-gray-600 mt-2">
                Exportar participantes aprovados de <strong>{eventName || slug}</strong> para reconhecimento facial
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={openHikCentral}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                Abrir HikCentral
              </button>
              <a
                href={`/admin/eventos/${slug}`}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                &#8592; Voltar
              </a>
            </div>
          </div>
        </div>

        {/* Quick Action Card */}
        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg shadow-xl p-8 mb-6 text-white">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold mb-2">
                Exportacao Rapida
              </h2>
              <p className="text-green-100 text-lg">
                {loading ? '...' : approvedCount} participante{approvedCount !== 1 ? 's' : ''} aprovado{approvedCount !== 1 ? 's' : ''} pronto{approvedCount !== 1 ? 's' : ''} para sincronizacao
              </p>
              <div className="mt-3 flex gap-2 flex-wrap">
                <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm">
                  Fotos faciais incluidas
                </span>
                <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm">
                  Formato oficial HikCentral
                </span>
                <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm">
                  Pronto para importacao
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
                  <span className="animate-spin">&#8987;</span>
                  Exportando...
                </>
              ) : (
                <>
                  Exportar Tudo Agora
                </>
              )}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Estatisticas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-800">
                {loading ? '...' : approvedCount}
              </div>
              <div className="text-green-600">Participantes Aprovados</div>
              <div className="text-sm text-green-500 mt-1">Prontos para exportacao</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-lg font-semibold text-gray-700">
                2 arquivos serao gerados
              </div>
              <div className="text-sm text-gray-600 mt-2">
                &bull; Person Information Template.xlsx<br/>
                &bull; photos.zip
              </div>
            </div>
          </div>
        </div>

        {/* Export Options */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Opcoes de Exportacao</h2>
          <div className="space-y-4">
            {/* Excel Export */}
            <div className="border rounded-lg p-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-gray-800">Excel (Template HikCentral)</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Arquivo Excel no formato oficial com {approvedCount} participantes aprovados
                  </p>
                </div>
                <a
                  href={exportUrl('excel')}
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
                  <h3 className="font-semibold text-gray-800">Fotos (ZIP)</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Arquivo ZIP com as fotos dos {approvedCount} participantes (formato: CPF_Nome.jpg)
                  </p>
                </div>
                <a
                  href={exportUrl('photos')}
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
                  <h3 className="font-semibold text-gray-800">Lista de Referencia (CSV)</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Tabela com ID, CPF e Nome para consulta rapida
                  </p>
                </div>
                <a
                  href={exportUrl('csv')}
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
                  <h3 className="font-semibold text-gray-800">Pacote Completo (Excel + Fotos)</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Baixa todos os arquivos necessarios para importacao no HikCentral
                  </p>
                </div>
                <button
                  onClick={handleExportAll}
                  disabled={exporting || approvedCount === 0}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Baixar Tudo
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Participants List */}
        {participants.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
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
                          &#128100;
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-800 truncate">{participant.name}</h3>
                      <p className="text-sm text-gray-600">CPF: {participant.cpf}</p>
                      {participant.standCode && (
                        <p className="text-xs text-blue-600 mt-1">{participant.standCode}</p>
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
            <h2 className="text-xl font-semibold text-gray-800">
              Guia de Importacao no HikCentral
            </h2>
            <span className="text-2xl">{showInstructions ? '&#9650;' : '&#9660;'}</span>
          </button>

          {showInstructions && (
            <div className="mt-6 space-y-6">
              <div className="bg-white rounded-lg p-4 border-l-4 border-blue-500">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold flex-shrink-0">1</div>
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Exportar Arquivos</h3>
                    <p className="text-gray-700">Clique em <strong>&quot;Exportar Tudo Agora&quot;</strong> acima para baixar o Excel e o ZIP com fotos.</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-4 border-l-4 border-green-500">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold flex-shrink-0">2</div>
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Extrair Fotos</h3>
                    <p className="text-gray-700 mb-2">Extraia o ZIP para uma pasta local:</p>
                    <div className="bg-gray-50 rounded p-3 font-mono text-sm text-gray-700">C:\HikCentral\Import\Photos\</div>
                    <p className="text-sm text-gray-600 mt-2">As fotos ja estao nomeadas com o CPF (formato exigido pelo HikCentral)</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-4 border-l-4 border-yellow-500">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-yellow-500 text-white flex items-center justify-center font-bold flex-shrink-0">3</div>
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Abrir HikCentral</h3>
                    <p className="text-gray-700 mb-3">Acesse o HikCentral Professional e va em <strong>Person &gt; Person Management</strong></p>
                    <button
                      onClick={openHikCentral}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Abrir HikCentral (https://127.0.0.1)
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-4 border-l-4 border-purple-500">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center font-bold flex-shrink-0">4</div>
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Importar Dados</h3>
                    <ol className="list-decimal list-inside space-y-2 text-gray-600 ml-4">
                      <li>Clique em <strong>&quot;Import&quot;</strong> ou <strong>&quot;Batch Import&quot;</strong></li>
                      <li>Selecione o arquivo Excel <strong>hikcentral-import-*.xlsx</strong></li>
                      <li>Configure o caminho da pasta com as fotos extraidas</li>
                      <li>Verifique o mapeamento das colunas</li>
                      <li>Clique em <strong>&quot;Import&quot;</strong> e aguarde</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-4 border-l-4 border-red-500">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center font-bold flex-shrink-0">5</div>
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Verificar Importacao</h3>
                    <ul className="list-disc list-inside space-y-1 text-gray-600 ml-4">
                      <li>Todos os participantes foram importados</li>
                      <li>As fotos faciais estao associadas corretamente</li>
                      <li>Os periodos de validade estao configurados (90 dias)</li>
                      <li>O log de importacao nao apresenta erros</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
