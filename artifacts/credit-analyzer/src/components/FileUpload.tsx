import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, File, X, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FileUploadProps {
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  onAnalyze: () => void;
  isLoading: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ files, setFiles, onAnalyze, isLoading }) => {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(prev => {
      // Avoid duplicates
      const existingNames = new Set(prev.map(f => f.name));
      const newFiles = acceptedFiles.filter(f => !existingNames.has(f.name));
      return [...prev, ...newFiles];
    });
  }, [setFiles]);

  const removeFile = (name: string) => {
    setFiles(files.filter(f => f.name !== name));
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col items-center">
      
      <div 
        {...getRootProps()} 
        className={`w-full relative overflow-hidden rounded-3xl border-2 border-dashed p-10 md:p-16 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 ease-out group
          ${isDragActive ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-border bg-card hover:border-primary/50 hover:bg-secondary/50'}
        `}
      >
        <input {...getInputProps()} />
        
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-card/10 pointer-events-none" />
        
        <div className={`p-5 rounded-full mb-6 transition-colors duration-300 ${isDragActive ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30' : 'bg-primary/10 text-primary group-hover:bg-primary/20'}`}>
          <UploadCloud className="w-10 h-10" strokeWidth={1.5} />
        </div>
        
        <h3 className="text-xl md:text-2xl font-display font-semibold text-foreground mb-3">
          {isDragActive ? 'Отпустите файлы здесь...' : 'Загрузите отчеты из кредитных бюро'}
        </h3>
        <p className="text-muted-foreground text-sm md:text-base max-w-md">
          Перетащите PDF файлы от НБКИ, ОКБ, Скоринг Бюро или нажмите для выбора. ИИ автоматически соберет их в один профиль.
        </p>

        <div className="mt-8 flex items-center gap-2 text-xs font-medium text-muted-foreground bg-background/50 px-4 py-2 rounded-full border border-border/50">
          <ShieldCheck className="w-4 h-4 text-success" />
          <span>Данные анализируются безопасно и не сохраняются</span>
        </div>
      </div>

      <AnimatePresence>
        {files.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, height: 0, y: 20 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -20 }}
            className="w-full mt-8"
          >
            <h4 className="text-sm font-semibold text-foreground mb-4 px-2">Выбранные файлы ({files.length})</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              <AnimatePresence>
                {files.map((file) => (
                  <motion.div
                    key={file.name}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center justify-between p-3.5 bg-card rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="p-2 bg-primary/10 text-primary rounded-xl shrink-0">
                        <File className="w-5 h-5" />
                      </div>
                      <div className="truncate">
                        <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(file.name); }}
                      className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
                      title="Удалить файл"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="flex justify-center">
              <button
                onClick={(e) => { e.stopPropagation(); onAnalyze(); }}
                disabled={isLoading || files.length === 0}
                className={`
                  relative overflow-hidden group
                  px-8 py-4 rounded-2xl font-display font-bold text-lg
                  bg-gradient-to-r from-primary to-accent
                  text-primary-foreground shadow-xl shadow-primary/25
                  hover:shadow-2xl hover:shadow-primary/40 hover:-translate-y-1
                  active:translate-y-0 active:shadow-md
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none
                  transition-all duration-300 ease-out
                `}
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out" />
                <span className="relative z-10">Начать AI-анализ</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
