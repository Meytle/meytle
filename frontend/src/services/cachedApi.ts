/**
 * Cached API Service
 * Wrapper for API calls with automatic caching and optimization
 */

import { companionCache, availabilityCache, bookingCache, cacheKeys, apiCache } from './cacheService';
import companionsApi from '../api/companions';
import { bookingApi } from '../api/booking';
import clientApi from '../api/client';
import axios, { type AxiosRequestConfig } from 'axios';
import { API_CONFIG } from '../constants';

interface CachedRequestOptions extends AxiosRequestConfig {
  cacheKey?: string;
  cacheTTL?: number;
  forceRefresh?: boolean;
  dependencies?: string[];
}

class CachedApiService {
  /**
   * Companion API with caching
   */
  companion = {
    // Get single companion with caching
    getCompanion: async (id: number, forceRefresh = false) => {
      const cacheKey = cacheKeys.companion(id);

      return await companionCache.getOrSet(
        cacheKey,
        async () => {
          const response = await companionsApi.getCompanionById(id);
          return response;
        },
        {
          ttl: 10 * 60 * 1000, // 10 minutes
          forceRefresh,
          dependencies: ['companions']
        }
      );
    },

    // Get companions list with caching
    getCompanions: async (page = 1, filters?: any, forceRefresh = false) => {
      const cacheKey = cacheKeys.companionList(page, filters);

      return await companionCache.getOrSet(
        cacheKey,
        async () => {
          const response = await companionsApi.getCompanions({ page, ...filters });
          return response;
        },
        {
          ttl: 5 * 60 * 1000, // 5 minutes
          forceRefresh,
          dependencies: ['companions']
        }
      );
    },

    // Invalidate companion caches
    invalidateCompanion: (id: number) => {
      companionCache.delete(cacheKeys.companion(id));
      companionCache.invalidatePattern(/^companions_page_/);
    },

    // Invalidate all companion caches
    invalidateAll: () => {
      companionCache.invalidateDependencies('companions');
    }
  };

  /**
   * Availability API with caching
   */
  availability = {
    // Get availability for a specific date
    getDateAvailability: async (
      companionId: number,
      date: string,
      forceRefresh = false
    ) => {
      const cacheKey = cacheKeys.availability(companionId, date);

      return await availabilityCache.getOrSet(
        cacheKey,
        async () => {
          const response = await bookingApi.getCompanionAvailability(companionId, date);
          return response;
        },
        {
          ttl: 5 * 60 * 1000, // 5 minutes
          forceRefresh,
          dependencies: [`companion_${companionId}`, 'availability']
        }
      );
    },

    // Get weekly availability
    getWeeklyAvailability: async (companionId: number, forceRefresh = false) => {
      const cacheKey = cacheKeys.weeklyAvailability(companionId);

      return await availabilityCache.getOrSet(
        cacheKey,
        async () => {
          const response = await axios.get(
            `${API_CONFIG.BASE_URL}/api/booking/availability/${companionId}/weekly`,
            { withCredentials: true }
          );
          return response.data;
        },
        {
          ttl: 10 * 60 * 1000, // 10 minutes
          forceRefresh,
          dependencies: [`companion_${companionId}`, 'availability']
        }
      );
    },

    // Get availability for date range
    getDateRangeAvailability: async (
      companionId: number,
      startDate: string,
      endDate: string,
      forceRefresh = false
    ) => {
      const cacheKey = `availability_range_${companionId}_${startDate}_${endDate}`;

      return await availabilityCache.getOrSet(
        cacheKey,
        async () => {
          const response = await bookingApi.getCompanionAvailabilityForDateRange(
            companionId,
            startDate,
            endDate
          );
          return response;
        },
        {
          ttl: 5 * 60 * 1000, // 5 minutes
          forceRefresh,
          dependencies: [`companion_${companionId}`, 'availability']
        }
      );
    },

    // Invalidate availability caches
    invalidateCompanionAvailability: (companionId: number) => {
      availabilityCache.invalidatePattern(new RegExp(`^availability_.*_${companionId}_`));
      availabilityCache.delete(cacheKeys.weeklyAvailability(companionId));
    },

    // Invalidate all availability caches
    invalidateAll: () => {
      availabilityCache.invalidateDependencies('availability');
    }
  };

