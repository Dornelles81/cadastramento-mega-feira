'use client'

import { useState, useEffect } from 'react'

/**
 * Miniatura da foto do credenciado, no painel do gestor.
 *
 * ── Por que não é mais um círculo de 48px ─────────────────────────────────
 * Era: 48px, `rounded-full`, `object-cover`. Os três juntos escondem
 * exatamente o que o gestor precisa enxergar — `object-cover` corta as bordas
 * e centraliza, então rosto cortado vira rosto centralizado, e 48px é pequeno
 * demais para julgar nitidez. Uma foto de parede virava um círculo cinza que
 * não chamava atenção nenhuma.
 *
 * Agora: retangular 64x80 (proporção 3:4, a mesma da captura), `object-contain`
 * sobre fundo neutro — a imagem inteira aparece, com as bordas que ela
 * realmente tem. E clicar abre em tamanho grande, também sem corte, porque
 * decidir "esta foto serve?" às vezes exige olhar de perto.
 */
export default function FotoCredenciado({
  src,
  nome,
  risco
}: {
  src: string | null
  nome: string
  risco: 'nao-validada' | 'medida-baixa' | null
}) {
  const [aberta, setAberta] = useState(false)

  // Esc fecha: o modal cobre a tela inteira no celular, e sem isto a saída
  // depende de acertar um X pequeno.
  useEffect(() => {
    if (!aberta) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberta(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aberta])

  const borda =
    risco === 'nao-validada' ? 'ring-2 ring-red-400'
      : risco === 'medida-baixa' ? 'ring-2 ring-amber-400'
        : 'ring-1 ring-gray-200'

  if (!src) {
    return (
      <div className={`w-16 h-20 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xl flex-shrink-0 ${borda}`}>
        &#128100;
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        className={`w-16 h-20 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 ${borda} focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500`}
        title="Ver foto em tamanho maior"
        aria-label={`Ver foto de ${nome} em tamanho maior`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="w-full h-full object-contain" />
      </button>

      {aberta && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setAberta(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Foto de ${nome}`}
        >
          <div className="max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            {/* object-contain de novo: no modal, cortar seria pior ainda. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`Foto de ${nome}`}
              className="w-full max-h-[70vh] object-contain rounded-lg bg-white"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-white font-medium truncate">{nome}</p>
              <button
                type="button"
                onClick={() => setAberta(false)}
                className="px-4 py-2 rounded-lg bg-white/90 text-gray-900 font-medium hover:bg-white flex-shrink-0"
              >
                Fechar
              </button>
            </div>
            {risco && (
              <p className="mt-2 text-sm text-white/90">
                {risco === 'nao-validada'
                  ? 'Esta foto não passou pela validação automática de rosto. Confira se a pessoa aparece de frente, com o rosto inteiro e bem iluminado.'
                  : 'O rosto ficou pequeno nesta foto. Uma nova captura, mais perto, tende a funcionar melhor no terminal.'}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
