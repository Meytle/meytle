/**
 * Country phone codes data
 * Contains country dial codes and phone number formats
 */

export interface CountryPhoneCode {
  code: string;        // ISO country code (e.g., 'US', 'GB')
  name: string;        // Country name
  dialCode: string;    // International dial code (e.g., '+1', '+44')
  flag: string;        // Country flag emoji
  format?: string;     // Phone number format placeholder
  maxLength?: number;  // Maximum phone number length (without country code)
  minLength?: number;  // Minimum phone number length (without country code)
}

export const countryPhoneCodes: CountryPhoneCode[] = [
  { code: 'AF', name: 'Afghanistan', dialCode: '+93', flag: '🇦🇫', maxLength: 9 },
  { code: 'AL', name: 'Albania', dialCode: '+355', flag: '🇦🇱', maxLength: 9 },
  { code: 'DZ', name: 'Algeria', dialCode: '+213', flag: '🇩🇿', maxLength: 9 },
  { code: 'AS', name: 'American Samoa', dialCode: '+1684', flag: '🇦🇸', maxLength: 10 },
  { code: 'AD', name: 'Andorra', dialCode: '+376', flag: '🇦🇩', maxLength: 6 },
  { code: 'AO', name: 'Angola', dialCode: '+244', flag: '🇦🇴', maxLength: 9 },
  { code: 'AI', name: 'Anguilla', dialCode: '+1264', flag: '🇦🇮', maxLength: 10 },
  { code: 'AR', name: 'Argentina', dialCode: '+54', flag: '🇦🇷', maxLength: 10 },
  { code: 'AM', name: 'Armenia', dialCode: '+374', flag: '🇦🇲', maxLength: 8 },
  { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺', maxLength: 9, format: '(XXX) XXX-XXXX' },
  { code: 'AT', name: 'Austria', dialCode: '+43', flag: '🇦🇹', maxLength: 10 },
  { code: 'AZ', name: 'Azerbaijan', dialCode: '+994', flag: '🇦🇿', maxLength: 9 },
  { code: 'BS', name: 'Bahamas', dialCode: '+1242', flag: '🇧🇸', maxLength: 10 },
  { code: 'BH', name: 'Bahrain', dialCode: '+973', flag: '🇧🇭', maxLength: 8 },
  { code: 'BD', name: 'Bangladesh', dialCode: '+880', flag: '🇧🇩', maxLength: 10 },
  { code: 'BB', name: 'Barbados', dialCode: '+1246', flag: '🇧🇧', maxLength: 10 },
  { code: 'BY', name: 'Belarus', dialCode: '+375', flag: '🇧🇾', maxLength: 9 },
  { code: 'BE', name: 'Belgium', dialCode: '+32', flag: '🇧🇪', maxLength: 9 },
  { code: 'BZ', name: 'Belize', dialCode: '+501', flag: '🇧🇿', maxLength: 7 },
  { code: 'BJ', name: 'Benin', dialCode: '+229', flag: '🇧🇯', maxLength: 8 },
  { code: 'BM', name: 'Bermuda', dialCode: '+1441', flag: '🇧🇲', maxLength: 10 },
  { code: 'BT', name: 'Bhutan', dialCode: '+975', flag: '🇧🇹', maxLength: 8 },
  { code: 'BO', name: 'Bolivia', dialCode: '+591', flag: '🇧🇴', maxLength: 8 },
  { code: 'BA', name: 'Bosnia and Herzegovina', dialCode: '+387', flag: '🇧🇦', maxLength: 8 },
  { code: 'BW', name: 'Botswana', dialCode: '+267', flag: '🇧🇼', maxLength: 8 },
  { code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷', maxLength: 11, format: '(XX) XXXXX-XXXX' },
  { code: 'BG', name: 'Bulgaria', dialCode: '+359', flag: '🇧🇬', maxLength: 9 },
  { code: 'BF', name: 'Burkina Faso', dialCode: '+226', flag: '🇧🇫', maxLength: 8 },
  { code: 'BI', name: 'Burundi', dialCode: '+257', flag: '🇧🇮', maxLength: 8 },
  { code: 'KH', name: 'Cambodia', dialCode: '+855', flag: '🇰🇭', maxLength: 9 },
  { code: 'CM', name: 'Cameroon', dialCode: '+237', flag: '🇨🇲', maxLength: 9 },
  { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦', maxLength: 10, format: '(XXX) XXX-XXXX' },
  { code: 'CV', name: 'Cape Verde', dialCode: '+238', flag: '🇨🇻', maxLength: 7 },
  { code: 'KY', name: 'Cayman Islands', dialCode: '+1345', flag: '🇰🇾', maxLength: 10 },
  { code: 'CF', name: 'Central African Republic', dialCode: '+236', flag: '🇨🇫', maxLength: 8 },
  { code: 'TD', name: 'Chad', dialCode: '+235', flag: '🇹🇩', maxLength: 8 },
  { code: 'CL', name: 'Chile', dialCode: '+56', flag: '🇨🇱', maxLength: 9 },
  { code: 'CN', name: 'China', dialCode: '+86', flag: '🇨🇳', maxLength: 11, format: 'XXX-XXXX-XXXX' },
  { code: 'CO', name: 'Colombia', dialCode: '+57', flag: '🇨🇴', maxLength: 10 },
  { code: 'KM', name: 'Comoros', dialCode: '+269', flag: '🇰🇲', maxLength: 7 },
  { code: 'CG', name: 'Congo', dialCode: '+242', flag: '🇨🇬', maxLength: 9 },
  { code: 'CD', name: 'Congo (DRC)', dialCode: '+243', flag: '🇨🇩', maxLength: 9 },
  { code: 'CR', name: 'Costa Rica', dialCode: '+506', flag: '🇨🇷', maxLength: 8 },
  { code: 'CI', name: "Côte d'Ivoire", dialCode: '+225', flag: '🇨🇮', maxLength: 8 },
  { code: 'HR', name: 'Croatia', dialCode: '+385', flag: '🇭🇷', maxLength: 9 },
  { code: 'CU', name: 'Cuba', dialCode: '+53', flag: '🇨🇺', maxLength: 8 },
  { code: 'CY', name: 'Cyprus', dialCode: '+357', flag: '🇨🇾', maxLength: 8 },
  { code: 'CZ', name: 'Czech Republic', dialCode: '+420', flag: '🇨🇿', maxLength: 9 },
  { code: 'DK', name: 'Denmark', dialCode: '+45', flag: '🇩🇰', maxLength: 8 },
  { code: 'DJ', name: 'Djibouti', dialCode: '+253', flag: '🇩🇯', maxLength: 8 },
  { code: 'DM', name: 'Dominica', dialCode: '+1767', flag: '🇩🇲', maxLength: 10 },
  { code: 'DO', name: 'Dominican Republic', dialCode: '+1', flag: '🇩🇴', maxLength: 10 },
  { code: 'EC', name: 'Ecuador', dialCode: '+593', flag: '🇪🇨', maxLength: 9 },
  { code: 'EG', name: 'Egypt', dialCode: '+20', flag: '🇪🇬', maxLength: 10 },
  { code: 'SV', name: 'El Salvador', dialCode: '+503', flag: '🇸🇻', maxLength: 8 },
  { code: 'GQ', name: 'Equatorial Guinea', dialCode: '+240', flag: '🇬🇶', maxLength: 9 },
  { code: 'ER', name: 'Eritrea', dialCode: '+291', flag: '🇪🇷', maxLength: 7 },
  { code: 'EE', name: 'Estonia', dialCode: '+372', flag: '🇪🇪', maxLength: 8 },
  { code: 'ET', name: 'Ethiopia', dialCode: '+251', flag: '🇪🇹', maxLength: 9 },
  { code: 'FJ', name: 'Fiji', dialCode: '+679', flag: '🇫🇯', maxLength: 7 },
  { code: 'FI', name: 'Finland', dialCode: '+358', flag: '🇫🇮', maxLength: 10 },
  { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷', maxLength: 9, format: 'X XX XX XX XX' },
  { code: 'GA', name: 'Gabon', dialCode: '+241', flag: '🇬🇦', maxLength: 7 },
  { code: 'GM', name: 'Gambia', dialCode: '+220', flag: '🇬🇲', maxLength: 7 },
  { code: 'GE', name: 'Georgia', dialCode: '+995', flag: '🇬🇪', maxLength: 9 },
  { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪', maxLength: 11, format: 'XXX XXXXXXXX' },
  { code: 'GH', name: 'Ghana', dialCode: '+233', flag: '🇬🇭', maxLength: 9 },
  { code: 'GR', name: 'Greece', dialCode: '+30', flag: '🇬🇷', maxLength: 10 },
  { code: 'GD', name: 'Grenada', dialCode: '+1473', flag: '🇬🇩', maxLength: 10 },
  { code: 'GT', name: 'Guatemala', dialCode: '+502', flag: '🇬🇹', maxLength: 8 },
  { code: 'GN', name: 'Guinea', dialCode: '+224', flag: '🇬🇳', maxLength: 9 },
  { code: 'GW', name: 'Guinea-Bissau', dialCode: '+245', flag: '🇬🇼', maxLength: 7 },
  { code: 'GY', name: 'Guyana', dialCode: '+592', flag: '🇬🇾', maxLength: 7 },
  { code: 'HT', name: 'Haiti', dialCode: '+509', flag: '🇭🇹', maxLength: 8 },
  { code: 'HN', name: 'Honduras', dialCode: '+504', flag: '🇭🇳', maxLength: 8 },
  { code: 'HK', name: 'Hong Kong', dialCode: '+852', flag: '🇭🇰', maxLength: 8 },
  { code: 'HU', name: 'Hungary', dialCode: '+36', flag: '🇭🇺', maxLength: 9 },
  { code: 'IS', name: 'Iceland', dialCode: '+354', flag: '🇮🇸', maxLength: 7 },
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳', maxLength: 10, minLength: 10, format: 'XXXXX XXXXX' },
  { code: 'ID', name: 'Indonesia', dialCode: '+62', flag: '🇮🇩', maxLength: 11 },
  { code: 'IR', name: 'Iran', dialCode: '+98', flag: '🇮🇷', maxLength: 10 },
  { code: 'IQ', name: 'Iraq', dialCode: '+964', flag: '🇮🇶', maxLength: 10 },
  { code: 'IE', name: 'Ireland', dialCode: '+353', flag: '🇮🇪', maxLength: 9 },
  { code: 'IL', name: 'Israel', dialCode: '+972', flag: '🇮🇱', maxLength: 9 },
  { code: 'IT', name: 'Italy', dialCode: '+39', flag: '🇮🇹', maxLength: 10 },
  { code: 'JM', name: 'Jamaica', dialCode: '+1876', flag: '🇯🇲', maxLength: 10 },
  { code: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵', maxLength: 10, format: 'XX-XXXX-XXXX' },
  { code: 'JO', name: 'Jordan', dialCode: '+962', flag: '🇯🇴', maxLength: 9 },
  { code: 'KZ', name: 'Kazakhstan', dialCode: '+7', flag: '🇰🇿', maxLength: 10 },
  { code: 'KE', name: 'Kenya', dialCode: '+254', flag: '🇰🇪', maxLength: 9 },
  { code: 'KI', name: 'Kiribati', dialCode: '+686', flag: '🇰🇮', maxLength: 8 },
  { code: 'KW', name: 'Kuwait', dialCode: '+965', flag: '🇰🇼', maxLength: 8 },
  { code: 'KG', name: 'Kyrgyzstan', dialCode: '+996', flag: '🇰🇬', maxLength: 9 },
  { code: 'LA', name: 'Laos', dialCode: '+856', flag: '🇱🇦', maxLength: 9 },
  { code: 'LV', name: 'Latvia', dialCode: '+371', flag: '🇱🇻', maxLength: 8 },
  { code: 'LB', name: 'Lebanon', dialCode: '+961', flag: '🇱🇧', maxLength: 8 },
  { code: 'LS', name: 'Lesotho', dialCode: '+266', flag: '🇱🇸', maxLength: 8 },
  { code: 'LR', name: 'Liberia', dialCode: '+231', flag: '🇱🇷', maxLength: 8 },
  { code: 'LY', name: 'Libya', dialCode: '+218', flag: '🇱🇾', maxLength: 9 },
  { code: 'LI', name: 'Liechtenstein', dialCode: '+423', flag: '🇱🇮', maxLength: 7 },
  { code: 'LT', name: 'Lithuania', dialCode: '+370', flag: '🇱🇹', maxLength: 8 },
  { code: 'LU', name: 'Luxembourg', dialCode: '+352', flag: '🇱🇺', maxLength: 9 },
  { code: 'MO', name: 'Macao', dialCode: '+853', flag: '🇲🇴', maxLength: 8 },
  { code: 'MK', name: 'Macedonia', dialCode: '+389', flag: '🇲🇰', maxLength: 8 },
  { code: 'MG', name: 'Madagascar', dialCode: '+261', flag: '🇲🇬', maxLength: 9 },
  { code: 'MW', name: 'Malawi', dialCode: '+265', flag: '🇲🇼', maxLength: 9 },
  { code: 'MY', name: 'Malaysia', dialCode: '+60', flag: '🇲🇾', maxLength: 10 },
  { code: 'MV', name: 'Maldives', dialCode: '+960', flag: '🇲🇻', maxLength: 7 },
  { code: 'ML', name: 'Mali', dialCode: '+223', flag: '🇲🇱', maxLength: 8 },
  { code: 'MT', name: 'Malta', dialCode: '+356', flag: '🇲🇹', maxLength: 8 },
  { code: 'MH', name: 'Marshall Islands', dialCode: '+692', flag: '🇲🇭', maxLength: 7 },
  { code: 'MR', name: 'Mauritania', dialCode: '+222', flag: '🇲🇷', maxLength: 8 },
  { code: 'MU', name: 'Mauritius', dialCode: '+230', flag: '🇲🇺', maxLength: 8 },
  { code: 'MX', name: 'Mexico', dialCode: '+52', flag: '🇲🇽', maxLength: 10 },
  { code: 'FM', name: 'Micronesia', dialCode: '+691', flag: '🇫🇲', maxLength: 7 },
  { code: 'MD', name: 'Moldova', dialCode: '+373', flag: '🇲🇩', maxLength: 8 },
  { code: 'MC', name: 'Monaco', dialCode: '+377', flag: '🇲🇨', maxLength: 8 },
  { code: 'MN', name: 'Mongolia', dialCode: '+976', flag: '🇲🇳', maxLength: 8 },
  { code: 'ME', name: 'Montenegro', dialCode: '+382', flag: '🇲🇪', maxLength: 8 },
  { code: 'MA', name: 'Morocco', dialCode: '+212', flag: '🇲🇦', maxLength: 9 },
  { code: 'MZ', name: 'Mozambique', dialCode: '+258', flag: '🇲🇿', maxLength: 9 },
  { code: 'MM', name: 'Myanmar', dialCode: '+95', flag: '🇲🇲', maxLength: 9 },
  { code: 'NA', name: 'Namibia', dialCode: '+264', flag: '🇳🇦', maxLength: 9 },
  { code: 'NR', name: 'Nauru', dialCode: '+674', flag: '🇳🇷', maxLength: 7 },
  { code: 'NP', name: 'Nepal', dialCode: '+977', flag: '🇳🇵', maxLength: 10 },
  { code: 'NL', name: 'Netherlands', dialCode: '+31', flag: '🇳🇱', maxLength: 9 },
  { code: 'NZ', name: 'New Zealand', dialCode: '+64', flag: '🇳🇿', maxLength: 10 },
  { code: 'NI', name: 'Nicaragua', dialCode: '+505', flag: '🇳🇮', maxLength: 8 },
  { code: 'NE', name: 'Niger', dialCode: '+227', flag: '🇳🇪', maxLength: 8 },
  { code: 'NG', name: 'Nigeria', dialCode: '+234', flag: '🇳🇬', maxLength: 10 },
  { code: 'KP', name: 'North Korea', dialCode: '+850', flag: '🇰🇵', maxLength: 10 },
  { code: 'NO', name: 'Norway', dialCode: '+47', flag: '🇳🇴', maxLength: 8 },
  { code: 'OM', name: 'Oman', dialCode: '+968', flag: '🇴🇲', maxLength: 8 },
  { code: 'PK', name: 'Pakistan', dialCode: '+92', flag: '🇵🇰', maxLength: 10 },
  { code: 'PW', name: 'Palau', dialCode: '+680', flag: '🇵🇼', maxLength: 7 },
  { code: 'PS', name: 'Palestine', dialCode: '+970', flag: '🇵🇸', maxLength: 9 },
  { code: 'PA', name: 'Panama', dialCode: '+507', flag: '🇵🇦', maxLength: 8 },
  { code: 'PG', name: 'Papua New Guinea', dialCode: '+675', flag: '🇵🇬', maxLength: 8 },
  { code: 'PY', name: 'Paraguay', dialCode: '+595', flag: '🇵🇾', maxLength: 9 },
  { code: 'PE', name: 'Peru', dialCode: '+51', flag: '🇵🇪', maxLength: 9 },
  { code: 'PH', name: 'Philippines', dialCode: '+63', flag: '🇵🇭', maxLength: 10 },
  { code: 'PL', name: 'Poland', dialCode: '+48', flag: '🇵🇱', maxLength: 9 },
  { code: 'PT', name: 'Portugal', dialCode: '+351', flag: '🇵🇹', maxLength: 9 },
  { code: 'PR', name: 'Puerto Rico', dialCode: '+1787', flag: '🇵🇷', maxLength: 10 },
  { code: 'QA', name: 'Qatar', dialCode: '+974', flag: '🇶🇦', maxLength: 8 },
  { code: 'RO', name: 'Romania', dialCode: '+40', flag: '🇷🇴', maxLength: 9 },
  { code: 'RU', name: 'Russia', dialCode: '+7', flag: '🇷🇺', maxLength: 10 },
  { code: 'RW', name: 'Rwanda', dialCode: '+250', flag: '🇷🇼', maxLength: 9 },
  { code: 'WS', name: 'Samoa', dialCode: '+685', flag: '🇼🇸', maxLength: 7 },
  { code: 'SM', name: 'San Marino', dialCode: '+378', flag: '🇸🇲', maxLength: 8 },
  { code: 'ST', name: 'Sao Tome and Principe', dialCode: '+239', flag: '🇸🇹', maxLength: 7 },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '+966', flag: '🇸🇦', maxLength: 9 },
  { code: 'SN', name: 'Senegal', dialCode: '+221', flag: '🇸🇳', maxLength: 9 },
  { code: 'RS', name: 'Serbia', dialCode: '+381', flag: '🇷🇸', maxLength: 9 },
  { code: 'SC', name: 'Seychelles', dialCode: '+248', flag: '🇸🇨', maxLength: 7 },
  { code: 'SL', name: 'Sierra Leone', dialCode: '+232', flag: '🇸🇱', maxLength: 8 },
  { code: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬', maxLength: 8 },
  { code: 'SK', name: 'Slovakia', dialCode: '+421', flag: '🇸🇰', maxLength: 9 },
  { code: 'SI', name: 'Slovenia', dialCode: '+386', flag: '🇸🇮', maxLength: 8 },
  { code: 'SB', name: 'Solomon Islands', dialCode: '+677', flag: '🇸🇧', maxLength: 7 },
  { code: 'SO', name: 'Somalia', dialCode: '+252', flag: '🇸🇴', maxLength: 8 },
  { code: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦', maxLength: 9 },
  { code: 'KR', name: 'South Korea', dialCode: '+82', flag: '🇰🇷', maxLength: 10 },
  { code: 'SS', name: 'South Sudan', dialCode: '+211', flag: '🇸🇸', maxLength: 9 },
  { code: 'ES', name: 'Spain', dialCode: '+34', flag: '🇪🇸', maxLength: 9 },
  { code: 'LK', name: 'Sri Lanka', dialCode: '+94', flag: '🇱🇰', maxLength: 9 },
  { code: 'SD', name: 'Sudan', dialCode: '+249', flag: '🇸🇩', maxLength: 9 },
  { code: 'SR', name: 'Suriname', dialCode: '+597', flag: '🇸🇷', maxLength: 7 },
  { code: 'SZ', name: 'Swaziland', dialCode: '+268', flag: '🇸🇿', maxLength: 8 },
  { code: 'SE', name: 'Sweden', dialCode: '+46', flag: '🇸🇪', maxLength: 9 },
  { code: 'CH', name: 'Switzerland', dialCode: '+41', flag: '🇨🇭', maxLength: 9 },
  { code: 'SY', name: 'Syria', dialCode: '+963', flag: '🇸🇾', maxLength: 9 },
  { code: 'TW', name: 'Taiwan', dialCode: '+886', flag: '🇹🇼', maxLength: 9 },
  { code: 'TJ', name: 'Tajikistan', dialCode: '+992', flag: '🇹🇯', maxLength: 9 },
  { code: 'TZ', name: 'Tanzania', dialCode: '+255', flag: '🇹🇿', maxLength: 9 },
  { code: 'TH', name: 'Thailand', dialCode: '+66', flag: '🇹🇭', maxLength: 9 },
  { code: 'TL', name: 'Timor-Leste', dialCode: '+670', flag: '🇹🇱', maxLength: 8 },
  { code: 'TG', name: 'Togo', dialCode: '+228', flag: '🇹🇬', maxLength: 8 },
  { code: 'TO', name: 'Tonga', dialCode: '+676', flag: '🇹🇴', maxLength: 7 },
  { code: 'TT', name: 'Trinidad and Tobago', dialCode: '+1868', flag: '🇹🇹', maxLength: 10 },
  { code: 'TN', name: 'Tunisia', dialCode: '+216', flag: '🇹🇳', maxLength: 8 },
  { code: 'TR', name: 'Turkey', dialCode: '+90', flag: '🇹🇷', maxLength: 10 },
  { code: 'TM', name: 'Turkmenistan', dialCode: '+993', flag: '🇹🇲', maxLength: 8 },
  { code: 'TV', name: 'Tuvalu', dialCode: '+688', flag: '🇹🇻', maxLength: 6 },
  { code: 'UG', name: 'Uganda', dialCode: '+256', flag: '🇺🇬', maxLength: 9 },
  { code: 'UA', name: 'Ukraine', dialCode: '+380', flag: '🇺🇦', maxLength: 9 },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪', maxLength: 9 },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧', maxLength: 10, format: 'XXXX XXXXXX' },
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸', maxLength: 10, minLength: 10, format: '(XXX) XXX-XXXX' },
  { code: 'UY', name: 'Uruguay', dialCode: '+598', flag: '🇺🇾', maxLength: 8 },
  { code: 'UZ', name: 'Uzbekistan', dialCode: '+998', flag: '🇺🇿', maxLength: 9 },
  { code: 'VU', name: 'Vanuatu', dialCode: '+678', flag: '🇻🇺', maxLength: 7 },
  { code: 'VA', name: 'Vatican City', dialCode: '+379', flag: '🇻🇦', maxLength: 8 },
  { code: 'VE', name: 'Venezuela', dialCode: '+58', flag: '🇻🇪', maxLength: 10 },
  { code: 'VN', name: 'Vietnam', dialCode: '+84', flag: '🇻🇳', maxLength: 9 },
  { code: 'YE', name: 'Yemen', dialCode: '+967', flag: '🇾🇪', maxLength: 9 },
  { code: 'ZM', name: 'Zambia', dialCode: '+260', flag: '🇿🇲', maxLength: 9 },
  { code: 'ZW', name: 'Zimbabwe', dialCode: '+263', flag: '🇿🇼', maxLength: 9 }
];

/**
 * Get country by ISO code
 */
export const getCountryByCode = (code: string): CountryPhoneCode | undefined => {
  return countryPhoneCodes.find(country => country.code === code.toUpperCase());
};

/**
 * Get country by dial code
 */
export const getCountryByDialCode = (dialCode: string): CountryPhoneCode | undefined => {
  return countryPhoneCodes.find(country => country.dialCode === dialCode);
};

/**
 * Get default country based on user's locale or timezone
 */
export const getDefaultCountry = (): CountryPhoneCode => {
  // Try to get user's locale
  const locale = navigator.language || 'en-US';
  const countryCode = locale.split('-')[1] || 'US';

  return getCountryByCode(countryCode) || countryPhoneCodes.find(c => c.code === 'US')!;
};

/**
 * Format phone number based on country format
 */
export const formatPhoneNumber = (phoneNumber: string, countryCode: string): string => {
  const country = getCountryByCode(countryCode);
  if (!country || !country.format) return phoneNumber;

  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, '');

  // Apply format if available
  // This is a simplified formatter - you might want to use a library like libphonenumber for production
  return digits;
};

/**
 * Validate phone number length
 */
export const validatePhoneNumber = (phoneNumber: string, countryCode: string): boolean => {
  const country = getCountryByCode(countryCode);
  if (!country) return true; // Allow if country not found

  const digits = phoneNumber.replace(/\D/g, '');
  const maxLength = country.maxLength || 15; // Default max length
  const minLength = country.minLength || Math.max(6, maxLength - 3); // Use country minLength or derive from maxLength

  return digits.length <= maxLength && digits.length >= minLength;
};

/**
 * Get minimum phone length for a country
 */
export const getMinPhoneLength = (countryCode: string): number => {
  const country = getCountryByCode(countryCode);
  if (!country) return 6;
  return country.minLength || Math.max(6, (country.maxLength || 10) - 3);
};

/**
 * Get full phone number with country code
 */
export const getFullPhoneNumber = (countryDialCode: string, phoneNumber: string): string => {
  // Remove any leading zeros from phone number
  const cleanedNumber = phoneNumber.replace(/^0+/, '');
  return `${countryDialCode}${cleanedNumber}`;
};