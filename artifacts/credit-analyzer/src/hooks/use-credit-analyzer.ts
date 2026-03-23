import { useState, useCallback, useEffect } from 'react';
import { 
  useUploadCreditFiles, 
  useAnalyzeSession, 
  useGetSession,
  type AnalysisResult
} from '@workspace/api-client-react';

export type AppStep = 'idle' | 'uploading' | 'processing' | 'completed' | 'error';

export function useCreditAnalyzer() {
  const [step, setStep] = useState<AppStep>('idle');
  const [files, setFiles] = useState<File[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const uploadMutation = useUploadCreditFiles({
    mutation: {
      onSuccess: (data) => {
        setSessionId(data.sessionId);
        setStep('processing');
        // Immediately trigger analysis after successful upload
        analyzeMutation.mutate({ sessionId: data.sessionId });
      },
      onError: (err) => {
        setStep('error');
        setErrorMessage(err?.message || 'Ошибка при загрузке файлов.');
      }
    }
  });

  const analyzeMutation = useAnalyzeSession({
    mutation: {
      onError: (err) => {
        setStep('error');
        setErrorMessage(err?.message || 'Ошибка при запуске анализа.');
      }
    }
  });

  // Polling session status
  const { data: sessionStatus } = useGetSession(sessionId || '', {
    query: {
      enabled: !!sessionId && (step === 'processing' || step === 'uploading'),
      refetchInterval: (query) => {
        // Stop polling if completed or failed
        const status = query.state?.data?.status;
        if (status === 'completed' || status === 'failed') return false;
        return 2000; // Poll every 2s
      },
    }
  });

  // Handle status updates from polling
  useEffect(() => {
    if (!sessionStatus) return;

    if (sessionStatus.status === 'completed') {
      setStep('completed');
    } else if (sessionStatus.status === 'failed') {
      setStep('error');
      setErrorMessage(sessionStatus.errorMessage || 'Произошла ошибка при обработке отчетов.');
    }
  }, [sessionStatus]);

  const handleStartAnalysis = useCallback(() => {
    if (files.length === 0) return;
    setStep('uploading');
    setErrorMessage(null);
    
    // Cast files array to Blob[] as required by the OpenAPI client
    uploadMutation.mutate({ data: { files: files as Blob[] } });
  }, [files, uploadMutation]);

  const handleDownloadReport = useCallback(async () => {
    if (!sessionId) return;
    try {
      const response = await fetch(`/api/analysis/sessions/${sessionId}/report`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get('Content-Type') || '';
      const isPdf = contentType.includes('pdf');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `credit-report-${sessionId.substring(0, 8)}.${isPdf ? 'pdf' : 'html'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download report', err);
    }
  }, [sessionId]);

  const reset = useCallback(() => {
    setStep('idle');
    setFiles([]);
    setSessionId(null);
    setErrorMessage(null);
  }, []);

  return {
    step,
    files,
    setFiles,
    sessionId,
    errorMessage,
    analysisResult: sessionStatus?.analysisResult,
    handleStartAnalysis,
    handleDownloadReport,
    reset,
    isUploading: uploadMutation.isPending,
  };
}
