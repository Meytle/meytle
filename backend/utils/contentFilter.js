/**
 * Content Filter Utility
 * Prevents exchange of contact information and off-platform payment mentions
 * to protect the platform and ensure all transactions happen through the app
 */

// Blocked content patterns
const BLOCKED_PATTERNS = {
  // Phone numbers in various formats
  phoneNumbers: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|(\d{10,})/g,
  
  // Email addresses
  emails: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  
  // Social media platforms and usernames
  socialMedia: /(instagram|insta|facebook|fb|whatsapp|telegram|snapchat|snap|twitter|tiktok|linkedin|discord|kik|wechat|line|viber)[:\s]?[@]?[\w.-]{3,}|(ig|fb)[@:][\w.-]{3,}|@[\w.-]{3,}/gi,
  
  // Payment apps and cash mentions
  paymentMentions: /(cash|venmo|paypal|zelle|cashapp|cash\s*app|wire\s*transfer|western\s*union|moneygram|bitcoin|crypto|btc|eth)/gi,
  
  // Physical addresses
  addresses: /(\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Circle|Cir|Parkway|Pkwy|Highway|Hwy)\.?\s*(?:#|Apt|Unit)?[\w\s]*)/gi,
  
  // URLs and links
  urls: /(https?:\/\/[^\s]+|www\.[^\s]+|\w+\.(com|net|org|io|co|me|tv|info|biz|us|uk|ca)[\s/])/gi,
  
  // Common ways to share contact info
  contactKeywords: /(call\s*me|text\s*me|email\s*me|dm\s*me|message\s*me|add\s*me|contact\s*me|reach\s*me|my\s*number|phone\s*number|cell\s*number)/gi
};

/**
 * Filter message text for blocked content
 * @param {string} text - The message text to filter
 * @returns {Object} - { isClean: boolean, violations: string[], matches: Object }
 */
function filterMessage(text) {
  if (!text || typeof text !== 'string') {
    return {
      isClean: false,
      violations: ['invalid_input'],
      matches: {}
    };
  }

  let isClean = true;
  const violations = [];
  const matches = {};

  // Test each pattern
  for (const [type, pattern] of Object.entries(BLOCKED_PATTERNS)) {
    const found = text.match(pattern);
    if (found && found.length > 0) {
      isClean = false;
      violations.push(type);
      matches[type] = found;
    }
  }

  return {
    isClean,
    violations,
    matches
  };
}

/**
 * Get a user-friendly message about why content was blocked
 * @param {string[]} violations - Array of violation types
 * @returns {string} - User-friendly message
 */
function getBlockedReasonMessage(violations) {
  if (!violations || violations.length === 0) {
    return 'Message blocked for violating platform policies';
  }

  const reasons = {
    phoneNumbers: 'phone numbers',
    emails: 'email addresses',
    socialMedia: 'social media handles',
    paymentMentions: 'payment app mentions or cash',
    addresses: 'physical addresses',
    urls: 'web links',
    contactKeywords: 'attempts to exchange contact information'
  };

  const blockedItems = violations
    .map(v => reasons[v] || v)
    .join(', ');

  return `Your message was blocked because it contains: ${blockedItems}. Please use only the platform's messaging and payment systems.`;
}

module.exports = {
  filterMessage,
  getBlockedReasonMessage,
  BLOCKED_PATTERNS
};

