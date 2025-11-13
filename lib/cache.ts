/**
 * Sistema de Cache em Memória
 * Cache simples e eficiente para reduzir queries ao banco
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class MemoryCache {
  private cache: Map<string, CacheEntry<any>>;
  private stats: {
    hits: number;
    misses: number;
    sets: number;
  };

  constructor() {
    this.cache = new Map();
    this.stats = { hits: 0, misses: 0, sets: 0 };
  }

  /**
   * Obter valor do cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Verificar se expirou
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.data as T;
  }

  /**
   * Salvar valor no cache
   */
  set<T>(key: string, data: T, ttl: number = 300000): void {
    // ttl padrão: 5 minutos (300000ms)
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
    this.stats.sets++;
  }

  /**
   * Deletar chave do cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Deletar múltiplas chaves por padrão
   */
  deletePattern(pattern: string): number {
    let deleted = 0;
    const regex = new RegExp(pattern);

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Limpar todo o cache
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, sets: 0 };
  }

  /**
   * Obter estatísticas do cache
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;

    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: hitRate.toFixed(2) + '%',
    };
  }

  /**
   * Limpar entradas expiradas
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Wrapper para operações get-or-set
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = 300000
  ): Promise<T> {
    // Tentar buscar do cache
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Buscar dados frescos
    const data = await fetcher();

    // Salvar no cache
    this.set(key, data, ttl);

    return data;
  }
}

// Instância singleton do cache
export const cache = new MemoryCache();

// Cleanup automático a cada 10 minutos
if (typeof window === 'undefined') {
  // Apenas no servidor
  setInterval(() => {
    const cleaned = cache.cleanup();
    if (cleaned > 0) {
      console.log(`🧹 Cache cleanup: ${cleaned} entradas removidas`);
    }
  }, 600000); // 10 minutos
}

// Helper para invalidar cache relacionado a participantes
export function invalidateParticipantCache(participantId?: string) {
  if (participantId) {
    cache.delete(`participant:${participantId}`);
  }
  cache.deletePattern('^participants:');
  cache.deletePattern('^stats:');
}

// Helper para invalidar cache relacionado a estandes
export function invalidateStandCache(standId?: string) {
  if (standId) {
    cache.delete(`stand:${standId}`);
  }
  cache.deletePattern('^stands:');
  cache.deletePattern('^stats:');
}

// TTLs pré-definidos
export const CacheTTL = {
  SHORT: 60000,      // 1 minuto
  MEDIUM: 300000,    // 5 minutos
  LONG: 1800000,     // 30 minutos
  VERY_LONG: 3600000 // 1 hora
};

export default cache;
