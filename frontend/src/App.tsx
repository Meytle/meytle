import { Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ScrollToTop from './components/ScrollToTop';
import ScrollToTopButton from './components/common/ScrollToTopButton';
import { ModalProvider } from './context/ModalContext';
import { SocketProvider } from './context/SocketContext';
import { ChatPopupProvider, useChatPopup } from './context/ChatPopupContext';
import ChatBox from './components/messaging/ChatBox';
import ErrorBoundary from './components/ErrorBoundary';
import AsyncErrorBoundary from './components/AsyncErrorBoundary';

// Global ChatBox wrapper that uses the existing ChatBox component
const GlobalChatBox = () => {
  const { isChatOpen, activeBookingId, activeCompanionName, activeClientName, closeChat } = useChatPopup();
  
  if (!isChatOpen || !activeBookingId) {
    return null;
  }
  
  return (
    <ChatBox
      isOpen={isChatOpen}
      onClose={closeChat}
      bookingId={activeBookingId}
      companionName={activeCompanionName || undefined}
      clientName={activeClientName || undefined}
    />
  );
};

const App = () => {
  return (
    <ErrorBoundary level="page" showDetails={false}>
      <AsyncErrorBoundary maxRetries={3} retryDelay={1000}>
        <ChatPopupProvider>
          <SocketProvider>
            <ModalProvider>
              <div className="min-h-screen flex flex-col">
                <ScrollToTop />
                <main className="flex-grow">
                  <Outlet />
                </main>
                <Toaster position="top-right" />
                <ScrollToTopButton />
                {/* Global Chat using existing ChatBox component */}
                <GlobalChatBox />
              </div>
            </ModalProvider>
          </SocketProvider>
        </ChatPopupProvider>
      </AsyncErrorBoundary>
    </ErrorBoundary>
  );
};

export default App;
