import React, { useState } from 'react';
import { FaCreditCard, FaInfoCircle, FaCheckCircle } from 'react-icons/fa';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// Check if we're in test mode
const isTestMode = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_test_');

interface PaymentFormProps {
  clientSecret: string;
  bookingId: number;
  amount: number;
  onSuccess: () => void;
  onError: (error: string) => void;
}

function PaymentForm({ clientSecret, bookingId, amount, onSuccess, onError }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const cardElement = elements.getElement(CardElement);

    if (!cardElement) {
      const error = 'Card element not found';
      setErrorMessage(error);
      onError(error);
      setLoading(false);
      return;
    }

    try {
      // Confirm the payment (this authorizes the charge)
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            // Add billing details if you have them from the booking
          }
        }
      });

      if (result.error) {
        const error = result.error.message || 'Payment failed';
        setErrorMessage(error);
        onError(error);
      } else {
        if (result.paymentIntent.status === 'requires_capture') {
          // Payment authorized successfully!
          onSuccess();
        } else if (result.paymentIntent.status === 'succeeded') {
          // Payment succeeded (in case capture_method is not manual)
          onSuccess();
        } else {
          const error = `Unexpected payment status: ${result.paymentIntent.status}`;
          setErrorMessage(error);
          onError(error);
        }
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Payment failed';
      setErrorMessage(errorMsg);
      onError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Test Mode - Simple */}
      {isTestMode && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm text-yellow-800">
            <strong>🧪 Test Mode:</strong> Use card <span className="font-mono font-bold">4242 4242 4242 4242</span>
          </p>
        </div>
      )}

      {/* Card Input Field */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Card Details
        </label>

        {/* Stripe Card Element */}
        <div className="border-2 border-gray-300 rounded-lg px-4 py-3 bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#1f2937',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  '::placeholder': {
                    color: '#9ca3af',
                  },
                },
                invalid: {
                  color: '#dc2626',
                },
              },
              hidePostalCode: true,  // Remove ZIP requirement
            }}
          />
        </div>
      </div>

      {/* Amount - Simple */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex justify-between items-center">
          <span className="text-gray-700">Amount:</span>
          <span className="text-2xl font-bold text-gray-900">${amount.toFixed(2)}</span>
        </div>
        <p className="text-xs text-blue-800 mt-2">
          💡 Authorized now, charged after meeting
        </p>
      </div>

      {/* Error Message - Simple */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">{errorMessage}</p>
        </div>
      )}

      {/* Submit Button - Simple */}
      <button 
        type="submit" 
        disabled={!stripe || loading}
        className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-all ${
          !stripe || loading
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {loading ? (
          <span className="flex items-center justify-center">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing...
          </span>
        ) : (
          `Authorize $${amount.toFixed(2)}`
        )}
      </button>

      {/* Security - Simple */}
      <p className="text-xs text-gray-500 text-center">
        🔒 Secured by Stripe
      </p>
    </form>
  );
}

export default function StripePaymentForm(props: PaymentFormProps) {
  if (!stripePromise) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-sm text-red-800">
          Stripe is not configured. Please contact support.
        </p>
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <PaymentForm {...props} />
    </Elements>
  );
}