  /**
   * Booking API with caching
   */
  booking = {
    // Get single booking
    getBooking: async (id: number, forceRefresh = false) => {
      const cacheKey = cacheKeys.booking(id);

      return await bookingCache.getOrSet(
        cacheKey,
        async () => {
          const response = await bookingApi.getBookingById(id);
          return response;
        },
        {
          ttl: 2 * 60 * 1000, // 2 minutes
          forceRefresh,
          dependencies: ['bookings']
        }
      );
    },

    // Get user bookings
    getUserBookings: async (userId: number, role: string, forceRefresh = false) => {
      const cacheKey = cacheKeys.userBookings(userId, role);

      return await bookingCache.getOrSet(
        cacheKey,
        async () => {
          const endpoint = role === 'client'
            ? '/api/booking/my-bookings'
            : '/api/companion/bookings';

          const response = await axios.get(
            `${API_CONFIG.BASE_URL}${endpoint}`,
            { withCredentials: true }
          );
          return response.data;
        },
        {
          ttl: 1 * 60 * 1000, // 1 minute
          forceRefresh,
          dependencies: ['bookings', `user_${userId}`]
        }
      );
    },

    // Create booking (OLD - will be deprecated)
    createBooking: async (bookingData: any) => {
      const response = await bookingApi.createBooking(bookingData);

      if (response) {
        // Invalidate related caches
        bookingCache.invalidateDependencies('bookings');
        availabilityCache.invalidateDependencies(`companion_${bookingData.companionId}`);
      }

      return response;
    },

    // ⭐ NEW TWO-STEP FLOW
    // Step 1: Create payment intent (no caching)
    createPaymentIntent: async (bookingData: any) => {
      return await bookingApi.createPaymentIntent(bookingData);
    },

    // Step 2: Create booking with authorized payment (no caching, but invalidates related caches)
    createBookingWithPayment: async (bookingData: any) => {
      const response = await bookingApi.createBookingWithPayment(bookingData);

      if (response) {
        // Invalidate related caches
        bookingCache.invalidateDependencies('bookings');
        availabilityCache.invalidateDependencies(`companion_${bookingData.companionId}`);
      }

      return response;
    },

    // Update booking status (no caching, but invalidates)
    updateBookingStatus: async (bookingId: number, status: string) => {
      await bookingApi.updateBookingStatus(bookingId, status);

      // Invalidate related caches
      bookingCache.delete(cacheKeys.booking(bookingId));
      bookingCache.invalidateDependencies('bookings');

      return;
    },

    // Invalidate booking caches
    invalidateBooking: (id: number) => {
      bookingCache.delete(cacheKeys.booking(id));
      bookingCache.invalidateDependencies('bookings');
    },

    // Invalidate all booking caches
    invalidateAll: () => {
      bookingCache.clear();
    }
  };

  /**
   * Service categories API with caching
   */
  services = {
    // Get all service categories
    getCategories: async (forceRefresh = false) => {
      const cacheKey = cacheKeys.serviceCategories();

      return await apiCache.getOrSet(
        cacheKey,
        async () => {
          const response = await axios.get(
            `${API_CONFIG.BASE_URL}/api/service-categories`,
            { withCredentials: true }
          );
          return response.data;
        },
        {
          ttl: 30 * 60 * 1000, // 30 minutes (rarely changes)
          forceRefresh,
          dependencies: ['services']
        }
      );
    },

    // Invalidate service caches
    invalidateAll: () => {
      apiCache.delete(cacheKeys.serviceCategories());
    }
  };

