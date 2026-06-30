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
}

function formatDateTime(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function StandLinksCell({ stand, onChanged }: StandLinksCellProps) {
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
