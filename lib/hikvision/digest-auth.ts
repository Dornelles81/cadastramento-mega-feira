import crypto from 'crypto';
import axios, { AxiosRequestConfig } from 'axios';

interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
}

export class DigestAuth {
  private username: string;
  private password: string;
  private nc: number = 0;

  constructor(username: string, password: string) {
    this.username = username;
    this.password = password;
  }

  private parseChallenge(authHeader: string): DigestChallenge | null {
    const challenge: any = {};
    const regex = /(\w+)=["']?([^"',]+)["']?/g;
    let match;

    while ((match = regex.exec(authHeader)) !== null) {
      challenge[match[1]] = match[2];
    }

    if (!challenge.realm || !challenge.nonce) {
      return null;
    }

    return challenge as DigestChallenge;
  }

  private generateCnonce(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private md5(data: string): string {
    return crypto.createHash('md5').update(data).digest('hex');
  }

  private computeResponse(
    method: string,
    uri: string,
    challenge: DigestChallenge,
    cnonce: string,
    nc: string
  ): string {
    const ha1 = this.md5(`${this.username}:${challenge.realm}:${this.password}`);
    const ha2 = this.md5(`${method}:${uri}`);

    if (challenge.qop === 'auth' || challenge.qop === 'auth-int') {
      return this.md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${challenge.qop}:${ha2}`);
    } else {
      return this.md5(`${ha1}:${challenge.nonce}:${ha2}`);
    }
  }

  public async request(config: AxiosRequestConfig): Promise<any> {
    try {
      // First request without auth to get challenge
      const response = await axios(config);
      return response;
    } catch (error: any) {
      if (error.response?.status !== 401) {
        throw error;
      }

      // Get digest challenge from WWW-Authenticate header
      const authHeader = error.response.headers['www-authenticate'];
      if (!authHeader || !authHeader.toLowerCase().includes('digest')) {
        throw new Error('Server does not support digest authentication');
      }

      const challenge = this.parseChallenge(authHeader);
      if (!challenge) {
        throw new Error('Could not parse digest challenge');
      }

      // Generate digest response
      this.nc++;
      const nc = this.nc.toString(16).padStart(8, '0');
      const cnonce = this.generateCnonce();
      const uri = config.url || '/';
      const method = config.method?.toUpperCase() || 'GET';

      const response = this.computeResponse(method, uri, challenge, cnonce, nc);

      // Build authorization header
      let authValue = `Digest username="${this.username}", realm="${challenge.realm}", nonce="${challenge.nonce}", uri="${uri}", response="${response}"`;
      
      if (challenge.qop) {
        authValue += `, qop=${challenge.qop}, nc=${nc}, cnonce="${cnonce}"`;
      }
      
      if (challenge.opaque) {
        authValue += `, opaque="${challenge.opaque}"`;
      }

      if (challenge.algorithm) {
        authValue += `, algorithm="${challenge.algorithm}"`;
      }

      // Retry request with digest auth
      const authConfig = {
        ...config,
        headers: {
          ...config.headers,
          'Authorization': authValue
        }
      };

      return await axios(authConfig);
    }
  }
}