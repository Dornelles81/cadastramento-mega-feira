// Token de edição inválido/revogado/expirado (Grupo D): erro amigável,
// sem revelar se o participante existe.
export default function EditarNotFound() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow p-8 max-w-md text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          Link de edição inválido ou expirado
        </h1>
        <p className="text-gray-600">
          Este link para atualizar seu cadastro não é mais válido. Peça um novo
          link à organização do evento.
        </p>
      </div>
    </main>
  )
}
