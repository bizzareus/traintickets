import { useMutation } from '@tanstack/react-query';
import { useState, useCallback, useRef, useEffect } from 'react';
import type { CreateQrPaymentInput, QrPaymentResult, PaymentStatusResult } from '@/types';

interface UseChartAlertPaymentReturn {
  qrCodeId: string | null;
  qrImage: string | null;
  status: 'idle' | 'loading' | 'pending' | 'paid' | 'failed' | 'expired';
  isLoading: boolean;
  error: string | null;
  initiatePayment: (input: CreateQrPaymentInput) => void;
  reset: () => void;
}

export function useChartAlertPayment(): UseChartAlertPaymentReturn {
  const [qrCodeId, setQrCodeId] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'pending' | 'paid' | 'failed' | 'expired'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);
  const currentQrCodeIdRef = useRef<string | null>(null);

  const createPaymentMutation = useMutation<QrPaymentResult, Error, CreateQrPaymentInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/razorpay/qr-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create payment');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setQrCodeId(data.qr_code_id);
      setQrImage(data.qr_image);
      currentQrCodeIdRef.current = data.qr_code_id;
      setStatus('pending');
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
      setStatus('failed');
      setIsLoading(false);
    },
  });

  const checkPaymentStatus = useCallback(async (id: string): Promise<PaymentStatusResult> => {
    const res = await fetch(`/api/razorpay/payment-status/${id}`);
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || 'Failed to fetch payment status');
    }
    return res.json();
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    isPollingRef.current = false;
  }, []);

  const startPolling = useCallback((id: string) => {
    stopPolling();
    isPollingRef.current = true;
    currentQrCodeIdRef.current = id;

    const poll = async () => {
      if (!isPollingRef.current) return;
      try {
        const data = await checkPaymentStatus(id);
        if (data.status === 'paid') {
          setStatus('paid');
          stopPolling();
        } else if (data.status === 'failed' || data.status === 'refunded') {
          setStatus('failed');
          stopPolling();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to check payment status');
        setStatus('failed');
        stopPolling();
      }
    };

    const interval = setInterval(poll, 3000);
    pollingIntervalRef.current = interval;
    poll();
  }, [checkPaymentStatus, stopPolling]);

  // Auto-start polling when QR code is created (status becomes 'pending')
  useEffect(() => {
    if (status === 'pending' && qrCodeId && !isPollingRef.current) {
      startPolling(qrCodeId);
    }
  }, [status, qrCodeId, startPolling]);

  // Handle payment completion cleanup
  useEffect(() => {
    if (status === 'paid' || status === 'failed') {
      stopPolling();
    }
  }, [status, stopPolling]);

  const initiatePayment = useCallback((input: CreateQrPaymentInput) => {
    setIsLoading(true);
    setError(null);
    createPaymentMutation.mutate(input);
  }, [createPaymentMutation]);

  const reset = useCallback(() => {
    stopPolling();
    setQrCodeId(null);
    setQrImage(null);
    setStatus('idle');
    setError(null);
    setIsLoading(false);
    currentQrCodeIdRef.current = null;
  }, [stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    qrCodeId,
    qrImage,
    status,
    isLoading: isLoading || createPaymentMutation.isPending,
    error,
    initiatePayment,
    reset,
  };
}