/**
 * Cache Service
 * Centralized caching system for API responses with TTL and invalidation strategies
 */

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  etag?: string;
  dependencies?: string[];
}

interface CacheConfig {
  defaultTTL?: number; // Default time-to-live in milliseconds
  maxSize?: number; // Maximum number of entries in cache
  storageType?: 'memory' | 'localStorage' | 'sessionStorage';
  namespace?: string; // Namespace for localStorage keys
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

class CacheService {
  private memoryCache: Map<string, CacheEntry> = new Map();
  private config: Required<CacheConfig>;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
    hitRate: 0
  };
  private invalidationCallbacks: Map<string, Set<() => void>> = new Map();

  constructor(config: CacheConfig = {}) {
    this.config = {
      defaultTTL: config.defaultTTL || 5 * 60 * 1000, // 5 minutes default
      maxSize: config.maxSize || 100,
      storageType: config.storageType || 'memory',
      namespace: config.namespace || 'meytle_cache'
    };

    // Initialize from localStorage if configured
    if (this.config.storageType !== 'memory') {
      this.loadFromStorage();
    }

    // Setup automatic cleanup
    this.startCleanupInterval();
  }

  /**
   * Get data from cache
   */
  get<T>(key: string): T | null {
    const entry = this.getEntry(key);

    if (entry) {
      // Check if entry is still valid
      if (this.isEntryValid(entry)) {
        this.stats.hits++;
        this.updateHitRate();
        return entry.data as T;
      } else {
        // Entry expired, remove it
        this.delete(key);
      }
    }

    this.stats.misses++;
    this.updateHitRate();
    return null;
  }

