export default function BalcaoNaoEncontrado() {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow p-8 max-w-md text-center">
        <h1 className="text-xl font-bold mb-2">Link de balcão inválido</h1>
        <p className="text-gray-600">
          Este link não vale mais: foi revogado, expirou ou está incompleto. Peça um link novo à organização.
        </p>
      </div>
    </main>
  )
}
