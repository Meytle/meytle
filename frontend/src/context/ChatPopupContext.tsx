import React, { createContext, useContext, useState, useCallback } from 'react';

interface ChatPopupContextType {
  isChatOpen: boolean;
  activeBookingId: number | null;
  activeCompanionName: string | null;
  activeClientName: string | null;
  openChat: (bookingId: number, companionName?: string, clientName?: string) => void;
  closeChat: () => void;
}

const ChatPopupContext = createContext<ChatPopupContextType | undefined>(undefined);

export const useChatPopup = () => {
  const context = useContext(ChatPopupContext);
  if (!context) {
    throw new Error('useChatPopup must be used within ChatPopupProvider');
  }
  return context;
};

interface ChatPopupProviderProps {
  children: React.ReactNode;
}

export const ChatPopupProvider: React.FC<ChatPopupProviderProps> = ({ children }) => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeBookingId, setActiveBookingId] = useState<number | null>(null);
  const [activeCompanionName, setActiveCompanionName] = useState<string | null>(null);
  const [activeClientName, setActiveClientName] = useState<string | null>(null);

  const openChat = useCallback((
    bookingId: number,
    companionName?: string,
    clientName?: string
  ) => {
    setActiveBookingId(bookingId);
    setActiveCompanionName(companionName || null);
    setActiveClientName(clientName || null);
    setIsChatOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setIsChatOpen(false);
    // Don't clear booking data immediately to allow for smooth animation
    setTimeout(() => {
      setActiveBookingId(null);
      setActiveCompanionName(null);
      setActiveClientName(null);
    }, 300);
  }, []);

  const value = {
    isChatOpen,
    activeBookingId,
    activeCompanionName,
    activeClientName,
    openChat,
    closeChat
  };

  return (
    <ChatPopupContext.Provider value={value}>
      {children}
    </ChatPopupContext.Provider>
  );
};

