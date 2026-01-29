import React, { useState } from 'react';
import { X, Star, Camera, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useModalRegistration } from '../../context/ModalContext';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: number;
  companionName: string;
  companionPhoto?: string;
  onSubmit: (review: {
    rating: number;
    comment: string;
    photos?: File[];
  }) => Promise<void>;
}

const ReviewModal: React.FC<ReviewModalProps> = ({
  isOpen,
  onClose,
  bookingId,
  companionName,
  companionPhoto,
  onSubmit
}) => {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Register modal with global modal context (handles scroll prevention automatically)
  useModalRegistration('review-modal', isOpen);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} is too large. Max size is 5MB`);
        return false;
      }
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image`);
        return false;
      }
      return true;
    });

    if (photos.length + validFiles.length > 3) {
      toast.error('You can upload a maximum of 3 photos');
      return;
    }

    setPhotos(prev => [...prev, ...validFiles]);

    // Create preview URLs
    validFiles.forEach(file => {
      const url = URL.createObjectURL(file);
      setPhotoPreviewUrls(prev => [...prev, url]);
    });
  };

  const removePhoto = (index: number) => {
    URL.revokeObjectURL(photoPreviewUrls[index]);
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error('Please select a rating');
      return;
    }

    // Comment is now optional - only validate if provided
    if (comment.trim().length > 0 && comment.trim().length < 10) {
      toast.error('Review must be at least 10 characters if provided');
      return;
    }

    if (comment.length > 500) {
      toast.error('Review must be less than 500 characters');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        rating,
        comment: comment.trim(), // Always send string (empty string if no comment)
        photos: photos.length > 0 ? photos : undefined
      });
      setIsSuccess(true);
      setTimeout(() => {
        onClose();
        // Reset state after closing
        setRating(0);
        setComment('');
        setPhotos([]);
        setPhotoPreviewUrls([]);
        setIsSuccess(false);
      }, 2000);
    } catch (error) {
      console.error('Error submitting review:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const getRatingLabel = (rating: number) => {
    const labels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
    return labels[rating] || '';
  };

  const displayRating = hoveredRating || rating;

  if (isSuccess) {
    return (
      <div 
        className="fixed inset-0 bg-black/30 backdrop-blur-md flex items-center justify-center z-[60] p-4"
        onClick={onClose}
      >
        <div 
          className="bg-white rounded-lg max-w-md w-full p-6 text-center shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Review Submitted!
          </h3>
          <p className="text-gray-600">
            Thank you for sharing your experience
          </p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 bg-black/30 backdrop-blur-md flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-lg sticky top-0 z-10 flex-shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Leave a Review</h2>
            <p className="text-sm text-gray-600 mt-1">Share your experience with {companionName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1 overscroll-contain">
          {/* Companion Info */}
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
            {companionPhoto ? (
              <img
                src={companionPhoto}
                alt={companionName}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#f0effe] flex items-center justify-center">
                <span className="text-[#312E81] font-semibold">
                  {companionName.charAt(0)}
                </span>
              </div>
            )}
            <div>
              <p className="font-medium text-gray-900">{companionName}</p>
              <p className="text-sm text-gray-600">Booking #{bookingId}</p>
            </div>
          </div>

          {/* Rating */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              How was your experience?
            </label>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoveredRating(star)}
                    onMouseLeave={() => setHoveredRating(0)}
                    className="p-1 transition-transform hover:scale-110"
                  >
                    <Star
                      className={`h-8 w-8 ${
                        star <= displayRating
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'fill-none text-gray-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
              {displayRating > 0 && (
                <span className="ml-2 text-sm font-medium text-gray-700">
                  {getRatingLabel(displayRating)}
                </span>
              )}
            </div>
          </div>

          {/* Comment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tell us more about your experience
              <span className="text-gray-500 font-normal ml-1">(Optional, 10-500 characters)</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={500}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-[#312E81] resize-none"
              placeholder="What did you enjoy about your time with this companion? Were they professional, friendly, and engaging?"
            />
            <div className="flex justify-between items-center mt-2">
              <p className="text-xs text-gray-500">
                {comment.length}/500 characters
              </p>
              {comment.trim().length > 0 && comment.trim().length < 10 && (
                <p className="text-xs text-red-500">
                  Minimum 10 characters if provided
                </p>
              )}
            </div>
          </div>

          {/* Photo Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Add Photos
              <span className="text-gray-500 font-normal ml-1">(Optional, max 3)</span>
            </label>

            {/* Photo Previews */}
            {photoPreviewUrls.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {photoPreviewUrls.map((url, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={url}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg"
                    />
                    <button
                      onClick={() => removePhoto(index)}
                      className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {photos.length < 3 && (
              <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#4A47A3] transition-colors">
                <Camera className="h-5 w-5 text-gray-400" />
                <span className="text-sm text-gray-600">
                  Click to upload photos
                </span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Guidelines */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">Review Guidelines</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Be honest and respectful in your feedback</li>
              <li>• Focus on your personal experience</li>
              <li>• Don't share personal or sensitive information</li>
              <li>• Keep it appropriate and professional</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t px-6 py-4 flex gap-3 flex-shrink-0 rounded-b-lg">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || rating === 0}
            className="flex-1 px-4 py-2 bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Review'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReviewModal;