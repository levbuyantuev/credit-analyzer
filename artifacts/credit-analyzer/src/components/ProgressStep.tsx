import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Database, BrainCircuit, FileSearch, Sparkles } from 'lucide-react';

const STEPS = [
  { icon: FileSearch, text: "Извлечение данных из PDF..." },
  { icon: Database, text: "Объединение отчетов бюро..." },
  { icon: BrainCircuit, text: "Нейросетевой анализ кредитной истории..." },
  { icon: Sparkles, text: "Формирование персональных рекомендаций..." }
];

export const ProgressStep: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // Fake progress sequence since the backend polling is opaque
    const interval = setInterval(() => {
      setCurrentStep(prev => (prev < STEPS.length - 1 ? prev + 1 : prev));
    }, 4000); // Change step text every 4 seconds

    return () => clearInterval(interval);
  }, []);

  const CurrentIcon = STEPS[currentStep].icon;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-md mx-auto bg-card border border-border shadow-2xl shadow-black/5 rounded-3xl p-10 flex flex-col items-center justify-center text-center relative overflow-hidden"
    >
      {/* Decorative bg pulse */}
      <div className="absolute inset-0 bg-primary/5 animate-pulse" />
      
      <div className="relative z-10">
        <div className="w-24 h-24 relative mb-8 mx-auto">
          {/* Rotating borders */}
          <div className="absolute inset-0 border-4 border-primary/20 rounded-full border-t-primary animate-spin" style={{ animationDuration: '3s' }} />
          <div className="absolute inset-2 border-4 border-accent/20 rounded-full border-b-accent animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }} />
          
          <div className="absolute inset-0 flex items-center justify-center text-primary">
            <CurrentIcon className="w-8 h-8 animate-pulse" />
          </div>
        </div>

        <h3 className="text-2xl font-display font-semibold text-foreground mb-4">
          Анализ в процессе
        </h3>
        
        <div className="h-8 relative w-full overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={currentStep}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="text-muted-foreground font-medium absolute inset-0 w-full"
            >
              {STEPS[currentStep].text}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Progress Dots */}
        <div className="flex gap-2 justify-center mt-6">
          {STEPS.map((_, idx) => (
            <div 
              key={idx} 
              className={`w-2 h-2 rounded-full transition-all duration-500 ${
                idx === currentStep ? 'bg-primary w-6' : 
                idx < currentStep ? 'bg-primary/40' : 'bg-border'
              }`} 
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
};
