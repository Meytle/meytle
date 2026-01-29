/**
 * Role Selection Modal
 * Beautiful modal for users to select their role during signup
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUserTie, FaUserFriends, FaTimes } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

interface RoleSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRoleSelect?: (role: string) => void;
  canClose?: boolean;
}

const RoleSelectionModal: React.FC<RoleSelectionModalProps> = ({
  isOpen,
  onClose,
  onRoleSelect,
  canClose = true
}) => {
  const navigate = useNavigate();
  const [hoveredRole, setHoveredRole] = useState<string | null>(null);

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleRoleSelect = (role: string) => {
    // Single click selection - immediately proceed
    if (onRoleSelect) {
      onRoleSelect(role);
      onClose();
    } else {
      // Navigate to signup with selected role
      navigate(`/signup?role=${role}`);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop - starts below header */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={canClose ? onClose : undefined}
            className="fixed inset-0 top-16 bg-black bg-opacity-40 backdrop-blur-sm z-40"
          />

          {/* Modal - positioned below header */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: 'spring', damping: 30, stiffness: 400 }}
            className="fixed left-1/2 top-24 transform -translate-x-1/2 z-40 w-full max-w-4xl p-4"
          >
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="relative bg-gradient-to-r from-[#312E81] to-[#312E81] p-6 text-white">
                {canClose && (
                  <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-full bg-white bg-opacity-20 hover:bg-opacity-30 transition-all"
                  >
                    <FaTimes className="w-5 h-5" />
                  </button>
                )}
                <h2 className="text-2xl font-bold mb-1">Welcome to Meytle!</h2>
                <p className="text-base opacity-90">Choose how you'd like to join our vibrant community</p>
              </div>

              {/* Content */}
              <div className="p-6">
                <p className="text-gray-600 mb-6 text-center">
                  Select your role to continue with sign up
                </p>

                {/* Role Cards */}
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Client Role Card */}
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onHoverStart={() => setHoveredRole('client')}
                    onHoverEnd={() => setHoveredRole(null)}
                    onClick={() => handleRoleSelect('client')}
                    className="relative cursor-pointer rounded-xl border-2 transition-all duration-300 border-gray-200 hover:border-[#4A47A3] hover:shadow-lg bg-white"
                  >

                    <div className="p-6">
                      <div className="flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-gradient-to-br from-[#4A47A3] to-[#312E81] text-white">
                        <FaUserTie className="w-8 h-8" />
                      </div>

                      <h3 className="text-xl font-bold text-gray-900 mb-3">Join as Client</h3>

                      <ul className="space-y-2 text-gray-600 mb-4">
                        <li className="flex items-start">
                          <span className="text-green-500 mr-2">✓</span>
                          <span>Browse verified companions</span>
                        </li>
                        <li className="flex items-start">
                          <span className="text-green-500 mr-2">✓</span>
                          <span>Book exciting experiences</span>
                        </li>
                        <li className="flex items-start">
                          <span className="text-green-500 mr-2">✓</span>
                          <span>Secure payment system</span>
                        </li>
                        <li className="flex items-start">
                          <span className="text-green-500 mr-2">✓</span>
                          <span>24/7 customer support</span>
                        </li>
                      </ul>

                      <div className="text-center py-2 rounded-lg font-medium transition-all bg-blue-100 text-blue-700 hover:bg-blue-200">
                        Continue as Client
                      </div>
                    </div>
                  </motion.div>

                  {/* Companion Role Card */}
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onHoverStart={() => setHoveredRole('companion')}
                    onHoverEnd={() => setHoveredRole(null)}
                    onClick={() => handleRoleSelect('companion')}
                    className="relative cursor-pointer rounded-xl border-2 transition-all duration-300 border-gray-200 hover:border-[#4A47A3] hover:shadow-lg bg-white"
                  >

                    <div className="p-6">
                      <div className="flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-gradient-to-br from-[#4A47A3] to-[#312E81] text-white">
                        <FaUserFriends className="w-8 h-8" />
                      </div>

                      <h3 className="text-xl font-bold text-gray-900 mb-3">Join as Companion</h3>

                      <ul className="space-y-2 text-gray-600 mb-4">
                        <li className="flex items-start">
                          <span className="text-green-500 mr-2">✓</span>
                          <span>Earn money doing what you love</span>
                        </li>
                        <li className="flex items-start">
                          <span className="text-green-500 mr-2">✓</span>
                          <span>Set your own schedule</span>
                        </li>
                        <li className="flex items-start">
                          <span className="text-green-500 mr-2">✓</span>
                          <span>Meet interesting people</span>
                        </li>
                        <li className="flex items-start">
                          <span className="text-green-500 mr-2">✓</span>
                          <span>Secure platform & payments</span>
                        </li>
                      </ul>

                      <div className="text-center py-2 rounded-lg font-medium transition-all bg-blue-100 text-blue-700 hover:bg-blue-200">
                        Continue as Companion
                      </div>
                    </div>
                  </motion.div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default RoleSelectionModal;