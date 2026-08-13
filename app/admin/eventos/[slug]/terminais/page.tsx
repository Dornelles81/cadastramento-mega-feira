'use client';

/**
 * Saúde do sync — comparação entre terminais, lado a lado.
 *
 * A pergunta que esta tela responde é "está tudo indo?". O número principal NÃO
 * é o total de um terminal, é a COMPARAÇÃO: quatro colunas com o mesmo total =
 * saudável; uma atrasada = aquele device ficou fora do ar, e na feira isso vira
 * "a pessoa passa numa entrada e não na outra".
 *
 * Dois indicadores globais têm destaque próprio porque são os que denunciam
 * problema de verdade:
 *   - ITEM MAIS ANTIGO NA FILA: total alto de pendentes pode ser gente que
 *     acabou de se cadastrar; um item esperando há 2 dias é coisa quebrada.
 *   - SILÊNCIO DE HEARTBEAT: nenhum sinal recente não pode parecer normalidade.
 */

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';

interface Terminal {
  id: string;
  nome: string;
  ip: string;
  modelo: string | null;
  ativo: boolean;
  alocacao: { inicio: string; fim: string; vigente: boolean };
  heartbeat: { ultimo: string | null; idadeMs: number | null; atrasado: boolean };
  ultimoErro: string | null;
  sincronizados: number;
  pendentes: number;
  falhas: number;
  maisAntigoPendente: string | null;
  maisAntigoPendenteMs: number | null;
}

interface Saude {
  evento: { id: string; nome: string; slug: string };
  geradoEm: string;
  limiteHeartbeatMs: number;
  maxTentativas: number;
  terminais: Terminal[];
  resumo: {
    totalTerminais: number;
    terminaisAtrasados: number;
    divergenciaSincronizados: number;
    totalPendentes: number;
    totalFalhas: number;
    maisAntigoPendenteMs: number | null;
    semNenhumHeartbeat: boolean;
  };
}

/** Duração legível: a unidade importa mais que a precisão ("há 2 dias"). */
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

const AUTO_REFRESH_MS = 30_000;

