import { Suspense } from 'react'
import RedirecionamentosLegados from '../components/institucional/RedirecionamentosLegados'
import './institucional.css'

/**
 * PÁGINA INSTITUCIONAL — raiz "/" de megacredenciamento.com.br.
 *
 * SERVER COMPONENT, pré-renderizado estático. Sem estado e sem chamada de API.
 * Os dois redirecionamentos de compatibilidade (?event= e ?update=) vivem em
 * components/institucional/RedirecionamentosLegados — links antigos com esses
 * parâmetros continuam circulando, mas o hook que os lê não pode ficar nesta
 * árvore, senão o HTML servido sai vazio.
 *
 * ── O que NÃO mudou nesta troca ───────────────────────────────────────────
 * Nada de autenticação, NextAuth, middleware, papéis, EventAdmin, links de
 * token (/stand, /editar), rotas de /admin, APIs ou manifest do PWA. A mudança
 * é de aparência, e só na raiz.
 *
 * ⚠️ O manifest (public/manifest.json) segue com `start_url: "/"`. Quem instalou
 * o PWA no celular passa a abrir ESTA página em vez do cadastro. Não alterei
 * porque está fora do escopo pedido, mas é a consequência a decidir: ou o
 * start_url aponta para onde o cadastro passar a morar, ou o app instalado abre
 * a institucional.
 */

