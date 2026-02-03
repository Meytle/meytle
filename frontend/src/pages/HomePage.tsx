/**
 * Enhanced Homepage V3 - Three Section Layout
 * Optimized for performance with memoization and reduced animations
 */

import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FaShieldAlt,
  FaCoffee, FaUtensils, FaFilm, FaShoppingBag,
  FaTheaterMasks, FaMusic, FaMapMarkedAlt, FaMountain,
  FaArrowRight,
  FaUserPlus, FaSearch, FaCalendarCheck,
  FaIdCard, FaLock, FaMapMarkerAlt, FaHandshake,
  FaChevronDown
} from 'react-icons/fa';
import { ROUTES } from '../constants';
import { useAuth } from '../hooks/useAuth';
import FloatingProfileImages from '../components/common/FloatingProfileImages';

const HomePage = memo(() => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [isVisible, setIsVisible] = useState(false);

  // Fade in animation on mount
  useEffect(() => {
    setIsVisible(true);
  }, []);

  // Memoized arrays to prevent re-creation on every render

  const services = useMemo(() => [
    {
      icon: FaCoffee,
      title: 'Coffee Dates',
      description: 'Casual meetups and meaningful conversations',
      color: 'from-[#1e4e8f] to-[#1e3a8a]',
      popular: true
    },
    {
      icon: FaUtensils,
      title: 'Dining',
      description: 'Fine dining and culinary experiences',
      color: 'from-[#FFCCCB] to-[#1e4e8f]',
      popular: true
    },
    {
      icon: FaMusic,
      title: 'Concerts & Events',
      description: 'Live music and entertainment nights',
      color: 'from-[#1e4e8f] to-[#1e3a8a]',
      popular: true
    },
    {
      icon: FaTheaterMasks,
      title: 'Cultural Activities',
      description: 'Museums, galleries, and art events',
      color: 'from-[#FFCCCB] to-[#1e4e8f]',
      popular: false
    },
    {
      icon: FaMapMarkedAlt,
      title: 'Travel',
      description: 'Explore new destinations together',
      color: 'from-[#1e4e8f] to-[#1e3a8a]',
      popular: false
    },
    {
      icon: FaMountain,
      title: 'Outdoor Adventures',
      description: 'Hiking, sports, and nature activities',
      color: 'from-[#FFCCCB] to-[#1e4e8f]',
      popular: false
    },
    {
      icon: FaFilm,
      title: 'Entertainment',
      description: 'Movies, theaters, and shows',
      color: 'from-[#1e4e8f] to-[#1e3a8a]',
      popular: false
    },
    {
      icon: FaShoppingBag,
      title: 'Shopping',
      description: 'Personal shopping and style advice',
      color: 'from-[#FFCCCB] to-[#1e4e8f]',
      popular: false
    }
  ], []);

  // Memoized click handlers
  const handleGetStarted = useCallback(() => {
    if (isAuthenticated && user) {
      if (user.activeRole === 'admin') {
        navigate(ROUTES.ADMIN_DASHBOARD);
      } else if (user.activeRole === 'companion') {
        navigate(ROUTES.COMPANION_DASHBOARD);
      } else {
        navigate(ROUTES.CLIENT_DASHBOARD);
      }
    } else {
      navigate(ROUTES.SIGN_UP);
    }
  }, [isAuthenticated, user, navigate]);

  const handleSignIn = useCallback(() => {
    if (isAuthenticated && user) {
      if (user.activeRole === 'admin') {
        navigate(ROUTES.ADMIN_DASHBOARD);
      } else if (user.activeRole === 'companion') {
        navigate(ROUTES.COMPANION_DASHBOARD);
      } else {
        navigate(ROUTES.CLIENT_DASHBOARD);
      }
    } else {
      navigate(ROUTES.SIGN_IN);
    }
  }, [isAuthenticated, user, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFF0F0] via-[#FFE5E5] to-[#FFCCCB]">
      {/* Main content */}
      <div className="relative z-10">
        {/* SECTION 1: HERO - Responsive Height */}
        <section className="relative overflow-hidden flex items-center justify-center min-h-[70vh] sm:min-h-[75vh] md:min-h-[80vh] lg:min-h-[85vh]">
        {/* Floating Avatars - Smaller & More Subtle */}
        <FloatingProfileImages variant="hero" className="z-0" opacity={0.6} positionMode="absolute" />

        {/* OPTIMIZED: Soft gradient orbs for light background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -left-40 w-80 h-80 bg-[#1e4e8f] rounded-full opacity-20 blur-3xl" />
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-[#FFCCCB] rounded-full opacity-30 blur-3xl" />
          <div className="absolute -bottom-40 left-1/2 w-80 h-80 bg-[#FFE5E5] rounded-full opacity-25 blur-3xl" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 py-8 sm:py-12 md:py-16 text-center">
          {/* Main Headline */}
          <div className={`mb-6 sm:mb-8 transition-all duration-1000 delay-100 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900">
              Find Your Perfect{' '}
              <span className="bg-gradient-to-r from-[#1e4e8f] via-[#2563eb] to-[#1e3a8a] bg-clip-text text-transparent">
                Companion
              </span>
            </h1>
          </div>

          {/* Subheadline */}
          <p className={`text-lg sm:text-xl md:text-2xl text-gray-700 max-w-3xl mx-auto mb-8 sm:mb-10 md:mb-12 transition-all duration-1000 delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            Verified companions for every occasion.
            <br />
            Coffee dates, concerts, travel & more.
          </p>

          {/* CTA Button */}
          <div className={`transition-all duration-1000 delay-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <Link
              to="/signin"
              className="group inline-flex items-center gap-3 px-8 py-4 sm:px-10 sm:py-5 bg-gradient-to-r from-[#1e4e8f] to-[#2563eb] text-white text-base sm:text-lg md:text-xl font-bold rounded-full shadow-xl hover:shadow-2xl hover:scale-105 transform transition-all duration-300 hover:from-[#1e3a8a] hover:to-[#1e4e8f]"
            >
              <span>Find Companions Near You</span>
              <FaArrowRight className="w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

        </div>
      </section>

      {/* SECTION 2: SERVICES */}
      <section id="services" className="py-12 sm:py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4">
          {/* Section Header */}
          <div className="text-center mb-8 sm:mb-12 md:mb-16">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Popular <span className="bg-gradient-to-r from-[#1e4e8f] to-[#1e3a8a] bg-clip-text text-transparent">Experiences</span>
            </h2>
            <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto">
              From coffee dates to cultural events, find your perfect companion
            </p>
          </div>

          {/* Services Grid - 8 cards optimized */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-6xl mx-auto">
            {services.map((service, index) => {
              const Icon = service.icon;
              return (
                <div
                  key={index}
                  className="relative group bg-white/80 backdrop-blur-md rounded-2xl p-6 shadow-lg hover:shadow-2xl hover:shadow-[#FFCCCB]/25 transition-all duration-300 hover:-translate-y-1 border border-[#d5d3f7]"
                >
                  {/* Popular Badge */}
                  {service.popular && (
                    <div className="absolute -top-3 -right-3 px-3 py-1 bg-gradient-to-r from-[#1e4e8f] to-[#1e3a8a] text-white text-xs font-semibold rounded-full shadow-[0_0_15px_rgba(255,204,203,0.4)]">
                      Popular
                    </div>
                  )}

                  {/* Icon */}
                  <div className={`w-16 h-16 bg-gradient-to-r ${service.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>

                  {/* Content */}
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">
                    {service.title}
                  </h3>
                  <p className="text-gray-600 text-sm sm:text-base">
                    {service.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 3: HOW IT WORKS - Modern Minimal Design */}
      <section id="steps" className="py-12 sm:py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4">
          {/* Section Header */}
          <div className="text-center mb-10 sm:mb-14 md:mb-20">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              How It Works
            </h2>
            <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto">
              Connect with verified companions in three simple steps
            </p>
          </div>

          {/* Steps - Clean Timeline Layout */}
          <div className="relative max-w-5xl mx-auto">
            {/* Connecting Line - Desktop */}
            <div className="hidden lg:block absolute top-24 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gray-300 to-transparent" 
                 style={{ marginLeft: '15%', marginRight: '15%' }} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 lg:gap-8">
              {/* Step 1 */}
              <div className="relative group">
                <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-[#1e4e8f]/20">
                  {/* Number Badge */}
                  <div className="absolute -top-4 left-8 w-12 h-12 bg-gradient-to-br from-[#1e4e8f] to-[#2563eb] rounded-full flex items-center justify-center shadow-lg">
                    <span className="text-white text-xl font-bold">1</span>
                  </div>
                  
                  {/* Icon */}
                  <div className="mt-6 mb-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-[#1e4e8f]/10 to-[#2563eb]/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <FaUserPlus className="w-8 h-8 text-[#1e4e8f]" />
                    </div>
                  </div>
                  
                  {/* Content */}
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
                    Create Your Profile
                  </h3>
                  <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                    Quick signup with ID verification. Set your preferences and let us know what experiences you're seeking.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="relative group">
                <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-[#1e4e8f]/20">
                  {/* Number Badge */}
                  <div className="absolute -top-4 left-8 w-12 h-12 bg-gradient-to-br from-[#1e4e8f] to-[#2563eb] rounded-full flex items-center justify-center shadow-lg">
                    <span className="text-white text-xl font-bold">2</span>
                  </div>
                  
                  {/* Icon */}
                  <div className="mt-6 mb-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-[#1e4e8f]/10 to-[#2563eb]/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <FaSearch className="w-8 h-8 text-[#1e4e8f]" />
                    </div>
                  </div>
                  
                  {/* Content */}
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
                    Browse & Match
                  </h3>
                  <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                    Explore verified profiles based on your interests. Filter by activity, location, and availability.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="relative group">
                <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-[#1e4e8f]/20">
                  {/* Number Badge */}
                  <div className="absolute -top-4 left-8 w-12 h-12 bg-gradient-to-br from-[#1e4e8f] to-[#2563eb] rounded-full flex items-center justify-center shadow-lg">
                    <span className="text-white text-xl font-bold">3</span>
                  </div>
                  
                  {/* Icon */}
                  <div className="mt-6 mb-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-[#1e4e8f]/10 to-[#2563eb]/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <FaCalendarCheck className="w-8 h-8 text-[#1e4e8f]" />
                    </div>
                  </div>
                  
                  {/* Content */}
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
                    Connect & Meet
                  </h3>
                  <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                    Secure messaging, safe payment, and instant booking. Start your experience together.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: TRUST & SAFETY */}
      <section id="safety" className="py-12 sm:py-16 md:py-20 bg-white/50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10 sm:mb-14 md:mb-16">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Your Safety, <span className="bg-gradient-to-r from-[#1e4e8f] to-[#1e3a8a] bg-clip-text text-transparent">Our Priority</span>
            </h2>
            <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto">
              Every meeting is protected by multiple layers of verification
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <div className="w-14 h-14 bg-gradient-to-br from-[#1e4e8f]/10 to-[#2563eb]/10 rounded-xl flex items-center justify-center mb-4">
                <FaIdCard className="w-7 h-7 text-[#1e4e8f]" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">ID Verified</h3>
              <p className="text-sm text-gray-600">All users verify their identity with government ID and selfie before booking.</p>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <div className="w-14 h-14 bg-gradient-to-br from-[#1e4e8f]/10 to-[#2563eb]/10 rounded-xl flex items-center justify-center mb-4">
                <FaLock className="w-7 h-7 text-[#1e4e8f]" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Payment Protected</h3>
              <p className="text-sm text-gray-600">Funds are held securely until both parties verify the meeting took place.</p>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <div className="w-14 h-14 bg-gradient-to-br from-[#1e4e8f]/10 to-[#2563eb]/10 rounded-xl flex items-center justify-center mb-4">
                <FaMapMarkerAlt className="w-7 h-7 text-[#1e4e8f]" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">GPS Verified</h3>
              <p className="text-sm text-gray-600">OTP codes + location check ensures both parties are at the meeting spot.</p>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <div className="w-14 h-14 bg-gradient-to-br from-[#1e4e8f]/10 to-[#2563eb]/10 rounded-xl flex items-center justify-center mb-4">
                <FaHandshake className="w-7 h-7 text-[#1e4e8f]" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Money-Back Guarantee</h3>
              <p className="text-sm text-gray-600">Full refund if meeting doesn't happen. No verification = no charge.</p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5: FAQ */}
      <section id="faq" className="py-12 sm:py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Common Questions
            </h2>
            <p className="text-lg sm:text-xl text-gray-600">
              Everything you need to know before getting started
            </p>
          </div>

          <div className="space-y-4">
            <details className="group bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer list-none">
                <h3 className="text-lg font-semibold text-gray-900">Is it safe to meet companions through Meytle?</h3>
                <FaChevronDown className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" />
              </summary>
              <div className="px-6 pb-6 text-gray-600">
                <p>Yes! Safety is our top priority. All users must verify their identity with a government ID and selfie. Payments are held securely until both parties verify the meeting with OTP codes and GPS location check. If the meeting doesn't happen, you get a full refund automatically.</p>
              </div>
            </details>

            <details className="group bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer list-none">
                <h3 className="text-lg font-semibold text-gray-900">How do payments work?</h3>
                <FaChevronDown className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" />
              </summary>
              <div className="px-6 pb-6 text-gray-600">
                <p>When you book, your payment is authorized but not charged. The money is only captured after both you and the companion verify the meeting using OTP codes sent to your email. Companions receive their payment after successful verification. If the meeting doesn't happen, you're never charged.</p>
              </div>
            </details>

            <details className="group bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer list-none">
                <h3 className="text-lg font-semibold text-gray-900">What if the companion cancels?</h3>
                <FaChevronDown className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" />
              </summary>
              <div className="px-6 pb-6 text-gray-600">
                <p>If a companion cancels before the meeting, you receive a full refund automatically. Our cancellation policy locks bookings 3 hours before the meeting time to prevent last-minute cancellations. Companions who cancel frequently may be removed from the platform.</p>
              </div>
            </details>

            <details className="group bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer list-none">
                <h3 className="text-lg font-semibold text-gray-900">How do I become a companion?</h3>
                <FaChevronDown className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" />
              </summary>
              <div className="px-6 pb-6 text-gray-600">
                <p>Sign up and select "Become a Companion". Complete your profile with photos and a bio, set your hourly rate and availability, then verify your identity. Once approved, you'll appear in search results and can start accepting bookings. Companions keep 85% of each booking.</p>
              </div>
            </details>

            <details className="group bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer list-none">
                <h3 className="text-lg font-semibold text-gray-900">What happens at the meeting?</h3>
                <FaChevronDown className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" />
              </summary>
              <div className="px-6 pb-6 text-gray-600">
                <p>Before the meeting, both parties receive OTP codes via email. At the meeting location, you and your companion exchange OTP codes to verify presence. The system also checks GPS location. Once verified, payment is processed and you can enjoy your activity together!</p>
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* SECTION 6: FINAL CTA */}
      <section className="py-12 sm:py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4">
          {/* Final CTA - More Elegant */}
          <div className="text-center">
            <div className="max-w-3xl mx-auto bg-gradient-to-br from-[#1e4e8f] to-[#2563eb] rounded-3xl p-8 sm:p-12 shadow-2xl relative overflow-hidden">
              {/* Background Decoration */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full -ml-24 -mb-24" />
              
              <div className="relative z-10">
                <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">
                  Connect, Hangout, and Earn - Simple as That
                </h3>

                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                  <button
                    onClick={handleGetStarted}
                    className="w-full sm:w-auto min-h-[44px] px-8 sm:px-10 py-3 sm:py-4 bg-white text-[#1e4e8f] font-bold text-base sm:text-lg rounded-full hover:bg-gray-50 transition-all duration-300 hover:scale-105 shadow-xl hover:shadow-2xl"
                  >
                    Apply as Companion
                  </button>
                  <button
                    onClick={handleSignIn}
                    className="w-full sm:w-auto min-h-[44px] px-8 sm:px-10 py-3 sm:py-4 bg-transparent text-white font-semibold text-base sm:text-lg rounded-full border-2 border-white/30 hover:bg-white/10 hover:border-white/50 transition-all duration-300"
                  >
                    Sign In
                  </button>
                </div>

                {/* Trust Badge */}
                <div className="mt-8 flex items-center justify-center gap-3 text-white/80">
                  <FaShieldAlt className="w-5 h-5" />
                  <span className="text-sm">SSL Secured • ID Verified • Safe Payments</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      </div> {/* End of content wrapper */}
    </div>
  );
});

HomePage.displayName = 'HomePage';

export default HomePage;