export default function TerminaisPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [dados, setDados] = useState<Saude | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/eventos/${slug}/terminais`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `Falha ao carregar (HTTP ${r.status})`);
      }
      setDados(await r.json());
      setErro(null);
    } catch (e: any) {
      setErro(e?.message ?? 'Erro desconhecido');
    } finally {
      setCarregando(false);
    }
  }, [slug]);

  useEffect(() => {
    carregar();
    const id = setInterval(carregar, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [carregar]);

  if (carregando) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Carregando saúde do sync...</p>
      </div>
    );
  }

  const r = dados?.resumo;
  // O pendente mais velho vira ALARME quando passa de um dia: aí não é fila,
  // é alguma coisa que parou de andar.
  const filaTravada = (r?.maisAntigoPendenteMs ?? 0) > 24 * 60 * 60 * 1000;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <Link href="/admin/dashboard" className="hover:text-blue-600">Dashboard</Link>
                <span>/</span>
                <Link href={`/admin/eventos/${slug}`} className="hover:text-blue-600">
                  {dados?.evento.nome ?? slug}
                </Link>
                <span>/</span>
                <span className="text-gray-900">Terminais</span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900">Saúde do sync</h1>
              <p className="text-gray-600 mt-1">
                Comparação entre terminais. Totais iguais = saudável; um atrasado = aquele device ficou fora do ar.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={carregar}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Atualizar
              </button>
              <Link href={`/admin/eventos/${slug}`} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                Voltar
              </Link>
            </div>
          </div>
          {dados && (
            <p className="text-xs text-gray-400">
              Atualizado {new Date(dados.geradoEm).toLocaleString('pt-BR')} · recarrega a cada {AUTO_REFRESH_MS / 1000}s
            </p>
          )}
        </div>

        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 mb-6">
            {erro}
          </div>
        )}

        {/* ---------------- ALERTAS: silêncio e fila travada ---------------- */}
        {r?.semNenhumHeartbeat && (
          <div className="bg-red-600 text-white rounded-lg p-5 mb-4 shadow">
            <p className="text-lg font-bold">🔴 Nenhum terminal deu sinal</p>
            <p className="text-sm mt-1 text-red-50">
              Nenhum heartbeat recebido na última hora. O agente pode estar parado, sem rede ou
              com o token revogado — enquanto isso, nada é sincronizado. Silêncio aqui NÃO é
              funcionamento normal.
            </p>
          </div>
        )}
        {filaTravada && (
          <div className="bg-amber-500 text-white rounded-lg p-5 mb-4 shadow">
            <p className="text-lg font-bold">
              ⚠️ Item parado na fila há {duracao(r?.maisAntigoPendenteMs ?? null)}
            </p>
            <p className="text-sm mt-1 text-amber-50">
              Fila grande pode ser gente que acabou de se cadastrar. Item velho, não: alguma coisa
              parou de andar.
            </p>
          </div>
        )}

        {/* ------------------------- indicadores globais ------------------------- */}
        {r && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Indicador
              titulo="Item mais antigo na fila"
              valor={duracao(r.maisAntigoPendenteMs)}
              detalhe={r.maisAntigoPendenteMs === null ? 'nada pendente' : 'esperando há'}
              tom={filaTravada ? 'alarme' : r.maisAntigoPendenteMs ? 'atencao' : 'ok'}
            />
            <Indicador
              titulo="Divergência entre terminais"
              valor={String(r.divergenciaSincronizados)}
              detalhe={r.divergenciaSincronizados === 0 ? 'todos iguais' : 'faces de diferença'}
              tom={r.divergenciaSincronizados === 0 ? 'ok' : 'alarme'}
            />
            <Indicador
              titulo="Pendentes"
              valor={String(r.totalPendentes)}
              detalhe="somando os terminais"
              tom={r.totalPendentes > 0 ? 'atencao' : 'ok'}
            />
            <Indicador
              titulo="Falhas"
              valor={String(r.totalFalhas)}
              detalhe={`≥ ${dados?.maxTentativas} tentativas`}
              tom={r.totalFalhas > 0 ? 'alarme' : 'ok'}
            />
          </div>
        )}

        {/* --------------------------- tabela por terminal --------------------------- */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Terminal</th>
                  <th className="text-left px-4 py-3 font-medium">Último heartbeat</th>
                  <th className="text-right px-4 py-3 font-medium">Sincronizados</th>
                  <th className="text-right px-4 py-3 font-medium">Pendentes</th>
                  <th className="text-right px-4 py-3 font-medium">Falhas</th>
                  <th className="text-left px-4 py-3 font-medium">Mais antigo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dados?.terminais.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                      Nenhum terminal alocado a este evento. Sem alocação vigente, nada é
                      sincronizado — cadastre a alocação para o período do evento.
                    </td>
                  </tr>
                )}
                {dados?.terminais.map((t) => {
                  const lider = Math.max(...(dados.terminais.map((x) => x.sincronizados)));
                  const atrasadoNoTotal = t.sincronizados < lider;
                  return (
                    <tr key={t.id} className={t.heartbeat.atrasado ? 'bg-red-50' : undefined}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{t.nome}</div>
                        <div className="text-xs text-gray-500">{t.ip}</div>
                        {!t.alocacao.vigente && (
                          <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                            alocação fora do período
                          </span>
                        )}
                        {!t.ativo && (
                          <span className="inline-block mt-1 ml-1 text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                            inativo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {t.heartbeat.ultimo === null ? (
                          <span className="text-red-700 font-semibold">nunca deu sinal</span>
                        ) : (
                          <span className={t.heartbeat.atrasado ? 'text-red-700 font-semibold' : 'text-gray-700'}>
                            há {duracao(t.heartbeat.idadeMs)}
                            {t.heartbeat.atrasado && ' ⚠️'}
                          </span>
                        )}
                        {t.ultimoErro && (
                          <div className="text-xs text-red-600 mt-1 max-w-xs truncate" title={t.ultimoErro}>
                            {t.ultimoErro}
                          </div>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums font-semibold ${atrasadoNoTotal ? 'text-amber-700' : 'text-gray-900'}`}>
                        {t.sincronizados}
                        {atrasadoNoTotal && (
                          <span className="ml-1 text-xs font-normal">(−{lider - t.sincronizados})</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">{t.pendentes}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${t.falhas > 0 ? 'text-red-700 font-semibold' : 'text-gray-700'}`}>
                        {t.falhas}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{duracao(t.maisAntigoPendenteMs)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-gray-400 mt-4">
          &quot;Falhas&quot; = linhas que bateram o teto de {dados?.maxTentativas} tentativas e não são
          mais servidas ao agente. Heartbeat é destacado a partir de{' '}
          {Math.round((dados?.limiteHeartbeatMs ?? 0) / 60000)} min sem sinal.
        </p>
      </div>
    </div>
  );
}

function Indicador({
  titulo, valor, detalhe, tom
}: { titulo: string; valor: string; detalhe: string; tom: 'ok' | 'atencao' | 'alarme' }) {
  const cor =
    tom === 'alarme' ? 'border-red-300 bg-red-50' :
    tom === 'atencao' ? 'border-amber-300 bg-amber-50' :
    'border-gray-200 bg-white';
  const corValor =
    tom === 'alarme' ? 'text-red-700' :
    tom === 'atencao' ? 'text-amber-700' :
    'text-gray-900';
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${cor}`}>
      <p className="text-xs uppercase tracking-wide text-gray-500">{titulo}</p>
      <p className={`text-2xl font-bold mt-1 ${corValor}`}>{valor}</p>
      <p className="text-xs text-gray-500 mt-0.5">{detalhe}</p>
    </div>
  );
}
