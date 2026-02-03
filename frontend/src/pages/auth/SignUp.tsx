import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FaEye, FaEyeSlash, FaEnvelope, FaUser, FaLock, FaArrowLeft, FaCheck } from 'react-icons/fa';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate, Link } from 'react-router-dom';
import FloatingProfileImages from '../../components/common/FloatingProfileImages';

const SignUp = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'client' | 'companion' | null>(null);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [currentStep, setCurrentStep] = useState(1); // Step 1: Role selection, Step 2: Registration form
  const [error, setError] = useState('');
  const { signUp, isLoading } = useAuth();
  const navigate = useNavigate();

  // Password requirements check
  const passwordRequirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };

  const allRequirementsMet = Object.values(passwordRequirements).every(req => req);
  const requirementsMet = Object.values(passwordRequirements).filter(req => req).length;
  const strengthPercentage = (requirementsMet / 5) * 100;

  const handleNext = () => {
    if (selectedRole) {
      setCurrentStep(2);
    }
  };

  const handleBack = () => {
    setCurrentStep(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedRole) {
      setError('Please select a role');
      return;
    }
    if (!allRequirementsMet) {
      setError('Please meet all password requirements');
      return;
    }
    if (!agreedToTerms) {
      setError('Please agree to the terms');
      return;
    }

    try {
      await signUp({
        name,
        email,
        password,
        roles: [selectedRole]
      });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create account. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex relative">
      {/* Floating Browser/Back Button */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-6 left-6 z-50 w-12 h-12 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:shadow-xl hover:bg-white transition-all duration-200"
      >
        <FaArrowLeft className="text-gray-700 text-lg" />
      </button>

      {/* Left Side - Visual Section (60%) */}
      <motion.div
        className="hidden lg:flex lg:w-3/5 relative bg-gradient-to-br from-[#1e3a8a] to-[#1e4e8f] items-center justify-center"
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8 }}
      >
        {/* Floating Profile Images - Auth variant, absolute positioned within left container */}
        <FloatingProfileImages variant="auth" zIndex="z-0" opacity={0.4} positionMode="absolute" />

        {/* Gradient background with centered logo/text */}
        <div className="text-center relative z-10">
          <h1 className="text-6xl font-bold text-white mb-4" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>Join Meytle</h1>
          <p className="text-xl text-white/80" style={{ textShadow: '0 1px 5px rgba(0,0,0,0.3)' }}>Start Your Journey Today</p>
        </div>
      </motion.div>

      {/* Right Side - Sign Up Form (40%) */}
      <div className="w-full lg:w-2/5 flex items-center justify-center bg-gradient-to-br from-[#FFF0F0] via-[#FFE5E5] to-[#FFCCCB]">
        <div className="w-full max-w-md px-8 py-12">
          {/* Mobile Logo - only visible on small screens */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#1e3a8a] to-[#1e4e8f] bg-clip-text text-transparent">Meytle</h1>
          </div>

          {/* Join us heading */}
          <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">
            Join us
          </h2>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          {/* Sign Up Form */}
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: currentStep === 2 ? 20 : -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {currentStep === 1 ? (
              /* Step 1: Role Selection */
              <>
                {/* Role Selection Cards - Minimal Design */}
                <div className="space-y-4">
                  <p className="text-base text-gray-700 font-medium text-center">Select your role</p>
                  <div className="grid grid-cols-2 gap-4">
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedRole('client')}
                      className={`p-8 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedRole === 'client'
                          ? 'border-[#1e4e8f] bg-white shadow-lg'
                          : 'border-gray-200 bg-white/70 hover:border-[#1e4e8f]/40 hover:shadow-md'
                      }`}
                    >
                      <div className="text-center">
                        <div className={`text-xl font-semibold transition-colors ${
                          selectedRole === 'client' ? 'text-[#1e4e8f]' : 'text-gray-700'
                        }`}>
                          Client
                        </div>
                      </div>
                    </motion.div>

                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedRole('companion')}
                      className={`p-8 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedRole === 'companion'
                          ? 'border-[#1e4e8f] bg-white shadow-lg'
                          : 'border-gray-200 bg-white/70 hover:border-[#1e4e8f]/40 hover:shadow-md'
                      }`}
                    >
                      <div className="text-center">
                        <div className={`text-xl font-semibold transition-colors ${
                          selectedRole === 'companion' ? 'text-[#1e4e8f]' : 'text-gray-700'
                        }`}>
                          Companion
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </div>

                {/* Action Buttons for Step 1 */}
                <div className="flex justify-center items-center gap-3 pt-8">
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={!selectedRole}
                    className={`w-24 h-24 flex items-center justify-center rounded-full text-base font-medium text-white bg-gradient-to-r from-[#1e4e8f] to-[#1e3a8a] hover:shadow-[0_0_30px_rgba(30,78,143,0.6)] hover:transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1e4e8f] transition-all duration-300 ${
                      !selectedRole ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    Next
                  </button>

                  <Link
                    to="/signin"
                    className="w-24 h-24 flex items-center justify-center rounded-full text-base font-medium text-[#1e4e8f] bg-white/90 backdrop-blur-sm border-2 border-[#1e4e8f] hover:bg-gradient-to-r hover:from-[#1e4e8f] hover:to-[#1e3a8a] hover:text-white hover:shadow-[0_0_20px_rgba(30,78,143,0.5)] hover:border-transparent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1e4e8f] transition-all duration-300"
                  >
                    Sign in
                  </Link>
                </div>
              </>
            ) : (
              /* Step 2: Registration Form */
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name Field */}
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <FaUser className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="block w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:bg-white focus:border-gray-300 transition-all duration-200"
                    placeholder="Full name"
                  />
                </div>

                {/* Email Field */}
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <FaEnvelope className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:bg-white focus:border-gray-300 transition-all duration-200"
                    placeholder="Email address"
                  />
                </div>

                {/* Password Field */}
                <div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <FaLock className="h-4 w-4 text-gray-400" />
                    </div>
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-4 flex items-center"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <FaEyeSlash className="h-4 w-4 text-gray-400 hover:text-gray-600 transition-colors" />
                      ) : (
                        <FaEye className="h-4 w-4 text-gray-400 hover:text-gray-600 transition-colors" />
                      )}
                    </button>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setPasswordFocused(true)}
                      onBlur={() => setPasswordFocused(false)}
                      className="block w-full pl-12 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:bg-white focus:border-gray-300 transition-all duration-200"
                      placeholder="Password"
                    />
                  </div>

                  {/* Password Strength Indicator - Always Fixed Height (No Layout Shift) */}
                  <div className="mt-2" style={{ minHeight: '76px' }}>
                    {password.length > 0 ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        {/* Strength Bar */}
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-2">
                          <motion.div
                            className={`h-full transition-all duration-300 ${
                              strengthPercentage >= 100 ? 'bg-green-500' :
                              strengthPercentage >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            initial={{ width: 0 }}
                            animate={{ width: `${strengthPercentage}%` }}
                          />
                        </div>

                        {/* Requirements - 2 Column Grid Layout */}
                        {(passwordFocused || !allRequirementsMet) && (
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                            <div className={`flex items-center text-xs ${passwordRequirements.length ? 'text-green-600' : 'text-gray-400'}`}>
                              <FaCheck className={`w-2.5 h-2.5 mr-1.5 flex-shrink-0 ${passwordRequirements.length ? 'opacity-100' : 'opacity-30'}`} />
                              <span className="text-xs">8+ characters</span>
                            </div>
                            <div className={`flex items-center text-xs ${passwordRequirements.number ? 'text-green-600' : 'text-gray-400'}`}>
                              <FaCheck className={`w-2.5 h-2.5 mr-1.5 flex-shrink-0 ${passwordRequirements.number ? 'opacity-100' : 'opacity-30'}`} />
                              <span className="text-xs">Number</span>
                            </div>
                            <div className={`flex items-center text-xs ${passwordRequirements.uppercase ? 'text-green-600' : 'text-gray-400'}`}>
                              <FaCheck className={`w-2.5 h-2.5 mr-1.5 flex-shrink-0 ${passwordRequirements.uppercase ? 'opacity-100' : 'opacity-30'}`} />
                              <span className="text-xs">Uppercase</span>
                            </div>
                            <div className={`flex items-center text-xs ${passwordRequirements.special ? 'text-green-600' : 'text-gray-400'}`}>
                              <FaCheck className={`w-2.5 h-2.5 mr-1.5 flex-shrink-0 ${passwordRequirements.special ? 'opacity-100' : 'opacity-30'}`} />
                              <span className="text-xs">Special char</span>
                            </div>
                            <div className={`flex items-center text-xs ${passwordRequirements.lowercase ? 'text-green-600' : 'text-gray-400'}`}>
                              <FaCheck className={`w-2.5 h-2.5 mr-1.5 flex-shrink-0 ${passwordRequirements.lowercase ? 'opacity-100' : 'opacity-30'}`} />
                              <span className="text-xs">Lowercase</span>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ) : null}
                  </div>
                </div>

                {/* Terms Checkbox - styled as bubble */}
                <div className="flex justify-center">
                  <label
                    className={`inline-flex items-center px-4 py-2 rounded-full cursor-pointer transition-all ${
                      agreedToTerms
                        ? 'bg-green-50 border border-green-200'
                        : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-4 h-4 rounded border-2 mr-2 flex items-center justify-center transition-colors ${
                      agreedToTerms ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300'
                    }`}>
                      {agreedToTerms && <FaCheck className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <span className="text-xs text-gray-600">
                      I agree to the <Link to="/terms" className="text-[#1e4e8f] hover:underline">terms</Link>
                    </span>
                  </label>
                </div>

                {/* Submit Buttons - Circular */}
                <div className="flex justify-center items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isLoading || !allRequirementsMet || !agreedToTerms}
                    className={`w-24 h-24 flex items-center justify-center rounded-full text-base font-medium text-white bg-gradient-to-r from-[#1e4e8f] to-[#1e3a8a] hover:shadow-[0_0_30px_rgba(30,78,143,0.6)] hover:transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1e4e8f] transition-all duration-300 ${
                      (isLoading || !allRequirementsMet || !agreedToTerms) ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isLoading ? '...' : 'Join'}
                  </button>

                  <Link
                    to="/signin"
                    className="w-24 h-24 flex items-center justify-center rounded-full text-base font-medium text-[#1e4e8f] bg-white/90 backdrop-blur-sm border-2 border-[#1e4e8f] hover:bg-gradient-to-r hover:from-[#1e4e8f] hover:to-[#1e3a8a] hover:text-white hover:shadow-[0_0_20px_rgba(30,78,143,0.5)] hover:border-transparent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1e4e8f] transition-all duration-300"
                  >
                    Sign in
                  </Link>
                </div>

                {/* Back button for step 2 */}
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    ← Back to role selection
                  </button>
                </div>
              </form>
            )}

            {/* Progress dots */}
            <div className="flex justify-center gap-2 pt-4">
              <div className={`w-2 h-2 rounded-full transition-colors ${currentStep === 1 ? 'bg-[#1e4e8f]' : 'bg-[#1e4e8f]/30'}`}></div>
              <div className={`w-2 h-2 rounded-full transition-colors ${currentStep === 2 ? 'bg-[#1e4e8f]' : 'bg-[#1e4e8f]/30'}`}></div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default SignUp;