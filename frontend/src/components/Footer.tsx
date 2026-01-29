/**
 * Footer Component
 * Consistent footer across all pages
 */

import { Link } from 'react-router-dom';
import {
  FaEnvelope,
  FaMapMarkerAlt
} from 'react-icons/fa';

// App version from package.json
const APP_VERSION = '1.0.0';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer id="footer" className="bg-gradient-to-br from-[#1e3a8a] via-[#0F0D26] to-[#08071A] text-white mt-auto relative overflow-hidden">
      {/* Background overlay for premium effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#1e4e8f]/10 to-[#FFCCCB]/5 pointer-events-none"></div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Column 1: Logo and Description */}
          <div className="col-span-1 md:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-gradient-to-r from-[#1e4e8f] to-[#1e3a8a] rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(255,204,203,0.3)]">
                <svg
                  className="w-full h-full p-1"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 2C8.686 2 6 4.686 6 8c0 4 6 14 6 14s6-10 6-14c0-3.314-2.686-6-6-6zm0 9a3 3 0 100-6 3 3 0 000 6z"
                    className="stroke-white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-bold">Meytle</h3>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed mb-6">
              The vibrant platform for finding amazing social companions. Colorful experiences,
              trustworthy connections, and memorable adventures.
            </p>
          </div>

          {/* Column 2: Services */}
          <div>
            <h4 className="text-lg font-semibold mb-4">Services</h4>
            <ul className="space-y-2">
              <li className="text-gray-300 text-sm">Coffee Dates</li>
              <li className="text-gray-300 text-sm">Dinner Dates</li>
              <li className="text-gray-300 text-sm">Event Companions</li>
              <li className="text-gray-300 text-sm">Cultural Activities</li>
              <li className="text-gray-300 text-sm">Outdoor Adventures</li>
            </ul>
          </div>

          {/* Column 3: Company */}
          <div>
            <h4 className="text-lg font-semibold mb-4">Company</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/#steps" className="text-gray-300 hover:text-[#FFCCCB] transition-all duration-300 text-sm hover:drop-shadow-[0_0_8px_rgba(255,204,203,0.4)]">
                  How It Works
                </Link>
              </li>
              <li>
                <Link to="/signup?role=companion" className="text-gray-300 hover:text-[#FFCCCB] transition-all duration-300 text-sm hover:drop-shadow-[0_0_8px_rgba(255,204,203,0.4)]">
                  Become a Companion
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Contact */}
          <div>
            <h4 className="text-lg font-semibold mb-4">Contact</h4>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <FaEnvelope className="w-5 h-5 text-[#FFCCCB] drop-shadow-[0_0_8px_rgba(255,204,203,0.4)] mt-0.5 flex-shrink-0" />
                <a
                  href="mailto:support@meytle.com"
                  className="text-gray-300 hover:text-[#FFCCCB] transition-all duration-300 text-sm hover:drop-shadow-[0_0_8px_rgba(255,204,203,0.4)]"
                >
                  support@meytle.com
                </a>
              </li>
              <li className="flex items-start gap-3">
                <FaMapMarkerAlt className="w-5 h-5 text-[#FFCCCB] drop-shadow-[0_0_8px_rgba(255,204,203,0.4)] mt-0.5 flex-shrink-0" />
                <span className="text-gray-300 text-sm">
                  San Francisco, CA
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-12 pt-8 border-t border-[#1e4e8f]/30">
          <div className="flex flex-col sm:flex-row justify-center items-center gap-2">
            <p className="text-gray-400 text-sm">
              © {currentYear} Meytle. All rights reserved.
            </p>
            <span className="text-gray-500 text-xs">
              v{APP_VERSION}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;



