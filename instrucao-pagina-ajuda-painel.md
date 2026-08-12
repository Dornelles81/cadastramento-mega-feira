# Instrução — Página de ajuda no painel do responsável

Adicione uma página de ajuda acessível de dentro do painel do stand (`/stand/[token]/ajuda` ou modal/drawer "Como funciona" no cabeçalho do painel — escolha o que se integrar melhor à UI existente). Mesma validação de token do painel; sem token válido, mesma página de erro genérica. Tom informal, visual leve, identidade Mega Feira. O conteúdo abaixo é o texto final — pode ajustar quebras e ícones, mas não o sentido das regras.

---

## Como funciona o credenciamento do seu stand

### 🔑 Seu link é a chave
O link que você recebeu por e-mail dá acesso só ao **seu** stand — ninguém vê os dados de outro expositor, e você não vê os dos demais. Guarde bem e compartilhe apenas com pessoas de confiança da sua equipe: quem tem o link consegue cadastrar e excluir participantes do stand.

Perdeu o link ou acha que ele vazou? Fale com a organização — a gente revoga o antigo e envia um novo na hora.

### ✅ Cadastrando sua equipe
Toque em **Cadastrar credenciado** ou encaminhe o link para a própria pessoa se cadastrar pelo celular dela. O cadastro pede os dados pessoais e uma foto do rosto — é ela que libera a entrada nas catracas com reconhecimento facial, então capricha: rosto de frente, sem boné e sem óculos escuros, em lugar iluminado.

### 📊 Acompanhando as vagas
O painel mostra em tempo real quantas vagas estão ocupadas e quem está cadastrado. O número de vagas do seu stand é o contratado com a organização do evento.

### 🔄 Trocando alguém da equipe
Precisou substituir uma pessoa? Toque em **Excluir** ao lado do nome, confirme, e a vaga abre para um novo cadastro. A pessoa excluída perde o acesso ao evento imediatamente e os dados da foto dela são apagados do sistema.

**Atenção à regra da troca:** se a pessoa excluída **já entrou no evento naquele dia**, a vaga só fica disponível para um novo cadastro **a partir das 4h da manhã do dia seguinte**. Se ela ainda não tinha acessado no dia, a vaga libera na hora. O próprio painel avisa qual é o caso antes de você confirmar a exclusão.

> Por que essa regra existe? As credenciais do stand são pessoais e servem para a equipe que trabalha nele. A regra garante que cada vaga corresponda a uma pessoa por dia, como previsto no contrato do evento.

### 🔒 Privacidade e segurança
Todos os cadastros, acessos e exclusões ficam registrados. As fotos faciais são armazenadas criptografadas e apagadas automaticamente após o evento, conforme a LGPD. Ao excluir alguém, os dados sensíveis dele são removidos na hora.

### 💬 Precisa de ajuda?
Fale com a organização do evento pelos canais informados no seu e-mail de credenciamento.

---

## Notas de implementação

- Onde a página menciona "4h da manhã", renderizar o valor real de `dayResetHour` do evento, formatado ("4h", "5h"...). Não deixar o número fixo no texto.
- Se a cota de substituições estiver ativada no evento (`substitutionQuotaEnabled`), exibir uma seção adicional após "Trocando alguém da equipe": **"📌 Limite de trocas: durante o evento, seu stand tem direito a {N} substituições no total (o contador aparece no painel). Precisando de mais, fale com a organização."** — com N calculado (maxRegistrations × substitutionsPerSlot). Se desativada, a seção não aparece.
- Link/botão de acesso à ajuda visível no painel (cabeçalho ou rodapé) e também na tela de "stand sem vagas no momento", que é onde a dúvida sobre a regra das 4h mais vai surgir.
- Nenhum dado dinâmico além dos citados; a página não expõe nomes de participantes nem informações de outros stands.
