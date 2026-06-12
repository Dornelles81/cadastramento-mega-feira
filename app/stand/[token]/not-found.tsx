// Erro genérico para token inválido/revogado/expirado (SPEC 2.2):
// não revela se o stand existe.
export default function StandLinkNotFound() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow p-8 max-w-md text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          Link inválido ou expirado
        </h1>
        <p className="text-gray-600">
          Este link de acesso não é válido. Contate a organização do evento para
          receber um novo link.
        </p>
      </div>
    </main>
  )
}
