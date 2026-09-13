import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { CreateQrPaymentInput } from '@/types';
import { useChartAlertPayment } from '@/lib/hooks/useChartAlertPayment';

interface RazorpayQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  journeyData: CreateQrPaymentInput;
}

export function RazorpayQrModal({ isOpen, onClose, onSuccess, journeyData }: RazorpayQrModalProps) {
  const { qrImage, status, isLoading, error, initiatePayment, reset } = useChartAlertPayment();

  // Start payment when modal opens
  useEffect(() => {
    if (isOpen) {
      initiatePayment(journeyData);
    }
  }, [isOpen, initiatePayment, journeyData]);

  // Handle payment success
  useEffect(() => {
    if (status === 'paid') {
      reset();
      onSuccess();
    }
  }, [status, onSuccess, reset]);

  // Handle close
  const handleClose = () => {
    reset();
    onClose();
  };

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const renderContent = () => {
    if (isLoading && status === 'loading') {
      return (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-sm text-gray-600">Creating payment...</p>
        </div>
      );
    }

    if (status === 'paid') {
      return (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-full">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <p className="mt-4 text-sm text-gray-600">Payment successful!</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-8">
          <p className="text-sm text-red-600">Error: {error}</p>
          <button
            onClick={() => initiatePayment(journeyData)}
            className="mt-4 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      );
    }

    if (status === 'pending' && qrImage) {
      return (
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            {qrImage.startsWith('data:image') ? (
              <img src={qrImage} alt="UPI QR Code" className="w-48 h-48" />
            ) : (
              <iframe src={qrImage} title="Razorpay Payment" className="w-48 h-48 border rounded" />
            )}
          </div>
          <p className="mt-4 text-sm text-gray-600">
            Scan the QR code to pay ₹5.00 and register your chart alert.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Payment will be verified automatically.
          </p>
        </div>
      );
    }

    if (status === 'failed') {
      return (
        <div className="text-center py-8">
          <p className="text-sm text-red-600">Payment failed or expired</p>
        </div>
      );
    }

    return null;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget && status !== 'paid') handleClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-96 max-w-md mx-4">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-lg">Pay for Chart Alert</h3>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700"
            disabled={status === 'paid' || isLoading}
          >
            ✕
          </button>
        </div>
        <div className="p-6">{renderContent()}</div>
        {status === 'paid' && (
          <div className="p-4 border-t flex justify-end">
            <button
              onClick={onSuccess}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Continue
            </button>
          </div>
        )}
        {(status === 'failed' || error) && (
          <div className="p-4 border-t flex justify-end">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}