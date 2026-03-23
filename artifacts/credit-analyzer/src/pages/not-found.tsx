import React from 'react';
import { Link } from 'wouter';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
      <div className="max-w-md w-full text-center p-8 bg-card rounded-3xl border border-border shadow-2xl shadow-black/5 flex flex-col items-center">
        <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-10 h-10 text-destructive" />
        </div>
        <h1 className="text-3xl font-display font-bold mb-4">Страница не найдена</h1>
        <p className="text-muted-foreground mb-8">
          Запрашиваемая страница не существует или была перемещена.
        </p>
        <Link 
          href="/" 
          className="px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all w-full text-center inline-block"
        >
          Вернуться на главную
        </Link>
      </div>
    </div>
  );
}
