// Hikvision Access Controller Client
// For DS-K1T671M-L Face Recognition Terminal

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { DigestAuth } from './digest-auth';

export interface HikvisionUser {
  employeeNo: string;
  name: string;
  userType?: 'normal' | 'visitor' | 'blackList';
  password?: string;
  valid?: {
    enable: boolean;
    beginTime: string;
    endTime: string;
  };
  gender?: 'male' | 'female' | 'unknown';
  roomNumber?: number;
  floorNumber?: number;
}

export interface HikvisionFace {
  employeeNo: string;
  faceDataRecord: {
    faceData: string; // Base64 encoded face image
  };
}

// Credencial por instância — injetada por quem constrói o client (na nuvem, o
// endpoint do agente decripta a senha do Terminal e a passa aqui). Este módulo
// NÃO lê env de credencial, não toca Prisma e não conhece a MASTER_KEY: só faz
// ISAPI/axios contra o IP informado.
export interface HikvisionClientConfig {
  ipAddress: string;
  port?: number;      // default 80
  useHttps?: boolean; // default false
  username: string;
  password: string;
  /**
   * Observador OPCIONAL de cada requisição ISAPI (status HTTP + corpo cru do
   * device + esquema de auth usado). Existe para os runners de bancada
   * conseguirem logar degrau a degrau — inclusive no SUCESSO, onde o retorno
   * normal só entrega o corpo. Nenhum chamador de produção passa isto.
   */
  observer?: (obs: HikvisionObservation) => void;
}

/** Evento de uma requisição ISAPI. Nunca carrega credencial. */
export interface HikvisionObservation {
  context: string;
  method: string;
  path: string;
  scheme: 'digest' | 'basic';
  status?: number;   // HTTP status; undefined em erro de rede (sem resposta)
  code?: string;     // ECONNREFUSED, ETIMEDOUT, ...
  ok: boolean;
  body?: unknown;    // corpo do device (sanitizado por construção: sem auth)
}

/**
 * Erro SANITIZADO do device. Carrega apenas o contexto, o status HTTP e o corpo
 * de erro do próprio device (ex.: {statusCode, statusString, subStatusCode}) —
 * NUNCA a credencial. É o único tipo de erro que escapa do client, justamente
 * para que nenhum log (do client ou de um chamador) imprima a senha: o objeto
 * de erro cru do axios contém config.auth e vazaria a senha em todo erro de
 * rede com um terminal.
 */
export class HikvisionError extends Error {
  status?: number;
  deviceStatus?: unknown;
  code?: string;
  constructor(message: string, opts: { status?: number; deviceStatus?: unknown; code?: string } = {}) {
    super(message);
    this.name = 'HikvisionError';
    this.status = opts.status;
    this.deviceStatus = opts.deviceStatus;
    this.code = opts.code;
  }
}

// Converte um erro do axios em HikvisionError, descartando tudo que possa conter
// credencial (config.auth, headers Authorization, responseUrl com user:pass@host).
function sanitizeError(context: string, error: any): HikvisionError {
  const status: number | undefined = error?.response?.status;
  const deviceStatus = error?.response?.data; // corpo do device: sem credencial
  const code: string | undefined = error?.code;
  const parts = [`${context} falhou`];
  if (status) parts.push(`HTTP ${status}`);
  if (code) parts.push(code);
  return new HikvisionError(parts.join(' — '), { status, deviceStatus, code });
}

export class HikvisionClient {
  private client: AxiosInstance;
  private digestAuth: DigestAuth | null = null;
  private baseURL: string;
  private username: string;
  private password: string;
  private observer?: (obs: HikvisionObservation) => void;

