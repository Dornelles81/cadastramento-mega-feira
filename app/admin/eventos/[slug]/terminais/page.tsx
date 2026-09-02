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
  alocacao: { inicio: string; fim: string; vigente: boolean; diasParaVencer: number };
  /** Limpeza pós-feira (LGPD): ver AVISO_LIMPEZA_DIAS na API. */
  limpeza: { aVencer: boolean; perdida: boolean; pessoas: number; drenaveis: number };
  heartbeat: { ultimo: string | null; idadeMs: number | null; atrasado: boolean };
  ultimoErro: string | null;
  ocupacao: {
    usuarios: number | null;
    capacidade: number;
    medidoEm: string | null;
    percentual: number | null;
    nivel: 'desconhecido' | 'ok' | 'atencao' | 'critico';
  };
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
  ocupacaoAtencao: number;
  ocupacaoCritica: number;
  avisoLimpezaDias: number;
  terminais: Terminal[];
  resumo: {
    totalTerminais: number;
    terminaisAtrasados: number;
    terminaisQuaseCheios: number;
    terminaisCriticos: number;
    terminaisSemMedicao: number;
    divergenciaSincronizados: number;
    totalPendentes: number;
    totalFalhas: number;
    maisAntigoPendenteMs: number | null;
    semNenhumHeartbeat: boolean;
    terminaisAguardandoLimpeza: number;
    terminaisLimpezaPerdida: number;
    pessoasAguardandoLimpeza: number;
  };
}

/**
 * Cor da ocupação do device. O patamar vem do servidor (`ocupacaoAtencao` /
 * `ocupacaoCritica`) já resolvido em `nivel` — a tela não recalcula o critério,
 * senão passariam a existir dois lugares decidindo o que é "cheio".
 */
