/**
 * Service Category API - DEPRECATED
 * This module is kept as a stub for backwards compatibility.
 * Service categories have been removed from the platform.
 * All functions return empty/default values.
 */

import type { ServiceCategory, ServiceCategoryFormData } from '../types';

export const serviceCategoryApi = {
  // Returns empty array - no categories available
  getAllCategories: async (_activeOnly: boolean = false): Promise<ServiceCategory[]> => {
    return [];
  },

  // Stub - always returns null
  getCategoryById: async (_id: number): Promise<ServiceCategory | null> => {
    return null;
  },

  // Stub - throws error if called (admin feature removed)
  createCategory: async (_data: ServiceCategoryFormData): Promise<ServiceCategory> => {
    throw new Error('Service categories feature has been removed');
  },

  // Stub - throws error if called (admin feature removed)
  updateCategory: async (_id: number, _data: ServiceCategoryFormData): Promise<ServiceCategory> => {
    throw new Error('Service categories feature has been removed');
  },

  // Stub - throws error if called (admin feature removed)
  deleteCategory: async (_id: number): Promise<void> => {
    throw new Error('Service categories feature has been removed');
  }
};
