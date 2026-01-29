/**
 * Location Data for Countries and States
 */

export interface Country {
  code: string;
  name: string;
}

export interface StateProvince {
  name: string;
  abbreviation?: string;
}

export interface CountryStates {
  [countryCode: string]: StateProvince[];
}

export const countries: Country[] = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'IN', name: 'India' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'MX', name: 'Mexico' },
  { code: 'BR', name: 'Brazil' },
  { code: 'JP', name: 'Japan' },
  { code: 'CN', name: 'China' },
  { code: 'KR', name: 'South Korea' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'BE', name: 'Belgium' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'AT', name: 'Austria' },
  { code: 'PL', name: 'Poland' },
  { code: 'RU', name: 'Russia' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'SG', name: 'Singapore' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'TH', name: 'Thailand' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'PH', name: 'Philippines' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'IL', name: 'Israel' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'EG', name: 'Egypt' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'KE', name: 'Kenya' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' },
  { code: 'PE', name: 'Peru' },
  { code: 'VE', name: 'Venezuela' },
  { code: 'PT', name: 'Portugal' },
  { code: 'GR', name: 'Greece' },
  { code: 'TR', name: 'Turkey' },
  { code: 'IE', name: 'Ireland' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'HU', name: 'Hungary' },
  { code: 'RO', name: 'Romania' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'HR', name: 'Croatia' },
  { code: 'RS', name: 'Serbia' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LV', name: 'Latvia' },
  { code: 'EE', name: 'Estonia' },
  { code: 'IS', name: 'Iceland' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MT', name: 'Malta' },
  { code: 'CY', name: 'Cyprus' },
].sort((a, b) => a.name.localeCompare(b.name));

export const statesByCountry: CountryStates = {
  US: [
    { name: 'Alabama', abbreviation: 'AL' },
    { name: 'Alaska', abbreviation: 'AK' },
    { name: 'Arizona', abbreviation: 'AZ' },
    { name: 'Arkansas', abbreviation: 'AR' },
    { name: 'California', abbreviation: 'CA' },
    { name: 'Colorado', abbreviation: 'CO' },
    { name: 'Connecticut', abbreviation: 'CT' },
    { name: 'Delaware', abbreviation: 'DE' },
    { name: 'Florida', abbreviation: 'FL' },
    { name: 'Georgia', abbreviation: 'GA' },
    { name: 'Hawaii', abbreviation: 'HI' },
    { name: 'Idaho', abbreviation: 'ID' },
    { name: 'Illinois', abbreviation: 'IL' },
    { name: 'Indiana', abbreviation: 'IN' },
    { name: 'Iowa', abbreviation: 'IA' },
    { name: 'Kansas', abbreviation: 'KS' },
    { name: 'Kentucky', abbreviation: 'KY' },
    { name: 'Louisiana', abbreviation: 'LA' },
    { name: 'Maine', abbreviation: 'ME' },
    { name: 'Maryland', abbreviation: 'MD' },
    { name: 'Massachusetts', abbreviation: 'MA' },
    { name: 'Michigan', abbreviation: 'MI' },
    { name: 'Minnesota', abbreviation: 'MN' },
    { name: 'Mississippi', abbreviation: 'MS' },
    { name: 'Missouri', abbreviation: 'MO' },
    { name: 'Montana', abbreviation: 'MT' },
    { name: 'Nebraska', abbreviation: 'NE' },
    { name: 'Nevada', abbreviation: 'NV' },
    { name: 'New Hampshire', abbreviation: 'NH' },
    { name: 'New Jersey', abbreviation: 'NJ' },
    { name: 'New Mexico', abbreviation: 'NM' },
    { name: 'New York', abbreviation: 'NY' },
    { name: 'North Carolina', abbreviation: 'NC' },
    { name: 'North Dakota', abbreviation: 'ND' },
    { name: 'Ohio', abbreviation: 'OH' },
    { name: 'Oklahoma', abbreviation: 'OK' },
    { name: 'Oregon', abbreviation: 'OR' },
    { name: 'Pennsylvania', abbreviation: 'PA' },
    { name: 'Rhode Island', abbreviation: 'RI' },
    { name: 'South Carolina', abbreviation: 'SC' },
    { name: 'South Dakota', abbreviation: 'SD' },
    { name: 'Tennessee', abbreviation: 'TN' },
    { name: 'Texas', abbreviation: 'TX' },
    { name: 'Utah', abbreviation: 'UT' },
    { name: 'Vermont', abbreviation: 'VT' },
    { name: 'Virginia', abbreviation: 'VA' },
    { name: 'Washington', abbreviation: 'WA' },
    { name: 'West Virginia', abbreviation: 'WV' },
    { name: 'Wisconsin', abbreviation: 'WI' },
    { name: 'Wyoming', abbreviation: 'WY' },
    { name: 'District of Columbia', abbreviation: 'DC' }
  ],
  CA: [
    { name: 'Alberta', abbreviation: 'AB' },
    { name: 'British Columbia', abbreviation: 'BC' },
    { name: 'Manitoba', abbreviation: 'MB' },
    { name: 'New Brunswick', abbreviation: 'NB' },
    { name: 'Newfoundland and Labrador', abbreviation: 'NL' },
    { name: 'Northwest Territories', abbreviation: 'NT' },
    { name: 'Nova Scotia', abbreviation: 'NS' },
    { name: 'Nunavut', abbreviation: 'NU' },
    { name: 'Ontario', abbreviation: 'ON' },
    { name: 'Prince Edward Island', abbreviation: 'PE' },
    { name: 'Quebec', abbreviation: 'QC' },
    { name: 'Saskatchewan', abbreviation: 'SK' },
    { name: 'Yukon', abbreviation: 'YT' }
  ],
  GB: [
    { name: 'England' },
    { name: 'Northern Ireland' },
    { name: 'Scotland' },
    { name: 'Wales' }
  ],
  AU: [
    { name: 'Australian Capital Territory', abbreviation: 'ACT' },
    { name: 'New South Wales', abbreviation: 'NSW' },
    { name: 'Northern Territory', abbreviation: 'NT' },
    { name: 'Queensland', abbreviation: 'QLD' },
    { name: 'South Australia', abbreviation: 'SA' },
    { name: 'Tasmania', abbreviation: 'TAS' },
    { name: 'Victoria', abbreviation: 'VIC' },
    { name: 'Western Australia', abbreviation: 'WA' }
  ],
  IN: [
    { name: 'Andhra Pradesh' },
    { name: 'Arunachal Pradesh' },
    { name: 'Assam' },
    { name: 'Bihar' },
    { name: 'Chhattisgarh' },
    { name: 'Goa' },
    { name: 'Gujarat' },
    { name: 'Haryana' },
    { name: 'Himachal Pradesh' },
    { name: 'Jharkhand' },
    { name: 'Karnataka' },
    { name: 'Kerala' },
    { name: 'Madhya Pradesh' },
    { name: 'Maharashtra' },
    { name: 'Manipur' },
    { name: 'Meghalaya' },
    { name: 'Mizoram' },
    { name: 'Nagaland' },
    { name: 'Odisha' },
    { name: 'Punjab' },
    { name: 'Rajasthan' },
    { name: 'Sikkim' },
    { name: 'Tamil Nadu' },
    { name: 'Telangana' },
    { name: 'Tripura' },
    { name: 'Uttar Pradesh' },
    { name: 'Uttarakhand' },
    { name: 'West Bengal' },
    { name: 'Andaman and Nicobar Islands' },
    { name: 'Chandigarh' },
    { name: 'Dadra and Nagar Haveli and Daman and Diu' },
    { name: 'Delhi' },
    { name: 'Jammu and Kashmir' },
    { name: 'Ladakh' },
    { name: 'Lakshadweep' },
    { name: 'Puducherry' }
  ],
  DE: [
    { name: 'Baden-Württemberg' },
    { name: 'Bavaria' },
    { name: 'Berlin' },
    { name: 'Brandenburg' },
    { name: 'Bremen' },
    { name: 'Hamburg' },
    { name: 'Hesse' },
    { name: 'Lower Saxony' },
    { name: 'Mecklenburg-Western Pomerania' },
    { name: 'North Rhine-Westphalia' },
    { name: 'Rhineland-Palatinate' },
    { name: 'Saarland' },
    { name: 'Saxony' },
    { name: 'Saxony-Anhalt' },
    { name: 'Schleswig-Holstein' },
    { name: 'Thuringia' }
  ],
  FR: [
    { name: 'Auvergne-Rhône-Alpes' },
    { name: 'Bourgogne-Franche-Comté' },
    { name: 'Brittany' },
    { name: 'Centre-Val de Loire' },
    { name: 'Corsica' },
    { name: 'Grand Est' },
    { name: 'Hauts-de-France' },
    { name: 'Île-de-France' },
    { name: 'Normandy' },
    { name: 'Nouvelle-Aquitaine' },
    { name: 'Occitanie' },
    { name: 'Pays de la Loire' },
    { name: 'Provence-Alpes-Côte d\'Azur' }
  ]
};

// Helper function to get states for a country
export const getStatesForCountry = (countryCode: string): StateProvince[] => {
  return statesByCountry[countryCode] || [];
};

// Helper function to validate if a state belongs to a country
export const isValidStateForCountry = (countryCode: string, stateName: string): boolean => {
  const states = getStatesForCountry(countryCode);
  return states.some(state => state.name === stateName || state.abbreviation === stateName);
};

// Helper function to get country name by code
export const getCountryByCode = (code: string): Country | undefined => {
  return countries.find(country => country.code === code);
};