function corOcupacao(nivel: Terminal['ocupacao']['nivel']): string {
  if (nivel === 'critico') return 'text-red-700 font-semibold';
  if (nivel === 'atencao') return 'text-amber-700 font-semibold';
  return 'text-gray-900';
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

/**
 * Uma linha que ESGOTOU o teto de tentativas. Desde que a reconciliação passou
 * a respeitar esse teto, ela não volta sozinha para a fila — então precisa
 * aparecer com nome e motivo, e ter um caminho de volta.
 */
interface LinhaFalha {
  syncId: string;
  participante: string;
  participanteId: string;
  employeeNo: string | null;
  terminal: string | null;
  terminalId: string | null;
  faceState: string;
  cardState: string;
  removalState: string;
  tentativas: number;
  ultimoErro: string | null;
  ultimaTentativa: string | null;
}

interface Falhas {
  maxTentativas: number;
  total: number;
  truncado?: boolean;
  linhas: LinhaFalha[];
}

const AUTO_REFRESH_MS = 30_000;

export default function TerminaisPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [dados, setDados] = useState<Saude | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falhas, setFalhas] = useState<Falhas | null>(null);
  // syncId em processamento (ou 'todas'); trava o botão e evita clique duplo.
  const [reenfileirando, setReenfileirando] = useState<string | null>(null);
  const [avisoRetry, setAvisoRetry] = useState<string | null>(null);
  // Esvaziar terminal: o terminal escolhido, o nome digitado e o estado do envio.
  const [esvaziarAlvo, setEsvaziarAlvo] = useState<Terminal | null>(null);
  const [nomeDigitado, setNomeDigitado] = useState('');
  const [esvaziando, setEsvaziando] = useState(false);
  const [erroEsvaziar, setErroEsvaziar] = useState<string | null>(null);
  const [avisoEsvaziar, setAvisoEsvaziar] = useState<string | null>(null);

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
    // A lista de falhas é buscada à parte e NÃO derruba a tela se falhar: a
    // saúde dos terminais é o que não pode sumir.
    try {
      const rf = await fetch(`/api/admin/eventos/${slug}/sync-falhas`);
      if (rf.ok) setFalhas(await rf.json());
    } catch {
      /* silencioso de propósito — ver acima */
    }
  }, [slug]);

  /** Devolve à fila: uma linha, ou todas as esgotadas do evento. */
  const reenfileirar = useCallback(async (alvo: { syncId?: string; todos?: boolean }) => {
    const chave = alvo.syncId ?? 'todas';
    setReenfileirando(chave);
    setAvisoRetry(null);
    try {
      const r = await fetch(`/api/admin/eventos/${slug}/sync-falhas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alvo)
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Falha ao re-tentar (HTTP ${r.status})`);
      setAvisoRetry(
        `${j.reenfileiradas} linha(s) devolvida(s) à fila. Se a causa continuar, elas esgotam de novo.`
      );
      await carregar();
    } catch (e: any) {
      setAvisoRetry(e?.message ?? 'Erro ao re-tentar');
    } finally {
      setReenfileirando(null);
    }
  }, [slug, carregar]);

  /**
   * Esvaziar o terminal. A confirmação por NOME DIGITADO é a trava: o servidor
   * revalida o nome, então isto não é enfeite de tela — sem ele o POST é
   * recusado. Fecha o modal só no sucesso; no erro mantém aberto com a mensagem,
   * para a pessoa corrigir o que digitou sem recomeçar.
   */
  const esvaziarTerminal = useCallback(async () => {
    if (!esvaziarAlvo) return;
    setEsvaziando(true);
    setErroEsvaziar(null);
    try {
      const r = await fetch(`/api/admin/eventos/${slug}/esvaziar-terminal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminalId: esvaziarAlvo.id, confirmacaoNome: nomeDigitado })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Falha ao esvaziar (HTTP ${r.status})`);
      setAvisoEsvaziar(j.mensagem ?? `${j.linhasMarcadas} linha(s) marcada(s).`);
      setEsvaziarAlvo(null);
      setNomeDigitado('');
      await carregar();
    } catch (e: any) {
      setErroEsvaziar(e?.message ?? 'Erro ao esvaziar');
    } finally {
      setEsvaziando(false);
    }
  }, [slug, esvaziarAlvo, nomeDigitado, carregar]);

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
        {/* LIMPEZA PÓS-FEIRA (LGPD) — aviso PRÉVIO: enquanto a alocação estiver
            de pé, o botão "Esvaziar" resolve. Depois que ela vence, o agente
            não alcança mais o aparelho e sobra o painel de cada terminal. */}
        {(r?.terminaisAguardandoLimpeza ?? 0) > 0 && (
          <div className="bg-amber-500 text-white rounded-lg p-5 mb-4 shadow">
            <p className="text-lg font-bold">
              🧹 Limpeza pendente: {r?.terminaisAguardandoLimpeza}{' '}
              {r?.terminaisAguardandoLimpeza === 1 ? 'terminal' : 'terminais'} com alocação vencendo
            </p>
            <p className="text-sm mt-1 text-amber-50">
              Há {r?.pessoasAguardandoLimpeza} pessoa(s) com biometria nos aparelhos e a alocação
              vence em até {dados?.avisoLimpezaDias} dias. Use &quot;Esvaziar&quot; em cada terminal
              ANTES do vencimento: passada a data, o agente perde o escopo e a remoção só pode ser
              feita no painel de cada equipamento, sem registro nenhum.
            </p>
          </div>
        )}
        {(r?.terminaisLimpezaPerdida ?? 0) > 0 && (
          <div className="bg-red-700 text-white rounded-lg p-5 mb-4 shadow">
            <p className="text-lg font-bold">
              ⛔ {r?.terminaisLimpezaPerdida}{' '}
              {r?.terminaisLimpezaPerdida === 1 ? 'terminal' : 'terminais'} com biometria e alocação
              VENCIDA
            </p>
            <p className="text-sm mt-1 text-red-50">
              O agente não alcança mais estes aparelhos: marcar a remoção aqui deixa as linhas
              esperando e nada sai do equipamento. Para limpar de fato, estenda a alocação (e então
              use &quot;Esvaziar&quot;) ou apague pelo painel de cada terminal.
            </p>
          </div>
        )}
        {avisoEsvaziar && (
          <div className="bg-white border border-amber-300 text-amber-900 rounded-lg p-4 mb-4 flex items-start justify-between gap-4">
            <span className="text-sm">{avisoEsvaziar}</span>
            <button
              type="button"
              onClick={() => setAvisoEsvaziar(null)}
              className="text-amber-700 hover:text-amber-900 text-sm shrink-0"
            >
              fechar
            </button>
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
                  <th className="text-right px-4 py-3 font-medium">
                    No device
                    <span className="block text-xs font-normal text-gray-400">ocupação real</span>
                  </th>
                  <th className="text-right px-4 py-3 font-medium">Sincronizados</th>
                  <th className="text-right px-4 py-3 font-medium">Pendentes</th>
                  <th className="text-right px-4 py-3 font-medium">Falhas</th>
                  <th className="text-left px-4 py-3 font-medium">Mais antigo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dados?.terminais.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
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
                        {t.limpeza.aVencer && (
                          <span className="block mt-1 text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 w-fit">
                            limpar em {t.alocacao.diasParaVencer}d
                          </span>
                        )}
                        {t.limpeza.perdida && (
                          <span className="block mt-1 text-xs px-2 py-0.5 rounded bg-red-100 text-red-800 w-fit">
                            alocação vencida com {t.limpeza.pessoas} pessoa(s)
                          </span>
                        )}
                        {/* Aparece quando há o que drenar — mesmo critério do
                            servidor (`removalState <> 'removed'`), não uma soma
                            aproximada de colunas da tela. */}
                        {t.limpeza.drenaveis > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setEsvaziarAlvo(t);
                              setNomeDigitado('');
                              setErroEsvaziar(null);
                            }}
                            className="block mt-1.5 text-xs font-medium text-red-700 hover:text-red-900 underline"
                          >
                            Esvaziar terminal
                          </button>
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
                      <td className="px-4 py-3 text-right tabular-nums">
                        {t.ocupacao.usuarios === null ? (
                          <span
                            className="text-gray-400"
                            title="O agente ainda não reportou a contagem. Versões antigas do mega-agente.exe não enviam este dado — regere o binário do main atual."
                          >
                            —
                          </span>
                        ) : (
                          <>
                            <span className={corOcupacao(t.ocupacao.nivel)}>
                              {t.ocupacao.usuarios.toLocaleString('pt-BR')}
                              <span className="text-gray-400 font-normal">
                                {' / '}
                                {t.ocupacao.capacidade.toLocaleString('pt-BR')}
                              </span>
                              {t.ocupacao.nivel === 'critico' && ' 🔴'}
                              {t.ocupacao.nivel === 'atencao' && ' ⚠️'}
                            </span>
                            <span className="block text-xs font-normal text-gray-400">
                              {Math.round((t.ocupacao.percentual ?? 0) * 100)}%
                            </span>
                          </>
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

        {/* ── Linhas esgotadas: quem travou, por quê, e o caminho de volta ──
            A contagem por terminal (coluna "Falhas") diz que existe problema;
            só esta lista diz o que fazer a respeito. */}
        {falhas && falhas.total > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-red-200 mt-6">
            <div className="px-4 py-3 border-b border-red-200 bg-red-50 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-semibold text-red-800">
                  {falhas.total} linha(s) pararam de tentar
                </h2>
                <p className="text-xs text-red-700 mt-0.5">
                  Bateram o teto de {falhas.maxTentativas} tentativas. Não voltam sozinhas —
                  resolva a causa e devolva à fila.
                </p>
              </div>
              <button
                onClick={() => reenfileirar({ todos: true })}
                disabled={reenfileirando !== null}
                className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reenfileirando === 'todas' ? 'Devolvendo...' : 'Re-tentar todas'}
              </button>
            </div>

            {avisoRetry && (
              <p className="px-4 py-2 text-sm text-gray-700 bg-amber-50 border-b border-amber-200">
                {avisoRetry}
              </p>
            )}

            <div className="divide-y divide-gray-100">
              {falhas.linhas.map((l) => (
                <div key={l.syncId} className="px-4 py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">
                      {l.participante}
                      {l.employeeNo && (
                        <span className="ml-2 text-xs font-normal text-gray-400 tabular-nums">
                          #{l.employeeNo}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {l.terminal ?? '(terminal removido)'} · {l.tentativas} tentativas ·{' '}
                      {[
                        l.faceState === 'failed' ? 'face' : null,
                        l.cardState === 'failed' ? 'cartão' : null,
                        l.removalState === 'failed' ? 'remoção' : null
                      ].filter(Boolean).join(' + ')}
                    </p>
                    {/* Erro CRU do device. O subStatusCode é o que diz a causa —
                        reescrever em linguagem amigável apagaria justamente ele. */}
                    {l.ultimoErro && (
                      <p className="text-xs text-gray-600 mt-1 font-mono break-all bg-gray-50 rounded px-2 py-1">
                        {l.ultimoErro}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => reenfileirar({ syncId: l.syncId })}
                    disabled={reenfileirando !== null}
                    className="shrink-0 px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {reenfileirando === l.syncId ? '...' : 'Re-tentar'}
                  </button>
                </div>
              ))}
            </div>

            {falhas.truncado && (
              <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
                Mostrando {falhas.linhas.length} de {falhas.total}. &quot;Re-tentar todas&quot;
                alcança todas, inclusive as não listadas.
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4">
          &quot;Falhas&quot; = linhas que bateram o teto de {dados?.maxTentativas} tentativas e não são
          mais servidas ao agente, nem pela reconciliação — ela respeita o mesmo teto, senão a
          linha voltaria à fila a cada ciclo e tentaria para sempre. Foto nova devolve a linha à
          fila sozinha; fora isso, é o botão acima. Heartbeat é destacado a partir de{' '}
          {Math.round((dados?.limiteHeartbeatMs ?? 0) / 60000)} min sem sinal.
        </p>
        <p className="text-xs text-gray-400 mt-2">
          &quot;No device&quot; = quantos usuários o equipamento REPORTA ter, lido pelo agente a cada
          heartbeat — é diferente de &quot;Sincronizados&quot;, que é o que a nuvem mandou. A
          diferença entre os dois inclui cadastros feitos à mão no painel do terminal, que ocupam
          vaga e não aparecem do nosso lado. Destacado a partir de{' '}
          {Math.round((dados?.ocupacaoAtencao ?? 0.8) * 100)}% e em vermelho a partir de{' '}
          {Math.round((dados?.ocupacaoCritica ?? 0.95) * 100)}% da capacidade. Cheio, o terminal
          passa a RECUSAR novos usuários.
          {(dados?.resumo.terminaisSemMedicao ?? 0) > 0 && (
            <> Traço (—) = o agente ainda não reportou a contagem; versões do{' '}
            <code>mega-agente.exe</code> anteriores a 23/08/2026 não enviam esse dado.</>
          )}
        </p>

        {/* ===== Esvaziar terminal: confirmação por NOME DIGITADO ===== */}
        {esvaziarAlvo && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-bold text-red-800">Esvaziar {esvaziarAlvo.nome}</h2>
                <p className="text-sm text-gray-600 mt-0.5">{esvaziarAlvo.ip}</p>
              </div>

              <div className="px-6 py-4 space-y-3">
                <div className="rounded-md bg-red-50 border border-red-300 px-4 py-3 text-sm text-red-900">
                  <p className="font-semibold">
                    Isto marca {esvaziarAlvo.limpeza.drenaveis}{' '}
                    {esvaziarAlvo.limpeza.drenaveis === 1 ? 'pessoa' : 'pessoas'} para remoção neste
                    terminal.
                  </p>
                  <p className="mt-1">
                    O agente vai apagar a biometria delas do equipamento nos próximos ciclos. Não
                    afeta o cadastro no sistema, nem os outros terminais — mas quem for removido
                    deixa de abrir esta catraca até ser re-sincronizado.
                  </p>
                  {/* O número acima é TODAS as linhas vivas, não só as sincronizadas —
                      inclui quem está a meio sync e quem falhou. Sem esta linha, quem
                      lê "Sincronizados: 3" na tabela e vê outro número aqui pensaria
                      que a tela está errada. */}
                  {esvaziarAlvo.limpeza.drenaveis !== esvaziarAlvo.sincronizados && (
                    <p className="mt-1 text-red-800">
                      Inclui {esvaziarAlvo.sincronizados} já sincronizada(s) e{' '}
                      {esvaziarAlvo.limpeza.drenaveis - esvaziarAlvo.sincronizados} que ainda estão
                      a caminho ou em falha — a limpeza alcança as duas coisas.
                    </p>
                  )}
                </div>

                {!esvaziarAlvo.alocacao.vigente && (
                  <div className="rounded-md bg-amber-50 border border-amber-300 px-4 py-3 text-sm text-amber-900">
                    A alocação deste terminal não está vigente: as linhas ficam marcadas, mas o
                    agente não vai executá-las e a biometria continua no aparelho.
                  </div>
                )}

                <label className="block text-sm text-gray-700">
                  Para confirmar, digite o nome do terminal:
                  <input
                    autoFocus
                    value={nomeDigitado}
                    onChange={(e) => setNomeDigitado(e.target.value)}
                    placeholder={esvaziarAlvo.nome}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </label>
                <p className="text-xs text-gray-500">
                  Maiúsculas, espaços e o tipo de traço não importam — o resto tem que bater.
                </p>

                {erroEsvaziar && (
                  <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                    {erroEsvaziar}
                  </p>
                )}
              </div>

              <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setEsvaziarAlvo(null); setNomeDigitado(''); setErroEsvaziar(null); }}
                  disabled={esvaziando}
                  className="px-5 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={esvaziarTerminal}
                  disabled={esvaziando || nomeDigitado.trim() === ''}
                  className="px-5 py-2 rounded-lg bg-red-700 text-white hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {esvaziando ? 'Esvaziando...' : 'Esvaziar terminal'}
                </button>
              </div>
            </div>
          </div>
        )}
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
