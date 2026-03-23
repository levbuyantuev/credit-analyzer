import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface ScoreGaugeProps {
  score: number;
  label: string;
}

const getScoreColor = (score: number) => {
  if (score >= 750) return 'stroke-success';
  if (score >= 650) return 'stroke-primary';
  if (score >= 550) return 'stroke-warning';
  return 'stroke-destructive';
};

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({ score, label }) => {
  const [animatedScore, setAnimatedScore] = useState(0);
  
  // Animation for the text number
  useEffect(() => {
    const duration = 1500;
    const steps = 60;
    const stepTime = duration / steps;
    let currentStep = 0;
    
    const timer = setInterval(() => {
      currentStep++;
      setAnimatedScore(Math.round((score / steps) * currentStep));
      if (currentStep >= steps) {
        setAnimatedScore(score);
        clearInterval(timer);
      }
    }, stepTime);
    
    return () => clearInterval(timer);
  }, [score]);

  // SVG parameters
  const radius = 90;
  const circumference = Math.PI * radius;
  const strokeDashoffset = circumference - (score / 850) * circumference;

  return (
    <div className="relative flex flex-col items-center justify-center py-6">
      <svg
        viewBox="0 0 200 120"
        className="w-full max-w-[320px] overflow-visible"
        aria-hidden="true"
      >
        {/* Background Arc */}
        <path
          d="M 10 110 A 90 90 0 0 1 190 110"
          fill="none"
          stroke="currentColor"
          strokeWidth="16"
          strokeLinecap="round"
          className="text-muted/50"
        />
        {/* Active Arc */}
        <motion.path
          d="M 10 110 A 90 90 0 0 1 190 110"
          fill="none"
          stroke="currentColor"
          strokeWidth="16"
          strokeLinecap="round"
          className={getScoreColor(score)}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      
      <div className="absolute bottom-8 flex flex-col items-center text-center">
        <span className="text-5xl font-display font-bold text-foreground tabular-nums tracking-tight">
          {animatedScore}
        </span>
        <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider mt-1">
          из 850
        </span>
        <div className={`mt-3 px-4 py-1 rounded-full text-sm font-bold bg-background shadow-sm border ${
          score >= 750 ? 'text-success border-success/20' : 
          score >= 650 ? 'text-primary border-primary/20' : 
          score >= 550 ? 'text-warning border-warning/20' : 
          'text-destructive border-destructive/20'
        }`}>
          {label}
        </div>
      </div>
    </div>
  );
};