  /**
   * Favorites API with caching
   */
  favorites = {
    // Get user favorites
    getFavorites: async (userId: number, forceRefresh = false) => {
      const cacheKey = cacheKeys.favorites(userId);

      return await apiCache.getOrSet(
        cacheKey,
        async () => {
          const response = await clientApi.getFavorites();
          return response;
        },
        {
          ttl: 5 * 60 * 1000, // 5 minutes
          forceRefresh,
          dependencies: [`user_${userId}`, 'favorites']
        }
      );
    },

    // Add favorite (no caching, but invalidates)
    addFavorite: async (companionId: number, userId: number) => {
      const response = await clientApi.addFavorite(companionId);

      if (response.success) {
        // Invalidate favorites cache
        apiCache.delete(cacheKeys.favorites(userId));
      }

      return response;
    },

    // Remove favorite (no caching, but invalidates)
    removeFavorite: async (companionId: number, userId: number) => {
      const response = await clientApi.removeFavorite(companionId);

      if (response.success) {
        // Invalidate favorites cache
        apiCache.delete(cacheKeys.favorites(userId));
      }

      return response;
    },

    // Invalidate favorites cache
    invalidateFavorites: (userId: number) => {
      apiCache.delete(cacheKeys.favorites(userId));
    }
  };

  /**
   * Generic cached request
   */
  async cachedRequest<T = any>(
    options: CachedRequestOptions
  ): Promise<T> {
    const {
      cacheKey,
      cacheTTL = 5 * 60 * 1000,
      forceRefresh = false,
      dependencies = [],
      ...axiosConfig
    } = options;

    if (!cacheKey) {
      // No caching, just make the request
      const response = await axios(axiosConfig);
      return response.data;
    }

    return await apiCache.getOrSet(
      cacheKey,
      async () => {
        const response = await axios(axiosConfig);
        return response.data;
      },
      {
        ttl: cacheTTL,
        forceRefresh,
        dependencies
      }
    );
  }

  /**
   * Prefetch data for better UX
   */
  async prefetch(requests: Array<() => Promise<any>>): Promise<void> {
    try {
      await Promise.all(requests.map(req => req().catch(() => null)));
    } catch (error) {
      console.warn('Prefetch error:', error);
    }
  }

  /**
   * Batch invalidation
   */
  invalidateMultiple(patterns: string[]): void {
    patterns.forEach(pattern => {
      apiCache.invalidatePattern(pattern);
      companionCache.invalidatePattern(pattern);
      availabilityCache.invalidatePattern(pattern);
      bookingCache.invalidatePattern(pattern);
    });
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    apiCache.clear();
    companionCache.clear();
    availabilityCache.clear();
    bookingCache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      api: apiCache.getStats(),
      companions: companionCache.getStats(),
      availability: availabilityCache.getStats(),
      bookings: bookingCache.getStats(),
      total: {
        size:
          apiCache.size() +
          companionCache.size() +
          availabilityCache.size() +
          bookingCache.size()
      }
    };
  }

  /**
   * Warm up cache with common data
   */
  async warmupCache(): Promise<void> {
    const warmupTasks = [
      // Prefetch service categories
      () => this.services.getCategories(),

      // Prefetch first page of companions
      () => this.companion.getCompanions(1),
    ];

    await this.prefetch(warmupTasks);
  }
}

// Export singleton instance
const cachedApi = new CachedApiService();

// Auto warm-up cache on load (optional)
if (typeof window !== 'undefined') {
  // Wait a bit after page load to avoid blocking initial render
  window.addEventListener('load', () => {
    setTimeout(() => {
      cachedApi.warmupCache().catch(console.warn);
    }, 2000);
  });
}

export default cachedApi;

// Export for direct usage
export const {
  companion: cachedCompanionApi,
  availability: cachedAvailabilityApi,
  booking: cachedBookingApi,
  services: cachedServicesApi,
  favorites: cachedFavoritesApi
} = cachedApi;