  constructor(config: HikvisionClientConfig) {
    if (!config || !config.ipAddress) {
      throw new Error('HikvisionClient requires a config with ipAddress');
    }

    const scheme = config.useHttps ? 'https' : 'http';
    const port = config.port ?? 80;
    this.baseURL = `${scheme}://${config.ipAddress}:${port}`;
    this.username = config.username;
    this.password = config.password;
    this.observer = config.observer;

    try {
      this.digestAuth = new DigestAuth(this.username, this.password);
    } catch {
      this.digestAuth = null;
    }

    // Terminais na LAN usam certificado self-signed; quando em HTTPS, não validar
    // a cadeia (dispositivo local, não endpoint público).
    const httpsAgent = config.useHttps
      ? new (require('https').Agent)({ rejectUnauthorized: false })
      : undefined;

    // Instância só para o fallback Basic (usada apenas quando não há digestAuth).
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      auth: { username: this.username, password: this.password },
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, application/xml' },
      httpsAgent
    });
  }

  /**
   * Requisição ISAPI unificada: DIGEST-first para TODOS os métodos (este device
   * rejeita Basic). Basic só como último recurso quando não há digestAuth. Em
   * qualquer falha, lança HikvisionError sanitizado — o erro cru do axios (com
   * config.auth) nunca escapa daqui.
   */
  private async request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    opts: { data?: unknown; accept?: string; contentType?: string; context: string }
  ): Promise<any> {
    const accept = opts.accept ?? 'application/json, application/xml';
    const hasBody = opts.data !== undefined;
    const contentType = opts.contentType ?? 'application/json';

    if (this.digestAuth) {
      try {
        const res = await this.digestAuth.request({
          method,
          url: `${this.baseURL}${path}`,
          headers: { ...(hasBody ? { 'Content-Type': contentType } : {}), Accept: accept },
          ...(hasBody ? { data: opts.data } : {}),
          timeout: 30000,
          maxBodyLength: Infinity,
          maxContentLength: Infinity
        });
        this.observe({ context: opts.context, method, path, scheme: 'digest', status: res.status, ok: true, body: res.data });
        return res.data;
      } catch (error) {
        // Digest é a auth real do device: o erro aqui é autoritativo (inclui
        // erros do device pós-autenticação, ex. 400). Sanitiza e propaga.
        this.observeError(opts.context, method, path, 'digest', error);
        throw sanitizeError(opts.context, error);
      }
    }

    // Sem digestAuth (sem credencial utilizável): tenta Basic.
    try {
      const res = await this.client.request({
        method,
        url: path,
        ...(hasBody ? { data: opts.data } : {}),
        headers: { ...(hasBody ? { 'Content-Type': contentType } : {}), Accept: accept },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });
      this.observe({ context: opts.context, method, path, scheme: 'basic', status: res.status, ok: true, body: res.data });
      return res.data;
    } catch (error) {
      this.observeError(opts.context, method, path, 'basic', error);
      throw sanitizeError(opts.context, error);
    }
  }

  // O observador é um extra de diagnóstico: se ele explodir, não pode derrubar
  // a operação ISAPI que estava em curso.
  private observe(obs: HikvisionObservation): void {
    if (!this.observer) return;
    try { this.observer(obs); } catch { /* diagnóstico nunca quebra o sync */ }
  }

  private observeError(context: string, method: string, path: string, scheme: 'digest' | 'basic', error: any): void {
    this.observe({
      context, method, path, scheme,
      status: error?.response?.status,
      code: error?.code,
      ok: false,
      body: error?.response?.data
    });
  }

  // Get device information
  async getDeviceInfo() {
    return this.request('GET', '/ISAPI/System/deviceInfo', { accept: 'application/xml', context: 'getDeviceInfo' });
  }

  // Get user count
  async getUserCount() {
    return this.request('GET', '/ISAPI/AccessControl/UserInfo/Count?format=json', { context: 'getUserCount' });
  }

  // Search users
  // searchResultPosition/maxResults p/ PAGINAÇÃO (F4: o device devolve no máx 30
  // por página; o reconcile pagina iterando a posição até totalMatches). Defaults
  // mantêm o comportamento antigo (busca por employeeNo, 1ª página).
  async searchUsers(employeeNo?: string, searchResultPosition = 0, maxResults = 30) {
    // ISAPI: EmployeeNoList é ARRAY de objetos [{ employeeNo }] — não
    // { employeeNo: [...] } (este firmware rejeita com badJsonContent).
    const searchData = {
      UserInfoSearchCond: {
        searchID: '1',
        maxResults,
        searchResultPosition,
        ...(employeeNo && { EmployeeNoList: [{ employeeNo }] })
      }
    };
    return this.request('POST', '/ISAPI/AccessControl/UserInfo/Search?format=json', { data: searchData, context: 'searchUsers' });
  }

  // Add or update user
  async addUser(user: HikvisionUser) {
    const userData = {
      UserInfo: {
        employeeNo: user.employeeNo,
        name: user.name,
        userType: user.userType || 'normal',
        ...(user.password && { password: user.password }),
        Valid: user.valid || { enable: true, beginTime: '2025-01-01T00:00:00', endTime: '2037-12-31T23:59:59' },
        ...(user.gender && { gender: user.gender }),
        ...(user.roomNumber && { roomNumber: user.roomNumber }),
        ...(user.floorNumber && { floorNumber: user.floorNumber }),
        doorRight: '1',
        RightPlan: [{ doorNo: 1, planTemplateNo: '1' }]
      }
    };
    return this.request('POST', '/ISAPI/AccessControl/UserInfo/Record?format=json', { data: userData, context: 'addUser' });
  }

  // Upload face data.
  //
  // O DS-K1T671M-L (firmware V3.2.30) NÃO aceita base64-em-JSON no
  // FaceDataRecord (rejeita com Invalid Content / faceLibType). O formato aceito
  // é multipart/form-data: uma parte JSON (faceLibType/FDID/FPID) + uma parte
  // binária com o JPEG. `faceImage` pode ser data URL, base64 puro ou já o JPEG.
  async uploadFace(employeeNo: string, faceImage: string, fdid: string = '1') {
    const base64Data = faceImage.replace(/^data:image\/\w+;base64,/, '');
    const imgBuffer = Buffer.from(base64Data, 'base64');

    const meta = JSON.stringify({ faceLibType: 'blackFD', FDID: fdid, FPID: employeeNo });
    const boundary = '----HikFD' + crypto.randomBytes(8).toString('hex');
    const CRLF = '\r\n';
    const head = Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="FaceDataRecord"${CRLF}` +
      `Content-Type: application/json${CRLF}${CRLF}` +
      `${meta}${CRLF}` +
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="img"; filename="face.jpg"${CRLF}` +
      `Content-Type: image/jpeg${CRLF}${CRLF}`,
      'utf8'
    );
    const tail = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8');
    const body = Buffer.concat([head, imgBuffer, tail]);

    return this.request('POST', '/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json', {
      data: body,
      contentType: `multipart/form-data; boundary=${boundary}`,
      context: 'uploadFace'
    });
  }

  // Verifica se a face de um usuário está NA BIBLIOTECA facial (FDLib), pelo
  // FPID — que no nosso modelo é o próprio employeeNo. Read-only.
  //
  // Complementa o `searchUsers` (UserInfo/Search): aquele diz que o USUÁRIO
  // existe e quantas faces ele tem (`numOfFace`); este confirma o registro do
  // lado da FDLib. Usado na etapa de verificação do runner de sync.
  async searchFace(employeeNo: string, fdid: string = '1', maxResults = 30) {
    const searchData = {
      searchResultPosition: 0,
      maxResults,
      faceLibType: 'blackFD',
      FDID: fdid,
      FPID: employeeNo
    };
    return this.request('POST', '/ISAPI/Intelligent/FDLib/FDSearch?format=json', { data: searchData, context: 'searchFace' });
  }

  // Registra um cartão (credencial numérica) para um usuário já existente.
  // O `cardNo` é o número que também será codificado no QR impresso (Fase 3).
  // ISAPI: /ISAPI/AccessControl/CardInfo/Record.
  async registerCard(employeeNo: string, cardNumber: string, cardType: string = 'normalCard') {
    const cardData = { CardInfo: { employeeNo, cardNo: cardNumber, cardType } };
    return this.request('POST', '/ISAPI/AccessControl/CardInfo/Record?format=json', { data: cardData, context: 'registerCard' });
  }

  // Delete user
  async deleteUser(employeeNo: string) {
    // EmployeeNoList como array de objetos [{ employeeNo }] (mesmo formato do Search).
    const deleteData = { UserInfoDelCond: { EmployeeNoList: [{ employeeNo }] } };
    return this.request('PUT', '/ISAPI/AccessControl/UserInfo/Delete?format=json', { data: deleteData, context: 'deleteUser' });
  }

  // Get access logs
  async getAccessLogs(startTime?: string, endTime?: string) {
    const now = new Date();
    const searchData = {
      AcsEventCond: {
        searchID: '1',
        searchResultPosition: 0,
        maxResults: 30,
        major: 0x5,
        minor: 0x4b,
        startTime: startTime || new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        endTime: endTime || now.toISOString()
      }
    };
    return this.request('POST', '/ISAPI/AccessControl/AcsEvent?format=json', { data: searchData, context: 'getAccessLogs' });
  }

  // Open door remotely (pulso da catraca).
  // No K1T671M-L o RemoteControl/door é XML-only (ignora ?format=json e
  // responde XML), então o corpo precisa ser XML: <RemoteControlDoor><cmd>…
  // cmd ∈ open,close,alwaysOpen,alwaysClose; doorNo 1..1 (capabilities).
  async openDoor(doorNo: number = 1) {
    const xml = `<RemoteControlDoor><cmd>open</cmd><doorNo>${doorNo}</doorNo></RemoteControlDoor>`;
    return this.request('PUT', `/ISAPI/AccessControl/RemoteControl/door/${doorNo}`, {
      data: xml,
      contentType: 'application/xml',
      accept: 'application/xml',
      context: 'openDoor'
    });
  }
}

export default HikvisionClient;
