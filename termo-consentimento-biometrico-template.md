# Termo de Consentimento para Coleta e Tratamento de Dado Biométrico Facial

**Controle de Acesso por Reconhecimento Facial**

> **COMO USAR ESTE TEMPLATE:** O corpo do termo é fixo e vale para qualquer evento. Apenas os campos entre `{{chaves}}` mudam por evento — o sistema os preenche automaticamente a partir do cadastro do evento. Os campos entre [colchetes] são dados fixos da empresa, preenchidos uma vez. Antes do primeiro uso, este modelo deve ser revisado por advogado(a) especializado(a) em LGPD.

---

## 1. Quem coleta seus dados (Controlador)

Os seus dados pessoais são coletados e tratados por:

**Mega Feira Tecnologia para Acessos Ltda**, inscrita no CNPJ sob nº **32.311.191/0001-07**, com sede na **Rua São Joaquim, 1085, Centro, São Leopoldo/RS**, doravante denominada "Controladora".

**Contato do Encarregado de Dados (DPO):** Luís Eduardo Dornelles — dornelles@megafeira.com

Esta coleta refere-se ao evento **{{NOME_DO_EVENTO}}**, realizado em **{{LOCAL_DO_EVENTO}}**, no período de **{{DATA_INICIO}}** a **{{DATA_FIM}}**.

---

## 2. Que dado é coletado

A Controladora coletará a sua **imagem facial (fotografia do rosto)** e dela extrairá um **modelo biométrico** (representação matemática dos traços do seu rosto) para fins de reconhecimento facial.

A imagem facial e o modelo biométrico são classificados pela Lei Geral de Proteção de Dados (Lei nº 13.709/2018) como **dado pessoal sensível** (art. 5º, II, e art. 11), recebendo proteção reforçada.

São também coletados os dados de identificação informados no cadastro: **{{CAMPOS_COLETADOS}}** (ex.: nome, CPF, e-mail, telefone).

---

## 3. Para que seu dado será usado (Finalidade)

O seu dado biométrico facial será usado **exclusivamente** para:

- **Controle de acesso ao evento {{NOME_DO_EVENTO}}** — permitir e registrar a sua entrada por reconhecimento facial, dispensando crachá físico.

{{FINALIDADES_ADICIONAIS}}
*(Campo opcional. Preencher apenas se o evento usar a face para algo além da entrada — ex.: acesso a áreas restritas, estandes. Se for só entrada, este campo fica vazio e o termo se mantém mínimo.)*

O seu dado biométrico **não será** usado para finalidade diversa da informada, não será vendido, nem compartilhado com terceiros para fins comerciais ou de marketing.

---

## 4. Como seu dado é protegido

- A sua imagem facial é armazenada de forma **criptografada** (padrão AES-256-GCM), nunca em texto aberto.
- O acesso aos dados é restrito e controlado.
- O modelo biométrico enviado aos terminais de acesso trafega de forma protegida.

---

## 5. Por quanto tempo seu dado é guardado (Retenção)

O seu dado biométrico facial será mantido **até o encerramento do evento {{NOME_DO_EVENTO}} e por até {{PRAZO_RETENCAO}} após o seu término**, prazo após o qual será **eliminado** de forma definitiva dos nossos sistemas e dos terminais de acesso.

*(Padrão do sistema: 90 dias. Ajustável por evento se houver justificativa — ex.: prestação de contas, auditoria.)*

---

## 6. Seus direitos (art. 18 da LGPD)

A qualquer momento, gratuitamente, você pode:

- **Revogar este consentimento** e solicitar a eliminação imediata do seu dado biométrico;
- **Confirmar** se tratamos seus dados e **acessá-los**;
- **Corrigir** dados incompletos ou desatualizados;
- Solicitar a **eliminação** dos dados tratados com base neste consentimento;
- Obter **informação** sobre com quem compartilhamos seus dados.

Para exercer qualquer direito, contate: **Luís Eduardo Dornelles (Encarregado de Dados) — dornelles@megafeira.com**.

**A revogação do consentimento ou a recusa em fornecer o dado biométrico não impede o seu acesso ao evento** — será oferecido um meio alternativo de credenciamento: **crachá com QR code**.

---

## 7. Consentimento livre e informado

Ao marcar a opção de aceite e prosseguir com o cadastro, você declara que:

- Leu e compreendeu este termo;
- Tem **18 anos ou mais**;
- Consente, de forma **livre, informada e específica**, com a coleta e o tratamento do seu dado biométrico facial para a finalidade descrita no item 3, no contexto do evento **{{NOME_DO_EVENTO}}**.

*(Versão do termo: {{VERSAO_TERMO}} — registrada no aceite para fins de prova.)*

---

## Guia dos campos (para configuração do sistema)

**Campos variáveis por evento (preenchidos automaticamente do cadastro do evento):**

| Campo | O que é | Exemplo |
|---|---|---|
| `{{NOME_DO_EVENTO}}` | Nome do evento | Expofest 2026 |
| `{{LOCAL_DO_EVENTO}}` | Cidade/local | Ijuí, RS |
| `{{DATA_INICIO}}` / `{{DATA_FIM}}` | Datas do evento | 09/10/2026 a 19/10/2026 |
| `{{CAMPOS_COLETADOS}}` | Dados pedidos no formulário | nome, CPF, e-mail, telefone |
| `{{FINALIDADES_ADICIONAIS}}` | Usos além da entrada (opcional) | (vazio se só entrada) |
| `{{PRAZO_RETENCAO}}` | Tempo de guarda pós-evento | 90 dias |
| `{{MEIO_ALTERNATIVO}}` | Acesso para quem recusa a face (padrão: crachá QR) | crachá com QR code |
| `{{VERSAO_TERMO}}` | Versão do modelo aceito | v1.0 |

**Campos fixos da empresa (preenchidos uma vez, valem para todos os eventos):** razão social, CNPJ, endereço, nome e contato do Encarregado (DPO).

---

## Observações para a revisão jurídica (não exibir ao titular)

1. **Menores de idade:** o modelo pressupõe titulares adultos. Se ALGUM evento for cadastrar menores de 18, é preciso uma variante do termo com consentimento de responsável (art. 14 da LGPD). Recomenda-se um campo no cadastro do evento do tipo "admite menores? sim/não" que selecione a variante correta do termo.

2. **Papel da empresa (controladora vs. operadora):** este modelo assume a Mega Feira como **Controladora**. Em eventos onde a organização define o tratamento, pode haver controladoria conjunta ou a Mega Feira como operadora — o que muda a redação. Avaliar se vale uma variante "operadora" do termo para esses casos.

3. **Base legal:** consentimento (art. 11, I) para o dado biométrico sensível. Confirmar adequação com o jurídico.

4. **Versionamento do termo:** sempre que o texto do modelo mudar, incrementar `{{VERSAO_TERMO}}`. O sistema deve registrar, no aceite de cada pessoa, qual versão foi aceita — para prova futura caso o termo evolua.

5. **Meio alternativo:** manter sempre uma opção não-biométrica reforça a validade do consentimento (mostra que é livre). Garantir que essa alternativa exista de fato na operação.