export default function HomePage() {
  return (
    <div className="institucional">
      {/* Só os redirecionamentos legados dependem do cliente. Eles vivem num
          componente à parte que não desenha nada: `useSearchParams` dentro da
          árvore da página faria o Next.js servir HTML VAZIO
          (BAILOUT_TO_CLIENT_SIDE_RENDERING), e numa página institucional isso
          significa buscador vendo página em branco. */}
      <Suspense fallback={null}>
        <RedirecionamentosLegados />
      </Suspense>

      <header className="topo">
        <div className="env topo-in">
          <a className="marca" href="#">
            <b>
              <i>mega</i>credenciamento
            </b>
            <span>controle de acesso</span>
          </a>
          <nav className="nav">
            <a href="#onde">Clientes</a>
            <a href="#solucoes">O grupo</a>
            <a href="#como">Como funciona</a>
            <a href="#tecnica">Ficha técnica</a>
          </nav>
          <div className="topo-acoes">
            <a className="btn btn-chave" href="/admin/login">
              <svg viewBox="0 0 16 16" aria-hidden="true" width="13" height="13">
                <path d="M4 7V4.6a4 4 0 0 1 8 0V7" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <rect x="2.4" y="7" width="11.2" height="7.2" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
              </svg>
              Área do cliente
            </a>
            <a className="btn btn-cheio" href="#contato">
              Falar com a gente
            </a>
          </div>
        </div>
      </header>

      <div className="hero">
        <div className="env hero-in">
          <div>
            <h1>O rosto de quem entra é a credencial.</h1>
            <p className="lede">
              Controle de acesso, credenciamento facial, bilheteria e estacionamento para eventos de
              qualquer porte. O expositor no portão do pavilhão, o público na catraca do show, o
              motorista no pátio — tudo na mesma operação.
            </p>
            <div className="hero-botoes">
              <a className="btn btn-cheio" href="#contato">
                Pedir uma proposta
              </a>
              <a className="btn btn-linha" href="#tecnica">
                Ver a ficha técnica
              </a>
            </div>
            <p className="hero-rodape">
              Feiras, shows, casas de eventos e estacionamentos. Nossa equipe monta, opera e
              acompanha o acesso durante todos os dias do evento.
            </p>
          </div>

          <div className="terminal" aria-label="Exemplo de leitura em um terminal de acesso">
            <div className="terminal-topo">
              <span className="ponto">
                <i className="led"></i> Ponto A — Terminal 1
              </span>
              <span>Portão principal</span>
            </div>
            <div className="quadro">
              <div className="oval"></div>
              <div className="rosto">
                <svg viewBox="0 0 96 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path
                    d="M48 14c16 0 27 12 27 30 0 13-4 24-11 31-5 5-10 8-16 8s-11-3-16-8c-7-7-11-18-11-31 0-18 11-30 27-30z"
                    fill="none"
                    stroke="#DDE6EC"
                    strokeWidth="2"
                  />
                  <path
                    d="M6 130c3-24 20-36 42-36s39 12 42 36"
                    fill="none"
                    stroke="#DDE6EC"
                    strokeWidth="2"
                  />
                </svg>
              </div>
              <div className="scan"></div>
              <div className="selo">
                <b>Liberado</b>
                <span>0,8 s</span>
              </div>
            </div>
            <dl style={{ margin: 0 }}>
              <div className="linha-dado">
                <dt>Credenciado</dt>
                <dd>Marcos A. Reis</dd>
              </div>
              <div className="linha-dado">
                <dt>Acesso</dt>
                <dd>Áreas internas</dd>
              </div>
              <div className="linha-dado">
                <dt>Validade</dt>
                <dd>Todos os dias do evento</dd>
              </div>
            </dl>
            <div className="rele">
              <span>Relé</span>
              <span className="rele-barra">
                <i></i>
              </span>
              <span>aberto</span>
            </div>
          </div>
        </div>
      </div>

      <div className="numeros">
        <div className="env numeros-in">
          <div className="numero">
            <b>7</b>
            <span>feiras e eventos atendidos</span>
          </div>
          <div className="numero">
            <b>+12 mil</b>
            <span>credenciados cadastrados</span>
          </div>
          <div className="numero">
            <b>4</b>
            <span>pontos de acesso simultâneos por evento</span>
          </div>
          <div className="numero">
            <b>11</b>
            <span>dias seguidos de operação no maior deles</span>
          </div>
        </div>
      </div>

      <section id="onde">
        <div className="env">
          <h2>Alguns de nossos clientes</h2>
          <p className="intro">
            Cada evento tem seu jeito de funcionar: portão de expositor, bilheteria de público,
            catraca de pavilhão, pátio de estacionamento. Estas são operações em que já estivemos
            dentro do local, com equipe e equipamento.
          </p>

          <div className="grade-marcas">
            {/* Logos extraídos do base64 do HTML original para public/logos/ —
                tirou ~54 KB do documento e deixa o navegador cachear cada um. */}
            <div className="marca-item">
              <div className="placa">
                <img src="/logos/expodireto-cotrijal.jpg" alt="Expodireto Cotrijal" />
              </div>
              <p className="cidade">Expodireto Cotrijal — Não-Me-Toque, RS</p>
              <p className="meta">Credenciamento e estacionamento.</p>
            </div>

            <div className="marca-item">
              <div className="placa">
                <img className="tile" src="/logos/fenasoja.jpg" alt="Fenasoja" />
              </div>
              <p className="cidade">Fenasoja — Santa Rosa, RS</p>
              <p className="meta">Credenciamento e estacionamento.</p>
            </div>

            <div className="marca-item">
              <div className="placa">
                <img src="/logos/expofest.png" alt="Expofest" />
              </div>
              <p className="cidade">Expofest — Ijuí, RS</p>
              <p className="meta">Credenciamento facial, bilheteria e estacionamento.</p>
            </div>

            <div className="marca-item">
              <div className="placa">
                <img src="/logos/feicap.jpg" alt="FEICAP" />
              </div>
              <p className="cidade">FEICAP — Três Passos, RS</p>
              <p className="meta">Credenciamento e estacionamento.</p>
            </div>

            <div className="marca-item">
              <div className="placa">
                <img src="/logos/feaagri.jpg" alt="FEAAGRI" />
              </div>
              <p className="cidade">FEAAGRI — Região das Missões, RS</p>
              <p className="meta">Credenciamento facial e estacionamento.</p>
            </div>

            <div className="marca-item">
              <div className="placa">
                <img className="tile" src="/logos/construsul.jpg" alt="Construsul" />
              </div>
              <p className="cidade">Construsul — Porto Alegre, RS</p>
              <p className="meta">Estacionamento.</p>
            </div>

            <div className="marca-item">
              <div className="placa">
                <img src="/logos/expoagas.jpg" alt="Expoagas" />
              </div>
              <p className="cidade">Expoagas — Porto Alegre, RS</p>
              <p className="meta">Estacionamento.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="servicos" id="solucoes">
        <div className="env">
          <h2>Quatro frentes, uma equipe no local</h2>
          <p className="intro">
            Cada porta do evento tem uma operação própria, e elas funcionam separadas ou juntas.
            Quando o evento contrata mais de uma, é a mesma equipe que monta, opera e presta contas.
          </p>
          <div className="grupo">
            <div className="frente frente-aqui">
              <p className="selo-aqui">Esta plataforma</p>
              <h3>
                <i>mega</i>credenciamento
              </h3>
              <p className="papel">Acesso de público a eventos</p>
              <p className="desc">
                Credenciamento facial, catracas e portões. Define quem entra, por onde e em quais
                dias, com o rosto no lugar do crachá e da conferência de documento.
              </p>
            </div>

            <div className="frente">
              <h3>
                <i>mega</i>entrada
              </h3>
              <p className="papel">Bilheteria</p>
              <p className="desc">
                Venda de ingressos online e na entrada, com ingresso nominal por portador e repasse
                ao produtor. Integra com a bilheteria que o cliente já usa quando a troca não faz
                sentido.
              </p>
            </div>

            <div className="frente">
              <h3>
                <i>mega</i>estacionamento
              </h3>
              <p className="papel">Acesso de veículos</p>
              <p className="desc">
                Gestão de pátios em eventos de grande fluxo: cobrança, equipe de pista, emissão
                fiscal de cada venda e prestação de contas diária.
              </p>
            </div>

            <div className="frente">
              <h3>
                <i>mega</i>feira
              </h3>
              <p className="papel">Soluções integradas para feiras e eventos</p>
              <p className="desc">
                Quando o evento precisa das frentes operando juntas, com equipamento instalado,
                equipe em campo e um único interlocutor do começo ao fim.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="como">
        <div className="env">
          <h2>Como funciona na prática</h2>
          <p className="intro">Do primeiro cadastro até o dia em que o portão abre.</p>
          <div className="passos">
            <div className="passo">
              <h3>Cadastro pelo celular</h3>
              <p>
                Cada responsável recebe um link próprio. Quem vai entrar preenche os dados e tira a
                foto ali mesmo, sem instalar aplicativo.
              </p>
            </div>
            <div className="passo">
              <h3>Aprovação de quem libera</h3>
              <p>
                Quem conhece a equipe é quem aprova. A organização define as vagas e enxerga tudo,
                com registro de quem aprovou o quê.
              </p>
            </div>
            <div className="passo">
              <h3>Envio aos terminais</h3>
              <p>
                O rosto aprovado chega aos equipamentos de todos os pontos de acesso antes da
                abertura, e a fila reprocessa sozinha o que falhar.
              </p>
            </div>
            <div className="passo">
              <h3>Evento aberto</h3>
              <p>
                A pessoa chega, olha para o terminal e passa. Nossa equipe fica no local todos os
                dias.
              </p>
            </div>
          </div>

          <h2 id="tecnica" style={{ marginTop: '4rem' }}>
            Ficha técnica
          </h2>
          <p className="intro">
            Plataforma desenvolvida por nós, do cadastro ao acionamento do portão. O que está abaixo
            é o que o seu time de operações vai querer perguntar.
          </p>
          <dl className="ficha">
            <div className="ficha-linha">
              <dt>Terminais</dt>
              <dd>
                Equipamentos <b>Hikvision</b> de reconhecimento facial, controlados por integração
                direta via ISAPI. Não há software intermediário entre a nossa plataforma e o
                aparelho — um elo a menos para quebrar no dia do evento.
              </dd>
            </div>
            <div className="ficha-linha">
              <dt>Capacidade</dt>
              <dd>
                Até <b>50.000 rostos por equipamento</b>, com vários pontos de acesso operando em
                paralelo. Cada ponto carrega a base completa de credenciados, então ninguém fica
                preso a uma única entrada.
              </dd>
            </div>
            <div className="ficha-linha">
              <dt>Tempo de passagem</dt>
              <dd>
                Menos de um segundo entre o rosto e o acionamento do relé. Sem toque, sem apresentar
                documento, sem leitura de código.
              </dd>
            </div>
            <div className="ficha-linha">
              <dt>Queda de internet</dt>
              <dd>
                Um agente instalado no local mantém os terminais liberando acesso mesmo com a rede
                fora do ar. As alterações feitas nesse período ficam em fila e sobem sozinhas quando
                a conexão volta.
              </dd>
            </div>
            <div className="ficha-linha">
              <dt>Sincronização</dt>
              <dd>
                Fila com retentativa automática e reconciliação periódica entre o sistema e cada
                aparelho. Se um equipamento recusar um cadastro, a falha aparece nomeada, com o erro
                que o aparelho devolveu e botão para reenviar.
              </dd>
            </div>
            <div className="ficha-linha">
              <dt>Captura da foto</dt>
              <dd>
                Feita no navegador do próprio celular, sem instalar aplicativo. O rosto é detectado e
                o enquadramento validado <b>antes</b> do envio, e a imagem é comprimida para o
                formato que o terminal aceita.
              </dd>
            </div>
            <div className="ficha-linha">
              <dt>Integração</dt>
              <dd>
                API para receber dados de bilheterias e sistemas de gestão que o cliente já usa. O
                ingresso nominal vira acesso facial: o comprador recebe um link, tira a foto e chega
                ao evento já liberado.
              </dd>
            </div>
            <div className="ficha-linha">
              <dt>Auditoria</dt>
              <dd>
                Cada aprovação, remoção e passagem fica gravada com autor, data e equipamento. Quando
                a organização delega a aprovação a terceiros, o registro guarda a pessoa real, não um
                usuário genérico.
              </dd>
            </div>
            <div className="ficha-linha">
              <dt>Privacidade e LGPD</dt>
              <dd>
                Consentimento registrado no momento do cadastro, template biométrico gerado dentro do
                próprio equipamento e expurgo da biometria no encerramento do evento, preservando
                apenas o registro do consentimento.
              </dd>
            </div>
            <div className="ficha-linha">
              <dt>Acesso ao sistema</dt>
              <dd>
                Aplicação web, sem nada a instalar na máquina do cliente. Conta nominal com senha,
                permissão por papel, sessão que expira em 24 horas, bloqueio automático após
                tentativas seguidas de senha errada e revogação imediata.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="servicos claro" id="painel">
        <div className="env painel-in">
          <div>
            <h2>Área do cliente</h2>
            <p className="intro" style={{ marginBottom: '1.4rem' }}>
              A organização entra com conta nominal, e-mail e senha próprios. Quem entra vê só o que
              é do seu evento, e toda ação fica registrada com o nome de quem fez. Quem cadastra a
              equipe do stand não precisa de senha: recebe um link.
            </p>
            <a className="btn btn-cheio" href="/admin/login">
              Entrar no painel
            </a>
          </div>
          <div className="perfis">
            <div className="perfil">
              <h3>Organização do evento</h3>
              <p>
                Entra com conta própria. Acompanha os stands, as vagas contratadas e os credenciados
                aprovados, gera os links de cadastro e vê o movimento dos portões.
              </p>
            </div>
            <div className="perfil">
              <h3>Responsável do stand</h3>
              <p>
                Não precisa de conta nem de senha. Recebe da organização um link exclusivo do seu
                stand, que abre direto no celular para cadastrar e conferir a equipe.
              </p>
            </div>
            <div className="perfil">
              <h3>Portaria</h3>
              <p>
                O operador de portão entra numa conta que só enxerga a tela de controle de acesso.
                Nada de dados do evento, nada de exclusão.
              </p>
            </div>
            <div className="perfil">
              <h3>Acesso concedido, não solicitado</h3>
              <p>
                Não há cadastro aberto nesta tela. Quem cria e revoga as contas é a organização, e a
                conta bloqueia sozinha após tentativas seguidas de senha errada.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="cta" id="contato">
        <div className="env cta-in" style={{ padding: '4rem 0' }}>
          <div>
            <h2>Qual é o seu evento?</h2>
            <p>
              Conte quantas pessoas passam, quantos pontos de acesso e quantos dias. Devolvemos uma
              proposta com equipe, equipamento e prazo.
            </p>
          </div>
          <div className="cta-acoes">
            <a className="btn btn-cheio" href="https://wa.me/5551000000000">
              Chamar no WhatsApp
            </a>
            <a className="btn btn-linha" href="mailto:contato@megacredenciamento.com.br">
              Mandar um e-mail
            </a>
          </div>
        </div>
      </div>

      <footer>
        <div className="env rodape-in">
          <div>
            <b>megacredenciamento.com.br</b>
            <br />
            contato@megacredenciamento.com.br
          </div>
          <div className="razao">
            Plataforma operada por Mega Feira Tecnologia para Acessos Ltda
            <br />
            CNPJ 32.311.191/0001-07 — São Leopoldo, RS
          </div>
        </div>
      </footer>
    </div>
  )
}
