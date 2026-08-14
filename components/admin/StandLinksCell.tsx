'use client';

import { useState } from 'react';

/**
 * Célula + modal de gestão dos links de acesso do stand por SCOPE (Fatia 6).
 *
 * Há dois links independentes, com poderes distintos:
 *  - CADASTRO ('register'): pode ser compartilhado com a equipe. Só inscreve —
 *    não vê a lista de credenciados, fotos/CPF, nem exclui. NUNCA é enviado por
 *    e-mail por aqui (canal aberto: copiar e repassar; WhatsApp depois).
 *  - GESTÃO ('manage'): uso exclusivo do responsável. Vê a lista e pode EXCLUIR.
 *    Além de Copiar, oferece "Enviar por e-mail" (POST sendEmail:true), habilitado
 *    só quando há e-mail de responsável cadastrado.
 *
 * O token em claro só existe no instante da geração (o banco guarda só o hash):
 * a resposta do POST traz o link UMA vez, exibido num campo read-only para copiar.
 *
 * Backend (intocado nesta fatia):
 *  - POST   /api/admin/stands/:id/access-link  { scope, sendEmail? } → { link, scope, sentTo, expiresAt }
 *  - DELETE /api/admin/stands/:id/access-link  { scope }
 */

type Scope = 'register' | 'manage';

// Campos do stand consumidos por esta célula. As páginas passam o objeto Stand
// inteiro (tipagem estrutural — basta conter estes campos).
export interface StandLinksCellStand {
  id: string;
  name: string;
  responsibleEmail?: string;
  responsiblePhone?: string;
  hasRegisterLink?: boolean;
  hasManageLink?: boolean;
  registerGeneratedAt?: string | null;
  registerLastUsedAt?: string | null;
  manageGeneratedAt?: string | null;
  manageLastUsedAt?: string | null;
}

interface StandLinksCellProps {
  stand: StandLinksCellStand;
  /** Recarrega a lista de stands após gerar/revogar/enviar (ex.: loadStands). */
  onChanged: () => void;
  /** Nome do evento p/ montar os textos do WhatsApp. Ausente (tela legada sem
   *  event.name) → botões de WhatsApp ficam de fora; o resto funciona igual. */
  eventName?: string;
  /** Prazo RECOMENDADO de cadastro já formatado (dd/MM/aaaa), vindo de
   *  registrationDeadlineLabel(event). Só entra no convite de cadastro; ausente
   *  → a linha do prazo não aparece. Nunca bloqueia cadastro. */
  registrationDeadline?: string | null;
}

