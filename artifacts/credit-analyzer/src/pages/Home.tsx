import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { useCreditAnalyzer } from '@/hooks/use-credit-analyzer';
import { FileUpload } from '@/components/FileUpload';
import { ProgressStep } from '@/components/ProgressStep';
import { ResultsDashboard } from '@/components/ResultsDashboard';

export default function Home() {
  const { 
    step, 
    files, 
    setFiles, 
    errorMessage, 
    analysisResult, 
    handleStartAnalysis, 
    handleDownloadReport, 
    reset 
  } = useCreditAnalyzer();

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden selection:bg-primary/20 selection:text-primary font-sans">
      
      {/* Abstract Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 flex items-start justify-center opacity-70">
        <img 
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
          alt="" 
          className="absolute w-full h-[80vh] object-cover opacity-20 dark:opacity-10 mask-image-gradient"
          style={{ maskImage: 'linear-gradient(to bottom, black 0%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 0%, transparent 100%)' }}
        />
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute top-[10%] right-[-10%] w-[40%] h-[40%] bg-accent/10 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={reset}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white shadow-lg shadow-primary/20">
              <span className="font-display font-bold text-xl tracking-tighter">CA</span>
            </div>
            <span className="font-display font-bold text-xl hidden sm:block tracking-tight text-foreground">
              CreditAnalyzer <span className="text-primary">AI</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-24">
        
        {errorMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-3xl mx-auto mb-8 bg-destructive/10 border-l-4 border-destructive text-destructive p-4 rounded-r-xl flex items-start gap-3 shadow-sm"
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold">Ошибка</h3>
              <p className="text-sm mt-1 opacity-90">{errorMessage}</p>
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          
          {(step === 'idle' || step === 'error') && (
            <motion.div 
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.4 }}
              className="w-full flex flex-col items-center pt-10"
            >
              <div className="text-center max-w-2xl mx-auto mb-12">
                <h1 className="text-4xl md:text-6xl font-display font-bold text-foreground mb-6 leading-tight tracking-tight">
                  Ваша кредитная история. <br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Идеально понятна.</span>
                </h1>
                <p className="text-lg text-muted-foreground">
                  Загрузите отчеты из разных бюро (НБКИ, ОКБ, Скоринг Бюро). 
                  Наш AI объединит их, оценит рейтинг и даст пошаговые рекомендации по улучшению.
                </p>
              </div>

              <FileUpload 
                files={files} 
                setFiles={setFiles} 
                onAnalyze={handleStartAnalysis} 
                isLoading={false}
              />
            </motion.div>
          )}

          {(step === 'uploading' || step === 'processing') && (
            <motion.div 
              key="processing"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.5 }}
              className="w-full min-h-[50vh] flex items-center justify-center"
            >
              <ProgressStep />
            </motion.div>
          )}

          {step === 'completed' && analysisResult && (
            <motion.div 
              key="results"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="w-full"
            >
              <ResultsDashboard 
                result={analysisResult} 
                onDownload={handleDownloadReport}
                onReset={reset}
              />
            </motion.div>
          )}

        </AnimatePresence>
      </main>

    </div>
  );
}
