'use client';

/**
 * Resumo de UMA LINHA da saúde do sync, para a tela de gestão do evento.
 *
 * Existe para responder "está tudo indo?" de relance, sem navegar. A tela cheia
 * (`/admin/eventos/[slug]/terminais`), com a comparação entre terminais, fica a
 * um clique — esta faixa é o chamariz, não um segundo painel.
 *
 * Consome o MESMO endpoint da tela cheia, então nunca diverge dela.
 *
 * SILÊNCIO NÃO PODE PARECER NORMALIDADE: se o fetch falhar ou nenhum terminal
 * tiver dado sinal, a faixa fica vermelha e diz isso. Ela nunca some por erro —
 * some apenas quando não há terminal algum alocado, caso em que não há sync a
 * vigiar.
 */

import { useState, useEffect } from 'react';

interface Resumo {
  totalTerminais: number;
  terminaisAtrasados: number;
  divergenciaSincronizados: number;
  totalPendentes: number;
  totalFalhas: number;
  maisAntigoPendenteMs: number | null;
  semNenhumHeartbeat: boolean;
}

function duracao(ms: number | null): string {
  if (ms === null) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)} dias`;
}

export default function SyncResumo({ eventSlug, darkMode }: { eventSlug: string; darkMode?: boolean }) {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erro, setErro] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    const carregar = async () => {
      try {
        const r = await fetch(`/api/admin/eventos/${eventSlug}/terminais`);
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (vivo) { setResumo(j.resumo); setErro(false); }
      } catch {
        if (vivo) setErro(true);
      } finally {
        if (vivo) setCarregando(false);
      }
    };
    carregar();
    const id = setInterval(carregar, 60_000);
    return () => { vivo = false; clearInterval(id); };
  }, [eventSlug]);

  if (carregando) return null;

  // Sem terminal alocado não há sync a vigiar — a faixa sai de cena em vez de
  // ficar mostrando zeros sem significado.
  if (!erro && resumo && resumo.totalTerminais === 0) return null;

  const filaTravada = (resumo?.maisAntigoPendenteMs ?? 0) > 24 * 60 * 60 * 1000;
  const problema = erro || !resumo || resumo.semNenhumHeartbeat || resumo.totalFalhas > 0 || filaTravada;
  const atencao = !problema && resumo !== null &&
    (resumo.divergenciaSincronizados > 0 || resumo.terminaisAtrasados > 0 || resumo.totalPendentes > 0);

  const cor = problema
    ? 'bg-red-50 border-red-300 text-red-800'
    : atencao
      ? 'bg-amber-50 border-amber-300 text-amber-800'
      : darkMode
        ? 'bg-gray-800 border-gray-700 text-gray-200'
        : 'bg-green-50 border-green-300 text-green-800';

  let texto: string;
  if (erro || !resumo) {
    texto = 'não foi possível ler a saúde do sync';
  } else if (resumo.semNenhumHeartbeat) {
    texto = 'NENHUM terminal deu sinal na última hora';
  } else {
    const partes = [`${resumo.totalTerminais} ${resumo.totalTerminais === 1 ? 'terminal' : 'terminais'}`];
    partes.push(resumo.terminaisAtrasados > 0 ? `${resumo.terminaisAtrasados} sem heartbeat` : 'todos com heartbeat');
    if (resumo.divergenciaSincronizados > 0) partes.push(`${resumo.divergenciaSincronizados} de diferença entre eles`);
    if (resumo.totalPendentes > 0) partes.push(`${resumo.totalPendentes} pendente(s)`);
    if (resumo.totalFalhas > 0) partes.push(`${resumo.totalFalhas} falha(s)`);
    if (filaTravada) partes.push(`item parado há ${duracao(resumo.maisAntigoPendenteMs)}`);
    texto = partes.join(' · ');
  }

  return (
    <a
      href={`/admin/eventos/${eventSlug}/terminais`}
      className={`block border rounded-lg px-4 py-3 mb-4 hover:opacity-90 transition ${cor}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">
          {problema ? '🔴' : atencao ? '🟡' : '🟢'} Sync dos terminais — {texto}
        </span>
        <span className="text-xs whitespace-nowrap opacity-80">ver detalhes →</span>
      </div>
    </a>
  );
}
