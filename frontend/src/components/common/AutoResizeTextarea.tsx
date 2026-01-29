/**
 * Auto-Resizing Textarea Component
 * Automatically adjusts height based on content
 */

import React, { useEffect, useRef, type TextareaHTMLAttributes } from 'react';

interface AutoResizeTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  minRows?: number;
  maxRows?: number;
  className?: string;
}

const AutoResizeTextarea: React.FC<AutoResizeTextareaProps> = ({
  value,
  onChange,
  minRows = 3,
  maxRows = 10,
  className = '',
  ...props
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Calculate and set the textarea height
  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';

    // Calculate line height (approximate)
    const lineHeight = parseInt(window.getComputedStyle(textarea).lineHeight) || 24;

    // Calculate min and max heights based on rows
    const minHeight = lineHeight * minRows;
    const maxHeight = lineHeight * maxRows;

    // Calculate new height based on scrollHeight
    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);

    // Set the new height
    textarea.style.height = `${newHeight}px`;

    // Add or remove overflow based on whether we've hit max height
    if (textarea.scrollHeight > maxHeight) {
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.overflowY = 'hidden';
    }
  };

  // Adjust height on mount and when value changes
  useEffect(() => {
    adjustHeight();
  }, [value]);

  // Also adjust on window resize
  useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle change with height adjustment
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e);
    adjustHeight();
  };

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={handleChange}
      className={`resize-none transition-all duration-150 ${className}`}
      style={{
        minHeight: `${(parseInt(window.getComputedStyle(document.body).lineHeight) || 24) * minRows}px`,
        overflowY: 'hidden'
      }}
      {...props}
    />
  );
};

export default AutoResizeTextarea;