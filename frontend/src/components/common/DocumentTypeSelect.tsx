import React from 'react';

interface DocumentTypeSelectProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  error?: string;
  className?: string;
  disabled?: boolean;
}

interface DocumentType {
  value: string;
  label: string;
  description: string;
  icon: string;
}

const DOCUMENT_TYPES: DocumentType[] = [
  {
    value: 'passport',
    label: 'Passport',
    description: 'International travel document',
    icon: '🛂'
  },
  {
    value: 'drivers_license',
    label: "Driver's License",
    description: 'National or state-issued driving permit',
    icon: '🚗'
  },
  {
    value: 'id_card',
    label: 'National ID Card',
    description: 'Government-issued identification card',
    icon: '🪪'
  },
  {
    value: 'residence_permit',
    label: 'Residence Permit',
    description: 'Document allowing residency in a country',
    icon: '🏠'
  }
];

/**
 * DocumentTypeSelect Component
 * 
 * Dropdown for selecting identity document type.
 * Used for Veriff verification field collection.
 */
const DocumentTypeSelect: React.FC<DocumentTypeSelectProps> = ({
  value,
  onChange,
  label = 'Document Type',
  required = false,
  error,
  className = '',
  disabled = false
}) => {
  const selectedDoc = DOCUMENT_TYPES.find(doc => doc.value === value);

  return (
    <div className={`document-type-select-container ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* Simple select for mobile, custom grid for desktop */}
      <div className="md:hidden">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`
            w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent
            ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
            ${error ? 'border-red-500' : 'border-gray-300'}
          `}
        >
          <option value="">Select document type...</option>
          {DOCUMENT_TYPES.map((doc) => (
            <option key={doc.value} value={doc.value}>
              {doc.icon} {doc.label}
            </option>
          ))}
        </select>
      </div>

      {/* Grid layout for desktop */}
      <div className="hidden md:grid md:grid-cols-2 gap-3">
        {DOCUMENT_TYPES.map((doc) => (
          <button
            key={doc.value}
            type="button"
            onClick={() => !disabled && onChange(doc.value)}
            disabled={disabled}
            className={`
              p-4 border-2 rounded-lg text-left transition-all
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-blue-400'}
              ${
                value === doc.value
                  ? 'border-blue-500 bg-blue-50'
                  : error
                  ? 'border-red-300 bg-white'
                  : 'border-gray-300 bg-white'
              }
            `}
          >
            <div className="flex items-start space-x-3">
              <span className="text-2xl">{doc.icon}</span>
              <div className="flex-1">
                <div className="font-medium text-gray-900">{doc.label}</div>
                <div className="text-sm text-gray-500 mt-1">{doc.description}</div>
              </div>
              {value === doc.value && (
                <svg
                  className="w-5 h-5 text-blue-500 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </div>
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}

      {selectedDoc && !error && (
        <p className="mt-2 text-sm text-gray-600">
          Selected: {selectedDoc.label}
        </p>
      )}
    </div>
  );
};

export default DocumentTypeSelect;
export { DOCUMENT_TYPES };