function formatDateTime(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/* ===================== WhatsApp (dois comunicados, ambos pro GESTOR) =====================
 * Dois textos enviados em MOMENTOS DIFERENTES: o de gestão (perigoso — permite excluir, fala
 * COM o responsável e cita o stand) e o de cadastro (fala com o PARTICIPANTE final, que o
 * gestor repassa; sem menção ao stand). [EVENTO]/[STAND]/[LINK_*] preenchidos na hora.
 * O link de cadastro usa a ROTA DIRETA /cadastro (pula a landing). Ambos só existem no
 * instante da geração (o banco guarda só o hash) → o botão vive no bloco recém-gerado. */
// Emojis montados em RUNTIME via String.fromCodePoint — o arquivo-fonte não contém nenhum byte
// astral (emoji) nem escape backslash-u, só números (code points). Imune a qualquer corrupção
// de encoding/editor/bundler (o SWC/Turbopack estava quebrando o char astral, virando U+FFFD).
const WA_EMOJI = {
  wave: String.fromCodePoint(0x1f44b),        // acena
  tent: String.fromCodePoint(0x1f3aa),        // tenda (evento)
  key: String.fromCodePoint(0x1f511),         // chave
  check: String.fromCodePoint(0x2705),        // check verde
  point: String.fromCodePoint(0x1f449),       // dedo apontando
  warn: String.fromCodePoint(0x26a0, 0xfe0f), // atencao
  lock: String.fromCodePoint(0x1f512),        // cadeado
  people: String.fromCodePoint(0x1f465),      // pessoas
  smile: String.fromCodePoint(0x1f60a),       // sorriso
  phone: String.fromCodePoint(0x1f4f2),       // celular c/ seta
  memo: String.fromCodePoint(0x1f4dd),        // formulario
  selfie: String.fromCodePoint(0x1f933),      // selfie
  mobile: String.fromCodePoint(0x1f4f1),      // celular
  clipboard: String.fromCodePoint(0x1f4cb),   // prancheta (link de cadastro)
  camera: String.fromCodePoint(0x1f4f8),      // camera com flash (foto)
  link: String.fromCodePoint(0x1f517),        // elo/corrente (o link)
  hands: String.fromCodePoint(0x1f64c),       // maos erguidas (despedida)
  clock: String.fromCodePoint(0x23f0),        // despertador (prazo recomendado)
};

function waTextGestao(evento: string, stand: string, link: string): string {
  const e = WA_EMOJI;
  return `Olá! ${e.wave} Aqui é a organização do ${evento}.
Você foi definido(a) como responsável pelo stand ${stand}. ${e.tent}
${e.key} Este é o seu link de gestão — com ele você acompanha, aprova ${e.check} e gerencia as credenciais da sua equipe:
${e.point} ${link}
${e.warn} Importante: este link é exclusivo do responsável. Ele permite excluir participantes, então NÃO compartilhe com a sua equipe. ${e.lock}
${e.people} Para as pessoas com direito à credencial se cadastrarem, use o link de cadastro (enviado à parte).
Qualquer dúvida, é só falar com a organização. ${e.smile}`;
}

/**
 * Convite de cadastro. Falado NA SEGUNDA PESSOA, direto ao participante final —
 * quem recebe é quem se cadastra. (Antes o texto mandava "encaminhe a cada
 * pessoa da sua equipe": chegando ao participante, ele lia, achava que não era
 * com ele, e não se cadastrava.)
 *
 * Duas escolhas de redação que NÃO devem regredir:
 *  - "do evento ${evento}": o artigo concorda com a palavra "evento", não com o
 *    nome próprio. É o que evita "da Expofest"/"do Expodireto" errado sem exigir
 *    um campo de gênero no cadastro do evento.
 *  - o nome do STAND ficou de fora: o link já leva ao stand certo, e citá-lo só
 *    dava ao participante a impressão de que a mensagem era para outra pessoa.
 *
 * `prazo` é RECOMENDAÇÃO, não trava — o cadastro segue aberto durante todo o
 * evento (ver lib/event/registration-deadline.ts). Sem prazo resolvido, a linha
 * simplesmente não sai.
 */
function waTextCadastro(evento: string, link: string, prazo?: string | null): string {
  const e = WA_EMOJI;
  const linhaPrazo = prazo
    ? `${e.clock} Recomendamos fazer o cadastro até ${prazo} — assim sua credencial já estará pronta na chegada.\n\n`
    : '';
  return `Olá! ${e.wave} Aqui é a organização do evento ${evento}.

Você vai participar e precisa da sua credencial de acesso. ${e.clipboard}

Faça seu cadastro pelo link abaixo: preencha seus dados e tire uma foto ${e.camera}. A credencial é gerada automaticamente.

${linhaPrazo}${e.mobile} Melhor abrir no navegador do celular (Chrome ou Safari).

${e.link} ${link}

Qualquer dúvida, fale com a organização. ${e.hands}`;
}

// DDDs válidos no Brasil — pega typos (ex.: "58" não existe) e manda pro fallback.
const DDDS_BR = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35,
  37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64,
  65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Normaliza o telefone do responsável para envio DIRETO no wa.me (55 + DDD + 9 dígitos).
 * CONSERVADOR: na dúvida devolve null → o chamador cai no fallback (escolher contato).
 * Nunca adivinha dígito faltando (número errado é pior que fallback). Detecção por
 * COMPRIMENTO, nunca por prefixo — DDD 55 (noroeste do RS) NÃO é código de país.
 *   - 13 díg começando com 55 (55 + DDD + 9) → usa direto
 *   - 11 díg (DDD + 9)                        → prefixa 55
 *   - 10 díg (celular sem o 9, ou fixo), DDD inválido, ou qualquer outro tamanho → null
 */
function normalizePhoneBR(raw?: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  let out: string | null = null;
  if (d.length === 13 && d.startsWith('55')) out = d;
  else if (d.length === 11) out = '55' + d;
  if (!out) return null;
  return DDDS_BR.has(Number(out.slice(2, 4))) ? out : null;
}

// Abre o WhatsApp: com número normalizado → conversa direta; senão → picker de contato.
function openWhatsApp(texto: string, phone?: string | null): void {
  const num = normalizePhoneBR(phone);
  const url = num
    ? `https://wa.me/${num}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank', 'noopener');
}

export default function StandLinksCell({
  stand,
  onChanged,
  eventName,
  registrationDeadline,
}: StandLinksCellProps) {
  const [open, setOpen] = useState(false);
  // Link em claro retornado pela última geração, por scope (some ao fechar o modal).
  const [generated, setGenerated] = useState<{ register?: string; manage?: string }>({});
  // scope em operação (POST/DELETE) → desabilita os botões daquele card.
  const [busyScope, setBusyScope] = useState<Scope | null>(null);
  // scope cujo "Enviar por e-mail" está em andamento.
  const [emailingScope, setEmailingScope] = useState<Scope | null>(null);
  // feedback de cópia, por scope.
  const [copiedScope, setCopiedScope] = useState<Scope | null>(null);

  const closeModal = () => {
    setOpen(false);
    setGenerated({});
    setBusyScope(null);
    setEmailingScope(null);
    setCopiedScope(null);
  };

  const hasLink = (scope: Scope) =>
    scope === 'register' ? !!stand.hasRegisterLink : !!stand.hasManageLink;

  const handleGenerate = async (scope: Scope) => {
    if (hasLink(scope)) {
      const ok = confirm(
        scope === 'register'
          ? 'Já existe um link de CADASTRO ativo. Gerar um novo invalida o atual — quem tiver o link antigo perde o acesso. Continuar?'
          : 'Já existe um link de GESTÃO ativo. Gerar um novo invalida o atual — o responsável perde o acesso pelo link antigo. Continuar?'
      );
      if (!ok) return;
    }

    try {
      setBusyScope(scope);
      const response = await fetch(`/api/admin/stands/${stand.id}/access-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // SEM sendEmail → só gera e retorna o link em claro (não emaila).
        body: JSON.stringify({ scope }),
      });
      const data = await response.json();
      if (response.ok) {
        setGenerated((prev) => ({ ...prev, [scope]: data.link }));
        setCopiedScope(null);
        onChanged();
      } else {
        alert(data.error || 'Erro ao gerar link');
      }
    } catch (error) {
      console.error('Error generating access link:', error);
      alert('Erro ao gerar link');
    } finally {
      setBusyScope(null);
    }
  };

  const handleSendEmail = async () => {
    if (!stand.responsibleEmail) return;
    if (
      !confirm(
        hasLink('manage')
          ? `Reenviar o link de GESTÃO para ${stand.responsibleEmail}? O link de gestão atual será invalidado.`
          : `Gerar e enviar o link de GESTÃO para ${stand.responsibleEmail}?`
      )
    )
      return;

    try {
      setEmailingScope('manage');
      const response = await fetch(`/api/admin/stands/${stand.id}/access-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'manage', sendEmail: true }),
      });
      const data = await response.json();
      if (response.ok) {
        alert(`✅ Link de gestão enviado para ${data.sentTo}`);
        // O e-mail também regenera o token; o link em claro não é exibido aqui.
        setGenerated((prev) => ({ ...prev, manage: undefined }));
        onChanged();
      } else {
        alert(data.error || 'Erro ao enviar link por e-mail');
      }
    } catch (error) {
      console.error('Error sending access link:', error);
      alert('Erro ao enviar link por e-mail');
    } finally {
      setEmailingScope(null);
    }
  };

  const handleRevoke = async (scope: Scope) => {
    if (
      !confirm(
        scope === 'register'
          ? `Revogar o link de CADASTRO do stand ${stand.name}? Quem tiver o link não conseguirá mais inscrever.`
          : `Revogar o link de GESTÃO do stand ${stand.name}? O responsável perderá o acesso ao painel até um novo link ser gerado.`
      )
    )
      return;

    try {
      setBusyScope(scope);
      const response = await fetch(`/api/admin/stands/${stand.id}/access-link`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      });
      const data = await response.json();
      if (response.ok) {
        setGenerated((prev) => ({ ...prev, [scope]: undefined }));
        onChanged();
      } else {
        alert(data.error || 'Erro ao revogar link');
      }
    } catch (error) {
      console.error('Error revoking access link:', error);
      alert('Erro ao revogar link');
    } finally {
      setBusyScope(null);
    }
  };

  const handleCopy = async (scope: Scope, link: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        // Fallback p/ contextos sem Clipboard API (http, navegadores antigos).
        const ta = document.createElement('textarea');
        ta.value = link;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedScope(scope);
      setTimeout(() => setCopiedScope((s) => (s === scope ? null : s)), 2000);
    } catch (error) {
      console.error('Error copying link:', error);
      alert('Não foi possível copiar automaticamente. Selecione o link e copie manualmente.');
    }
  };

  // CADASTRO: rota DIRETA /cadastro (pula a landing), Texto 2, sem fricção.
  // Envio direto pro telefone do responsável se ele validar; senão, picker de contato.
  const shareRegisterWhatsApp = (generatedLink: string) => {
    if (!eventName) return;
    openWhatsApp(
      waTextCadastro(eventName, `${generatedLink}/cadastro`, registrationDeadline),
      stand.responsiblePhone
    );
  };

  // GESTÃO: link "perigoso" (permite excluir) → confirm() antes; Texto 1, link como está.
  // Envio direto pro telefone cadastrado é mais seguro (o link restrito vai pro responsável certo).
  const shareManageWhatsApp = (generatedLink: string) => {
    if (!eventName) return;
    if (
      !confirm(
        'Este link permite EXCLUIR participantes. Envie APENAS ao responsável do stand, nunca à equipe. Continuar?'
      )
    )
      return;
    openWhatsApp(waTextGestao(eventName, stand.name, generatedLink), stand.responsiblePhone);
  };

  return (
    <>
      {/* ===== Resumo compacto na célula ===== */}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap gap-1">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              stand.hasRegisterLink ? 'bg-teal-100 text-teal-800' : 'bg-gray-100 text-gray-500'
            }`}
            title={stand.hasRegisterLink ? 'Link de cadastro ativo' : 'Sem link de cadastro'}
          >
            <span>{stand.hasRegisterLink ? '●' : '○'}</span>
            Cadastro
          </span>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              stand.hasManageLink ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'
            }`}
            title={stand.hasManageLink ? 'Link de gestão ativo' : 'Sem link de gestão'}
          >
            <span>{stand.hasManageLink ? '●' : '○'}</span>
            Gestão
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-blue-600 hover:text-blue-800 text-xs font-medium w-fit"
        >
          Gerenciar links
        </button>
      </div>

      {/* ===== Modal ===== */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Links de acesso do stand</h2>
                <p className="text-sm text-gray-600 mt-0.5">{stand.name}</p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            {/* Corpo: 2 cards distintos */}
            <div className="overflow-auto p-6 space-y-5 flex-1">
              {/* ---------- CARD CADASTRO (teal) ---------- */}
              <ScopeCard
                tone="register"
                title="Link de Cadastro"
                icon="🔗"
                badge="Compartilhável"
                description="Pode compartilhar com a equipe. Só inscreve participantes — não vê a lista de credenciados, nem fotos/CPF, e não exclui ninguém."
                active={!!stand.hasRegisterLink}
                generatedAt={formatDateTime(stand.registerGeneratedAt)}
                lastUsedAt={formatDateTime(stand.registerLastUsedAt)}
                generatedLink={generated.register}
                busy={busyScope === 'register'}
                copied={copiedScope === 'register'}
                onGenerate={() => handleGenerate('register')}
                onRevoke={() => handleRevoke('register')}
                onCopy={(link) => handleCopy('register', link)}
                whatsapp={
                  eventName
                    ? {
                        label: `${WA_EMOJI.phone} Compartilhar por WhatsApp — Cadastro da equipe`,
                        onShare: shareRegisterWhatsApp,
                      }
                    : undefined
                }
              />

              {/* ---------- CARD GESTÃO (âmbar/vermelho) ---------- */}
              <ScopeCard
                tone="manage"
                title="Link de Gestão"
                icon="🛡️"
                badge="Restrito"
                description="Uso exclusivo do responsável. Vê a lista de credenciados (com fotos/CPF) e pode EXCLUIR membros."
                warning="NÃO compartilhe este link. Quem o tiver poderá ver os dados pessoais dos credenciados e excluí-los."
                active={!!stand.hasManageLink}
                generatedAt={formatDateTime(stand.manageGeneratedAt)}
                lastUsedAt={formatDateTime(stand.manageLastUsedAt)}
                generatedLink={generated.manage}
                busy={busyScope === 'manage'}
                copied={copiedScope === 'manage'}
                onGenerate={() => handleGenerate('manage')}
                onRevoke={() => handleRevoke('manage')}
                onCopy={(link) => handleCopy('manage', link)}
                whatsapp={
                  eventName
                    ? {
                        label: `${WA_EMOJI.lock} Enviar SÓ ao responsável (WhatsApp) — Gestão`,
                        onShare: shareManageWhatsApp,
                      }
                    : undefined
                }
                email={{
                  responsibleEmail: stand.responsibleEmail,
                  sending: emailingScope === 'manage',
                  onSend: handleSendEmail,
                }}
              />
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t bg-gray-50 flex justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="px-5 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 font-medium"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================ Card de um scope ============================ */

interface ScopeCardEmail {
  responsibleEmail?: string;
  sending: boolean;
  onSend: () => void;
}

interface ScopeCardWhatsApp {
  label: string;
  /** Recebe o link em claro recém-gerado (o card monta o texto e abre o WhatsApp). */
  onShare: (generatedLink: string) => void;
}

interface ScopeCardProps {
  tone: Scope;
  title: string;
  icon: string;
  badge: string;
  description: string;
  warning?: string;
  active: boolean;
  generatedAt: string | null;
  lastUsedAt: string | null;
  generatedLink?: string;
  busy: boolean;
  copied: boolean;
  onGenerate: () => void;
  onRevoke: () => void;
  onCopy: (link: string) => void;
  email?: ScopeCardEmail;
  whatsapp?: ScopeCardWhatsApp;
}

function ScopeCard({
  tone,
  title,
  icon,
  badge,
  description,
  warning,
  active,
  generatedAt,
  lastUsedAt,
  generatedLink,
  busy,
  copied,
  onGenerate,
  onRevoke,
  onCopy,
  email,
  whatsapp,
}: ScopeCardProps) {
  const isManage = tone === 'manage';

  const cardCls = isManage
    ? 'border-amber-300 bg-amber-50'
    : 'border-teal-300 bg-teal-50';
  const badgeCls = isManage
    ? 'bg-amber-200 text-amber-900'
    : 'bg-teal-200 text-teal-900';
  const titleCls = isManage ? 'text-amber-900' : 'text-teal-900';
  const generateBtnCls = isManage
    ? 'bg-amber-600 hover:bg-amber-700 text-white'
    : 'bg-teal-600 hover:bg-teal-700 text-white';

  return (
    <div className={`rounded-lg border-2 p-4 ${cardCls}`}>
      {/* Cabeçalho do card */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className={`font-bold flex items-center gap-2 ${titleCls}`}>
          <span aria-hidden>{icon}</span>
          {title}
        </h3>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badgeCls}`}>
            {badge}
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              active ? 'bg-white/70 text-gray-800' : 'bg-white/50 text-gray-500'
            }`}
          >
            {active ? '● Ativo' : '○ Sem link'}
          </span>
        </div>
      </div>

      <p className="text-sm text-gray-700">{description}</p>

      {/* Banner de aviso (só gestão) */}
      {warning && (
        <div className="mt-2 flex items-start gap-2 rounded-md bg-red-100 border border-red-300 px-3 py-2 text-sm text-red-800">
          <span aria-hidden>⚠</span>
          <span>{warning}</span>
        </div>
      )}

      {/* Metadados do link ativo */}
      {active && (generatedAt || lastUsedAt) && (
        <div className="mt-2 text-xs text-gray-500 space-y-0.5">
          {generatedAt && <p>Gerado em {generatedAt}</p>}
          <p>{lastUsedAt ? `Último uso em ${lastUsedAt}` : 'Ainda não utilizado'}</p>
        </div>
      )}

      {/* Link em claro recém-gerado (mostrado uma vez) */}
      {generatedLink && (
        <div className="mt-3 rounded-md bg-white border border-gray-300 p-3">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={generatedLink}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 px-2 py-1.5 text-sm font-mono bg-gray-50 border border-gray-200 rounded select-all"
            />
            <button
              type="button"
              onClick={() => onCopy(generatedLink)}
              className="px-3 py-1.5 rounded bg-gray-800 text-white text-sm font-medium hover:bg-gray-900 shrink-0"
            >
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>

          {/* Compartilhar por WhatsApp — cadastro (verde, primário) × gestão (âmbar, outline) */}
          {whatsapp && (
            <div className="mt-2.5 border-t border-gray-100 pt-2.5">
              <button
                type="button"
                onClick={() => whatsapp.onShare(generatedLink)}
                className={
                  isManage
                    ? 'inline-flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium border border-amber-500 bg-white text-amber-800 hover:bg-amber-100'
                    : 'inline-flex w-full justify-center items-center gap-2 px-3 py-2 rounded text-sm font-semibold bg-green-600 text-white hover:bg-green-700'
                }
              >
                {whatsapp.label}
              </button>
              <p className="text-xs text-gray-500 mt-1.5">disponível só agora; pra reenviar, gere outro</p>
            </div>
          )}

          <p className="text-xs text-gray-500 mt-1.5">
            Mostrado uma única vez — o link não fica salvo. Se precisar dele de novo, gere outro
            (o atual será invalidado).
          </p>
        </div>
      )}

      {/* Ações */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={busy}
          className={`px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${generateBtnCls}`}
        >
          {busy ? 'Processando...' : active ? 'Regenerar' : 'Gerar link'}
        </button>

        {active && (
          <button
            type="button"
            onClick={onRevoke}
            disabled={busy}
            className="px-3 py-1.5 rounded text-sm font-medium border border-gray-300 bg-white text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Revogar
          </button>
        )}

        {/* Enviar por e-mail — só no card de gestão */}
        {email && (
          <button
            type="button"
            onClick={email.onSend}
            disabled={email.sending || !email.responsibleEmail}
            title={
              !email.responsibleEmail
                ? 'Cadastre o e-mail do responsável para enviar por e-mail'
                : `Enviar para ${email.responsibleEmail}`
            }
            className="px-3 py-1.5 rounded text-sm font-medium border border-amber-400 bg-white text-amber-800 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {email.sending ? 'Enviando...' : '✉ Enviar por e-mail'}
          </button>
        )}
      </div>

      {/* Nota do canal de e-mail (gestão sem responsável) */}
      {email && !email.responsibleEmail && (
        <p className="text-xs text-gray-500 mt-1.5">
          Sem e-mail de responsável cadastrado — edite o stand para habilitar o envio por e-mail.
        </p>
      )}
    </div>
  );
}
