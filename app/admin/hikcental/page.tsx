'use client'

import { useState, useEffect } from 'react'

export default function HikCentralPage() {
  const [approvedCount, setApprovedCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [isPasswordValid, setIsPasswordValid] = useState(false)

  // Check for saved password
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedPassword = sessionStorage.getItem('adminPassword')
      if (savedPassword === 'admin123') {
        setIsPasswordValid(true)
        loadStats()
      }
    }
  }, [])

  const loadStats = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/participants-full')
      if (response.ok) {
        const data = await response.json()
        const approved = data.participants?.filter((p: any) => p.approvalStatus === 'approved').length || 0
        setApprovedCount(approved)
      }
    } catch (error) {
      console.error('Error loading stats:', error)
    } finally {
      setLoading(false)
    }
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
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
              📤 Exportação HikCentral
            </h1>
            <a
              href="/admin"
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
            >
              ← Voltar
            </a>
          </div>
        </div>

        {/* Info Card */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-blue-800 mb-3">
            ℹ️ Informações Importantes
          </h2>
          <ul className="space-y-2 text-blue-700">
            <li>• Apenas participantes <strong>APROVADOS</strong> serão exportados</li>
            <li>• O arquivo gerado está no formato oficial do HikCentral Professional</li>
            <li>• As fotos são incluídas em um arquivo ZIP separado</li>
            <li>• Use a função "Import" no HikCentral para carregar os dados</li>
          </ul>
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
                    Gera arquivo ZIP com as fotos dos {approvedCount} participantes aprovados (formato: nome_cpf.jpg)
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
                  onClick={() => {
                    window.open('/api/admin/export-hikcentral?format=excel', '_blank')
                    setTimeout(() => {
                      window.open('/api/admin/export-hikcentral?format=photos', '_blank')
                    }, 1000)
                  }}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-semibold"
                >
                  ⬇️ Baixar Tudo
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-gray-50 rounded-lg p-6 mt-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            📋 Como importar no HikCentral:
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>Baixe o arquivo Excel e o ZIP com as fotos</li>
            <li>Extraia as fotos do arquivo ZIP para uma pasta</li>
            <li>No HikCentral, vá em "Person Management" → "Import"</li>
            <li>Selecione o arquivo Excel baixado</li>
            <li>Configure o caminho da pasta com as fotos extraídas</li>
            <li>Clique em "Import" e aguarde o processamento</li>
            <li>Verifique os logs de importação para confirmar o sucesso</li>
          </ol>
        </div>
      </div>
    </div>
  )
}