  /**
   * Set data in cache with optional TTL
   */
  set<T>(
    key: string,
    data: T,
    options: {
      ttl?: number;
      etag?: string;
      dependencies?: string[];
    } = {}
  ): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: options.ttl || this.config.defaultTTL,
      etag: options.etag,
      dependencies: options.dependencies
    };

    // Check cache size limit
    if (this.memoryCache.size >= this.config.maxSize && !this.memoryCache.has(key)) {
      this.evictOldest();
    }

    this.memoryCache.set(key, entry);
    this.stats.size = this.memoryCache.size;

    // Persist to storage if configured
    if (this.config.storageType !== 'memory') {
      this.saveToStorage(key, entry);
    }
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const deleted = this.memoryCache.delete(key);

    if (deleted) {
      this.stats.size = this.memoryCache.size;

      // Remove from storage
      if (this.config.storageType !== 'memory') {
        this.removeFromStorage(key);
      }

      // Trigger invalidation callbacks
      this.triggerInvalidationCallbacks(key);
    }

    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.memoryCache.clear();
    this.stats.size = 0;

    if (this.config.storageType !== 'memory') {
      this.clearStorage();
    }

    // Trigger all invalidation callbacks
    this.invalidationCallbacks.forEach((callbacks, key) => {
      callbacks.forEach(callback => callback());
    });
    this.invalidationCallbacks.clear();
  }

  /**
   * Invalidate cache entries by pattern
   */
  invalidatePattern(pattern: string | RegExp): number {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const keysToDelete: string[] = [];

    this.memoryCache.forEach((_, key) => {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.delete(key));
    return keysToDelete.length;
  }

  /**
   * Invalidate cache entries by dependency
   */
  invalidateDependencies(dependency: string): number {
    const keysToDelete: string[] = [];

    this.memoryCache.forEach((entry, key) => {
      if (entry.dependencies?.includes(dependency)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.delete(key));
    return keysToDelete.length;
  }

  /**
   * Get or set cache entry with factory function
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options: {
      ttl?: number;
      etag?: string;
      dependencies?: string[];
      forceRefresh?: boolean;
    } = {}
  ): Promise<T> {
    // Check if we should force refresh
    if (!options.forceRefresh) {
      const cached = this.get<T>(key);
      if (cached !== null) {
        return cached;
      }
    }

    // Fetch fresh data
    try {
      const data = await factory();
      this.set(key, data, options);
      return data;
    } catch (error) {
      // If fetch fails, return stale data if available
      const staleEntry = this.getEntry(key);
      if (staleEntry) {
        console.warn(`Using stale cache for key: ${key}`, error);
        return staleEntry.data as T;
      }
      throw error;
    }
  }

  /**
   * Subscribe to cache invalidation events
   */
  onInvalidate(key: string, callback: () => void): () => void {
    if (!this.invalidationCallbacks.has(key)) {
      this.invalidationCallbacks.set(key, new Set());
    }

    this.invalidationCallbacks.get(key)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.invalidationCallbacks.get(key);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.invalidationCallbacks.delete(key);
        }
      }
    };
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get all cache keys
   */
  keys(): string[] {
    return Array.from(this.memoryCache.keys());
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    const entry = this.getEntry(key);
    return entry !== null && this.isEntryValid(entry);
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.memoryCache.size;
  }

  // Private methods

  private getEntry(key: string): CacheEntry | null {
    return this.memoryCache.get(key) || null;
  }

  private isEntryValid(entry: CacheEntry): boolean {
    const now = Date.now();
    return now - entry.timestamp < entry.ttl;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    this.memoryCache.forEach((entry, key) => {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    });

    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  private triggerInvalidationCallbacks(key: string): void {
    const callbacks = this.invalidationCallbacks.get(key);
    if (callbacks) {
      callbacks.forEach(callback => callback());
    }
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      const keysToDelete: string[] = [];

      this.memoryCache.forEach((entry, key) => {
        if (now - entry.timestamp >= entry.ttl) {
          keysToDelete.push(key);
        }
      });

      keysToDelete.forEach(key => this.delete(key));
    }, 60000); // Run cleanup every minute
  }

  // Storage persistence methods

  private getStorageKey(key: string): string {
    return `${this.config.namespace}_${key}`;
  }

  private getStorage(): Storage {
    return this.config.storageType === 'localStorage'
      ? localStorage
      : sessionStorage;
  }

  private saveToStorage(key: string, entry: CacheEntry): void {
    try {
      const storage = this.getStorage();
      const storageKey = this.getStorageKey(key);
      storage.setItem(storageKey, JSON.stringify(entry));
    } catch (error) {
      console.warn(`Failed to save cache entry to storage: ${key}`, error);
    }
  }

  private loadFromStorage(): void {
    try {
      const storage = this.getStorage();
      const prefix = `${this.config.namespace}_`;

      for (let i = 0; i < storage.length; i++) {
        const storageKey = storage.key(i);
        if (storageKey?.startsWith(prefix)) {
          const key = storageKey.slice(prefix.length);
          const value = storage.getItem(storageKey);

          if (value) {
            const entry = JSON.parse(value) as CacheEntry;
            if (this.isEntryValid(entry)) {
              this.memoryCache.set(key, entry);
            } else {
              storage.removeItem(storageKey);
            }
          }
        }
      }

      this.stats.size = this.memoryCache.size;
    } catch (error) {
      console.warn('Failed to load cache from storage', error);
    }
  }

  private removeFromStorage(key: string): void {
    try {
      const storage = this.getStorage();
      storage.removeItem(this.getStorageKey(key));
    } catch (error) {
      console.warn(`Failed to remove cache entry from storage: ${key}`, error);
    }
  }

  private clearStorage(): void {
    try {
      const storage = this.getStorage();
      const prefix = `${this.config.namespace}_`;
      const keysToRemove: string[] = [];

      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key?.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => storage.removeItem(key));
    } catch (error) {
      console.warn('Failed to clear storage', error);
    }
  }
}

// Create cache instances for different data types
export const companionCache = new CacheService({
  defaultTTL: 10 * 60 * 1000, // 10 minutes
  maxSize: 50,
  storageType: 'localStorage',
  namespace: 'meytle_companions'
});

export const availabilityCache = new CacheService({
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  maxSize: 100,
  storageType: 'sessionStorage',
  namespace: 'meytle_availability'
});

export const bookingCache = new CacheService({
  defaultTTL: 2 * 60 * 1000, // 2 minutes
  maxSize: 20,
  storageType: 'memory',
  namespace: 'meytle_bookings'
});

export const apiCache = new CacheService({
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  maxSize: 200,
  storageType: 'sessionStorage',
  namespace: 'meytle_api'
});

// Cache key generators
export const cacheKeys = {
  companion: (id: number) => `companion_${id}`,
  companionList: (page: number, filters?: any) =>
    `companions_page_${page}_${JSON.stringify(filters || {})}`,
  availability: (companionId: number, date: string) =>
    `availability_${companionId}_${date}`,
  weeklyAvailability: (companionId: number) =>
    `weekly_availability_${companionId}`,
  booking: (id: number) => `booking_${id}`,
  userBookings: (userId: number, role: string) =>
    `bookings_${userId}_${role}`,
  serviceCategories: () => 'service_categories',
  favorites: (userId: number) => `favorites_${userId}`
};

// Export default cache service for general use
export default new CacheService({
  defaultTTL: 5 * 60 * 1000,
  maxSize: 100,
  storageType: 'memory'
});