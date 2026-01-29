/**
 * Modal Context
 * Manages global modal state to coordinate UI elements like header/footer visibility
 */

import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

interface ModalContextType {
  activeModals: Set<string>;
  isAnyModalOpen: boolean;
  registerModal: (modalId: string) => void;
  unregisterModal: (modalId: string) => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};

interface ModalProviderProps {
  children: ReactNode;
}

export const ModalProvider: React.FC<ModalProviderProps> = ({ children }) => {
  const [activeModals, setActiveModals] = useState<Set<string>>(new Set());
  const originalOverflowRef = React.useRef<string>('');

  // Capture original overflow value once on mount (before any modals open)
  useEffect(() => {
    originalOverflowRef.current = document.body.style.overflow;
  }, []);

  const registerModal = useCallback((modalId: string) => {
    setActiveModals(prev => {
      const newSet = new Set(prev);
      newSet.add(modalId);
      return newSet;
    });
  }, []);

  const unregisterModal = useCallback((modalId: string) => {
    setActiveModals(prev => {
      const newSet = new Set(prev);
      newSet.delete(modalId);
      return newSet;
    });
  }, []);

  const isAnyModalOpen = activeModals.size > 0;

  // Prevent body scroll when any modal is open
  useEffect(() => {
    if (isAnyModalOpen) {
      // Set body overflow to hidden when modal opens
      document.body.style.overflow = 'hidden';

      // Restore original overflow when all modals are closed
      return () => {
        document.body.style.overflow = originalOverflowRef.current;
      };
    }
  }, [isAnyModalOpen]);

  const value: ModalContextType = {
    activeModals,
    isAnyModalOpen,
    registerModal,
    unregisterModal,
  };

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
};

/**
 * Custom hook for managing modal registration
 * Automatically handles registration/unregistration on mount/unmount
 */
export const useModalRegistration = (modalId: string, isOpen: boolean) => {
  const { registerModal, unregisterModal } = useModal();

  React.useEffect(() => {
    if (isOpen) {
      registerModal(modalId);
    } else {
      unregisterModal(modalId);
    }

    // Cleanup on unmount
    return () => {
      unregisterModal(modalId);
    };
  }, [isOpen, modalId, registerModal, unregisterModal]);
};