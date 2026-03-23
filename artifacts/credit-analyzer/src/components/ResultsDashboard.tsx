import React from 'react';
import { motion } from 'framer-motion';
import { 
  CreditCard, Wallet, Clock, Activity, 
  TrendingDown, FileText, AlertTriangle, CheckCircle, ArrowDownToLine, RefreshCw
} from 'lucide-react';
import type { AnalysisResult } from '@workspace/api-client-react';
import { ScoreGauge } from './ScoreGauge';

interface ResultsDashboardProps {
  result: AnalysisResult;
  onDownload: () => void;
  onReset: () => void;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
};

export const ResultsDashboard: React.FC<ResultsDashboardProps> = ({ result, onDownload, onReset }) => {
  
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="w-full max-w-6xl mx-auto space-y-8 pb-20"
    >
      {/* Header Actions */}
      <motion.div variants={item} className="flex justify-between items-center bg-card p-4 rounded-2xl border border-border/50 shadow-sm">
        <h2 className="text-xl font-display font-semibold text-foreground">Результаты анализа</h2>
        <div className="flex gap-3">
          <button 
            onClick={onReset}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Новый анализ</span>
          </button>
          <button 
            onClick={onDownload}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 rounded-xl transition-all hover:-translate-y-0.5 active:translate-y-0"
          >
            <ArrowDownToLine className="w-4 h-4" />
            <span>Скачать PDF</span>
          </button>
        </div>
      </motion.div>

      {/* Hero Section: Score & Summary */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 bg-card rounded-3xl border border-border shadow-lg shadow-black/5 p-6 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-0 w-full h-32 bg-gradient-to-b from-primary/5 to-transparent opacity-50 pointer-events-none" />
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Кредитный рейтинг</h3>
          <ScoreGauge score={result.ratingScore} label={result.ratingLabel} />
        </div>

        <div className="lg:col-span-8 bg-card rounded-3xl border border-border shadow-lg shadow-black/5 p-8 flex flex-col justify-center relative overflow-hidden">
          <div className="absolute -right-12 -top-12 w-48 h-48 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-accent/5 rounded-full blur-3xl" />
          <h3 className="text-xl font-display font-bold text-foreground mb-4 flex items-center gap-2">
            <Activity className="text-primary w-6 h-6" />
            Резюме ИИ-аналитика
          </h3>
          <p className="text-muted-foreground leading-relaxed text-lg">
            {result.summary}
          </p>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-3 gap-4 lg:gap-6">
        <StatCard icon={<Wallet className="text-primary" />} label="Общий долг" value={formatCurrency(result.totalDebts)} />
        <StatCard icon={<CreditCard className="text-primary" />} label="Активные кредиты" value={result.activeLoans.toString()} />
        <StatCard icon={<FileText className="text-muted-foreground" />} label="Закрытые кредиты" value={result.closedLoans.toString()} />
        <StatCard 
          icon={<AlertTriangle className={result.overdueLoans > 0 ? "text-destructive" : "text-success"} />} 
          label="Просрочки" 
          value={result.overdueLoans.toString()} 
          danger={result.overdueLoans > 0} 
        />
        <StatCard 
          icon={<TrendingDown className="text-primary" />} 
          label="Кредитная нагрузка (ПДН)" 
          value={`${result.debtBurdenRatio}%`} 
          danger={result.debtBurdenRatio > 50}
        />
        <StatCard icon={<Clock className="text-muted-foreground" />} label="Запросы за месяц" value={result.inquiriesLastMonth.toString()} />
      </motion.div>

      {/* Lists Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risks */}
        <motion.div variants={item} className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden flex flex-col">
          <div className="bg-destructive/5 px-6 py-4 border-b border-destructive/10 flex items-center gap-3">
            <AlertTriangle className="text-destructive w-5 h-5" />
            <h3 className="font-display font-semibold text-foreground text-lg">Факторы риска</h3>
          </div>
          <div className="p-6 flex-1 bg-card">
            {result.risks.length > 0 ? (
              <ul className="space-y-4">
                {result.risks.map((risk, idx) => (
                  <li key={idx} className="flex gap-4 items-start">
                    <span className={`shrink-0 mt-1 w-2.5 h-2.5 rounded-full ${
                      risk.severity === 'high' ? 'bg-destructive shadow-[0_0_8px_rgba(220,38,38,0.6)]' : 
                      risk.severity === 'medium' ? 'bg-warning' : 'bg-muted-foreground'
                    }`} />
                    <div>
                      <h4 className="font-semibold text-foreground text-sm">{risk.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1 leading-snug">{risk.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground flex-col gap-2">
                <CheckCircle className="w-10 h-10 text-success opacity-50" />
                <p>Критических рисков не обнаружено</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Recommendations */}
        <motion.div variants={item} className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden flex flex-col">
          <div className="bg-primary/5 px-6 py-4 border-b border-primary/10 flex items-center gap-3">
            <CheckCircle className="text-primary w-5 h-5" />
            <h3 className="font-display font-semibold text-foreground text-lg">Рекомендации ИИ</h3>
          </div>
          <div className="p-6 flex-1 bg-card">
            {result.recommendations.length > 0 ? (
              <ul className="space-y-5">
                {result.recommendations.map((rec, idx) => (
                  <li key={idx} className="flex gap-4">
                    <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-foreground text-sm">{rec.title}</h4>
                        {rec.priority === 'high' && (
                          <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-primary/10 text-primary tracking-wider">
                            Важно
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 leading-snug">{rec.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <p>Нет доступных рекомендаций</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

function StatCard({ icon, label, value, danger }: { icon: React.ReactNode, label: string, value: string, danger?: boolean }) {
  return (
    <div className={`bg-card p-6 rounded-3xl border shadow-sm flex flex-col gap-3 transition-all hover:shadow-md ${danger ? 'border-destructive/30 bg-destructive/5' : 'border-border/50'}`}>
      <div className="flex justify-between items-start">
        <div className="p-3 bg-secondary rounded-2xl">
          {icon}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
        <p className={`text-2xl font-display font-bold tracking-tight ${danger ? 'text-destructive' : 'text-foreground'}`}>
          {value}
        </p>
      </div>
    </div>
  );
}
