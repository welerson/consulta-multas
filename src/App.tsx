/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Info, 
  PhoneCall, 
  ShieldCheck, 
  ExternalLink, 
  AlertTriangle, 
  Menu, 
  X, 
  ArrowRight, 
  MessageSquare, 
  Eye, 
  Users, 
  Mail, 
  Send,
  CheckCircle2,
  FileText,
  BarChart3,
  MousePointer2,
  Maximize2,
  Download,
  Shield,
  Lock,
  Plus,
  Trash2,
  TrendingUp,
  Upload,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { violations, Violation } from './data/violations';
import { trackVisit, trackSearch, getStats, Stats, trackAdImpression, trackAdClick, getCustomAds, CustomAd, createCustomAd, deleteCustomAd, toggleAdStatus, auth } from './lib/firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from 'firebase/auth';

// --- COMPONENTE PAINEL ADMINISTRATIVO ---
const AdminPanel = ({ isOpen, onClose, onAdChange }: { isOpen: boolean, onClose: () => void, onAdChange: () => void }) => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [ads, setAds] = useState<CustomAd[]>([]);
  const [newAd, setNewAd] = useState<Partial<CustomAd>>({
    label: '',
    imageUrl: '',
    targetUrl: '',
    active: true,
    position: 'sidebar'
  });
  const [durationDays, setDurationDays] = useState<number>(30); // Padrão 30 dias
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123';

  useEffect(() => {
    if (isOpen && user && isUnlocked) {
      loadAds();
    }
  }, [isOpen, user, isUnlocked]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  const loadAds = async () => {
    try {
      setIsLoading(true);
      console.log("Firestore: Loading ads...");
      const data = await getCustomAds(false);
      setAds(data);
      console.log("Firestore: Ads loaded:", data.length);
    } catch (e: any) {
      console.error("Error loading ads", e);
      setError('Falha ao carregar a lista de banners. Recarregue a página.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnlock = () => {
    if (password === ADMIN_PASSWORD) {
      setIsUnlocked(true);
      setError('');
    } else {
      setError('Senha de acesso incorreta.');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      setError('Falha ao conectar com Google. Verifique popups.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Aumentamos o limite inicial pois o redimensionamento vai tratar o tamanho final
    if (file.size > 5 * 1024 * 1024) {
      setError('Imagem muito pesada (máximo 5MB). Tente uma imagem menor.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Limite máximo de dimensões para manter o arquivo leve
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        // Exporta como JPEG com qualidade 0.7 para garantir que fique abaixo de 800KB (Base64)
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        
        setNewAd(prev => ({ ...prev, imageUrl: compressedBase64 }));
        setError('');
        console.log("Imagem redimensionada automaticamente para:", width, "x", height);
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      setError('Erro ao ler o arquivo selecionado.');
    };
    reader.readAsDataURL(file);
  };

  const handleAddAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('Você precisa conectar com o Google antes de salvar.');
      return;
    }
    if (!newAd.imageUrl || !newAd.targetUrl || !newAd.label) {
      setError('Preencha todos os campos e selecione uma imagem.');
      return;
    }
    
    try {
      setIsLoading(true);
      setError('');
      console.log("Saving new ad to Firestore...");
      
      const adToSave = { ...newAd };
      if (durationDays > 0) {
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + durationDays);
        adToSave.expiresAt = expirationDate.toISOString();
      } else {
        adToSave.expiresAt = undefined;
      }

      // Use a timeout to avoid infinite "Saving..." state
      const savePromise = createCustomAd(adToSave as CustomAd);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('timeout')), 10000)
      );
      
      await Promise.race([savePromise, timeoutPromise]);
      
      console.log("Ad saved successfully, resetting state...");
      
      // Success! Reset state
      setNewAd({ 
        label: '', 
        imageUrl: '', 
        targetUrl: '', 
        active: true, 
        position: 'sidebar' 
      });
      setDurationDays(30);
      
      if (fileInputRef.current) fileInputRef.current.value = '';
      
      await loadAds();
      onAdChange();
    } catch (e: any) {
      console.error("Save ad failed", e);
      if (e.message === 'timeout') {
        setError('O servidor demorou muito para responder. Tente uma imagem menor ou verifique sua internet.');
      } else if (e.message?.includes('permission-denied')) {
        setError('Acesso negado. Apenas o administrador autenticado pode salvar.');
      } else {
        setError('Falha ao salvar. Verifique sua conexão ou se a imagem é muito pesada (>600KB).');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isAdmin = user?.email === 'welersonfaril@gmail.com';

  const handleDelete = async (id: string) => {
    if (deletingId !== id) {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 3000);
      return;
    }

    try {
      console.log("Attempting to delete ad:", id);
      setIsLoading(true);
      await deleteCustomAd(id);
      await loadAds();
      onAdChange();
      setError('');
      setDeletingId(null);
    } catch (e) {
      console.error("Delete failed", e);
      setError('Erro ao excluir. Verifique se você tem permissão ou conexão.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (ad: CustomAd) => {
    await toggleAdStatus(ad.id!, ad.active);
    await loadAds();
    onAdChange();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="bg-brand-dark p-6 text-white flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Shield className="w-5 h-5 text-brand-primary" /> 
              {isUnlocked ? 'Gerenciador de Publicidade' : 'Acesso Restrito'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!isUnlocked ? (
            <div className="text-center py-20 max-w-xs mx-auto">
              <div className="bg-slate-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-300">
                <Lock size={40} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Digite sua Senha</h3>
              <p className="text-slate-500 text-sm mb-6">Apenas o administrador do portal pode gerenciar anúncios.</p>
              <div className="space-y-3">
                <input 
                  type="password"
                  autoFocus
                  placeholder="Senha Administrativa"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-center text-sm focus:ring-2 ring-brand-primary/20 outline-none"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                />
                {error && <p className="text-red-500 text-xs font-bold">{error}</p>}
                <button 
                  onClick={handleUnlock}
                  className="w-full bg-brand-primary hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-all shadow-md active:scale-95"
                >
                  Confirmar Senha
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {!user ? (
                <div className="bg-orange-50 border border-orange-100 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="bg-orange-100 p-3 rounded-xl text-orange-600">
                      <Mail size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800">Conecte sua Conta Google</h4>
                      <p className="text-xs text-slate-500">Obrigatório para autorizar alterações no banco de dados.</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleGoogleLogin}
                    className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-2 px-6 rounded-xl shadow-sm transition-all flex items-center gap-2"
                  >
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4" alt="Google" /> Conectar Agora
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl border border-green-100">
                  <span className="text-xs text-green-700 font-medium ml-2 flex items-center gap-2">
                    <CheckCircle2 size={14} /> Logado como {user.email}
                  </span>
                  <button onClick={() => signOut(auth)} className="text-[10px] uppercase font-bold text-green-700 hover:underline px-2 py-1">Trocar Conta</button>
                </div>
              )}

              {user && (
                <>
                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <Plus className="w-4 h-4 text-brand-primary" /> Criar Novo Banner
                    </h3>
                    
                    <form onSubmit={handleAddAd} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {error && (
                        <div className="md:col-span-2 bg-red-50 text-red-600 p-4 rounded-xl text-xs font-bold border border-red-100 flex items-center gap-3">
                          <AlertTriangle size={16} /> {error}
                        </div>
                      )}
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400 ml-1">Posição</label>
                          <select 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 ring-brand-primary/20 outline-none"
                            value={newAd.position}
                            onChange={e => setNewAd(prev => ({...prev, position: e.target.value as any}))}
                          >
                            <option value="sidebar">300x250 (Lateral)</option>
                            <option value="result_list">728x90 (Lista de Resultados)</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400 ml-1">Duração da Campanha</label>
                          <select 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 ring-brand-primary/20 outline-none"
                            value={durationDays}
                            onChange={e => setDurationDays(Number(e.target.value))}
                          >
                            <option value={7}>7 Dias (Temporário)</option>
                            <option value={15}>15 Dias (Padrão)</option>
                            <option value={30}>30 Dias (Mensal)</option>
                            <option value={60}>60 Dias (Bimestral)</option>
                            <option value={0}>♾️ Permanente (Sem expiração)</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400 ml-1">Nome do Anunciante</label>
                          <input 
                            type="text" 
                            placeholder="Ex: Auto Latina"
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 ring-brand-primary/20"
                            value={newAd.label}
                            onChange={e => setNewAd({...newAd, label: e.target.value})}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400 ml-1">Link de Destino</label>
                          <input 
                            type="url" 
                            placeholder="https://wa.me/..."
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 ring-brand-primary/20"
                            value={newAd.targetUrl}
                            onChange={e => setNewAd({...newAd, targetUrl: e.target.value})}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400 ml-1">URL da Imagem ou Upload</label>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              placeholder="https://i.imgur.com/..."
                              className={`flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 ring-brand-primary/20 ${newAd.imageUrl?.startsWith('data:image') ? 'text-brand-primary font-bold' : ''}`}
                              value={newAd.imageUrl?.startsWith('data:image') ? 'Arquivo Selecionado ✔' : (newAd.imageUrl || '')}
                              onChange={e => setNewAd(prev => ({ ...prev, imageUrl: e.target.value }))}
                            />
                            <input 
                              type="file" 
                              ref={fileInputRef}
                              className="hidden" 
                              accept="image/*"
                              onChange={handleFileUpload}
                            />
                            <button 
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="bg-white border border-slate-200 hover:border-brand-primary text-slate-600 p-3 rounded-xl transition-all shadow-sm flex items-center justify-center group"
                              title="Fazer Upload do Computador"
                            >
                              <Upload size={18} className="group-hover:text-brand-primary" />
                            </button>
                          </div>
                          <p className="text-[9px] text-slate-400 mt-1 ml-1 font-medium">Você pode colar um link ou clicar no ícone para subir um arquivo.</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                         <label className="text-[10px] uppercase font-bold text-slate-400 ml-1">Pré-visualização</label>
                         <div className="border border-dashed border-slate-200 bg-white rounded-2xl h-[230px] flex items-center justify-center p-2 overflow-hidden relative group">
                           {newAd.imageUrl ? (
                             <img 
                              src={newAd.imageUrl} 
                              alt="Preview" 
                              className="max-w-full max-h-full object-contain" 
                              referrerPolicy="no-referrer"
                              onError={(e) => { (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/broken/300/250?blur=5'; }}
                             />
                           ) : (
                             <div className="text-center text-slate-300">
                               <Maximize2 className="mx-auto mb-2 opacity-20" size={32} />
                               <span className="text-[10px] font-bold">Aguardando Link...</span>
                             </div>
                           )}
                           <div className="absolute top-2 right-2 bg-brand-primary text-white text-[8px] px-2 py-0.5 rounded font-bold uppercase">
                             Preview
                           </div>
                         </div>
                         <p className="text-[9px] text-slate-400 italic">Dica: A imagem deve carregar acima para ser válida.</p>
                      </div>

                      <div className="md:col-span-2">
                        <button 
                          disabled={isLoading || !newAd.imageUrl}
                          className="w-full bg-brand-primary hover:bg-blue-600 text-white font-bold py-4 rounded-xl transition-all shadow-md disabled:opacity-50"
                        >
                          {isLoading ? 'Salvando no Banco de Dados...' : 'Publicar Anúncio Agora'}
                        </button>
                      </div>
                    </form>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-800">Campanhas Ativas</h3>
                      <button onClick={loadAds} className="text-xs text-brand-primary hover:underline">Recarregar Lista</button>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {ads.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 text-sm border-2 border-dashed border-slate-100 rounded-2xl">
                          Nenhuma campanha cadastrada.
                        </div>
                      ) : ads.map(ad => (
                        <div key={ad.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-all">
                          <div className="flex items-center gap-4">
                            <div className="w-16 h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-100 flex items-center justify-center">
                              <img 
                                src={ad.imageUrl} 
                                alt="" 
                                className="max-w-full max-h-full object-contain" 
                                referrerPolicy="no-referrer"
                                onError={(e) => { (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/broken/100/100?blur=5'; }}
                              />
                            </div>
                            <div>
                              <div className="font-bold text-slate-800 text-sm">{ad.label}</div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{ad.position}</span>
                                <span className="text-slate-300">•</span>
                                {ad.expiresAt ? (
                                  <span className={`text-[9px] font-bold ${new Date(ad.expiresAt) < new Date() ? 'text-red-500' : 'text-slate-500'}`}>
                                    Expira em: {new Date(ad.expiresAt).toLocaleDateString('pt-BR')}
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-bold text-brand-primary">Permanente</span>
                                )}
                              </div>
                              <a href={ad.targetUrl} target="_blank" className="text-[9px] text-brand-primary hover:underline block truncate max-w-[150px]">
                                {ad.targetUrl}
                              </a>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {ad.expiresAt && new Date(ad.expiresAt) < new Date() ? (
                              <span className="bg-red-100 text-red-700 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase">Expirado</span>
                            ) : (
                              <button 
                                onClick={() => handleToggle(ad)}
                                disabled={isLoading}
                                className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all ${ad.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}
                              >
                                {ad.active ? 'No Ar' : 'Pausado'}
                              </button>
                            )}
                            <button 
                              type="button"
                              onClick={() => ad.id && handleDelete(ad.id)} 
                              className={`p-2 transition-all rounded-lg flex items-center gap-1 ${deletingId === ad.id ? 'bg-red-500 text-white shadow-lg' : 'text-slate-300 hover:text-red-500 hover:bg-red-50'}`}
                            >
                              {deletingId === ad.id ? (
                                <span className="text-[10px] font-bold uppercase px-1">Excluir?</span>
                              ) : (
                                <Trash2 size={18} />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// Components
// CONFIGURAÇÕES DO GOOGLE ADSENSE + CARROSSEL
const AdBlock = ({ 
  className = '', 
  label = 'Publicidade',
  slotId = 'XXXXXXXXXX',
  position = 'sidebar',
  customAds = []
}: { 
  className?: string, 
  label?: string,
  slotId?: string,
  position?: 'sidebar' | 'result_list',
  customAds?: CustomAd[]
}) => {
  const pubId = import.meta.env.VITE_GOOGLE_ADSENSE_PUB_ID || 'ca-pub-3744870258269473';
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Filter active custom ads for this specific position (Limit to 10)
  const matchingAds = useMemo(() => 
    customAds.filter(ad => ad.position === position && ad.active).slice(0, 10),
  [customAds, position]);
  
  useEffect(() => {
    if (matchingAds.length === 0) {
      trackAdImpression();
      try {
        // @ts-ignore
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {}
    }
  }, [matchingAds.length]);

  // Auto-slide effect
  useEffect(() => {
    if (matchingAds.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % matchingAds.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [matchingAds.length]);

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex(prev => (prev + 1) % matchingAds.length);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex(prev => (prev - 1 + matchingAds.length) % matchingAds.length);
  };

  // If there are custom ads, show them in a carousel
  if (matchingAds.length > 0) {
    const ad = matchingAds[currentIndex];
    const aspectClass = position === 'sidebar' ? 'aspect-[6/5]' : 'aspect-[728/90]';
    
    return (
      <div id={`carousel-${position}`} className={`my-6 overflow-hidden rounded-xl shadow-md border border-slate-100 group transition-all relative ${className} ${aspectClass}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={ad.id || currentIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="w-full h-full"
          >
            <a 
              href={ad.targetUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              onClick={() => trackAdClick()}
              className="block w-full h-full relative"
            >
              <img 
                src={ad.imageUrl} 
                alt={ad.label} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute top-2 right-2 bg-black/40 backdrop-blur-sm text-white text-[8px] px-2 py-0.5 rounded font-bold uppercase tracking-widest">
                Patrocinado • {currentIndex + 1}/{matchingAds.length}
              </div>
            </a>
          </motion.div>
        </AnimatePresence>

        {/* Navigation Controls */}
        {matchingAds.length > 1 && (
          <>
            <button 
              onClick={handlePrev}
              type="button"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white p-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10"
            >
              <ChevronLeft size={16} className="text-slate-800" />
            </button>
            <button 
              onClick={handleNext}
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white p-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10"
            >
              <ChevronRight size={16} className="text-slate-800" />
            </button>
            
            {/* Dots */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
              {matchingAds.map((_, i) => (
                <div 
                  key={i} 
                  className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentIndex ? 'bg-brand-primary w-3' : 'bg-white/50'}`} 
                />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // Fallback to AdSense
  return (
    <div id={`adsense-${slotId}`} className={`adsense-placeholder my-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-6 overflow-hidden min-h-[150px] flex items-center justify-center ${className}`}>
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="bg-white/80 p-2 rounded-lg shadow-sm">
          <TrendingUp className="w-5 h-5 text-brand-primary opacity-40" />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold block">Espaço Reservado</span>
          <span className="text-[9px] opacity-60 font-medium block italic">Aguardando aprovação do AdSense</span>
        </div>
        <div onClick={() => trackAdClick()} className="w-full hidden">
          <ins className="adsbygoogle"
               style={{display: 'block', minWidth: '250px', minHeight: '90px'}}
               data-ad-client={pubId}
               data-ad-slot={slotId}
               data-ad-format="auto"
               data-full-width-responsive="true"></ins>
        </div>
        <span className="text-[8px] opacity-30 font-mono hidden md:block">{label}</span>
      </div>
    </div>
  );
};

export default function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isShowingAll, setIsShowingAll] = useState(true);
  const [selectedViolation, setSelectedViolation] = useState<Violation | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('inicio');
  const [stats, setStats] = useState<Stats>({ visits: 0, searches: 0, adClicks: 0, adImpressions: 0 });
  const [formStatus, setFormStatus] = useState<'idle' | 'sending' | 'success'>('idle');
  const [isMediaKitOpen, setIsMediaKitOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [customAds, setCustomAds] = useState<CustomAd[]>([]);

  const loadCustomAds = async () => {
    const data = await getCustomAds(true);
    setCustomAds(data);
  };

  useEffect(() => {
    loadCustomAds();
  }, []);

  useEffect(() => {
    trackVisit();
    const fetchStats = async () => {
      try {
        const s = await getStats();
        setStats(s);
      } catch (e) {
        console.error("Failed to fetch stats", e);
      }
    };
    fetchStats();
    // Refresh stats periodically
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const filteredViolations = useMemo(() => {
    if (isShowingAll) {
      return [...violations].sort((a, b) => a.codigo.localeCompare(b.codigo));
    }
    if (!searchTerm) return [];
    const lower = searchTerm.toLowerCase();
    return violations.filter(v => 
      v.codigo.toLowerCase().includes(lower) || 
      v.descricao.toLowerCase().includes(lower) ||
      v.artigo.toLowerCase().includes(lower) ||
      v.classificacao.toLowerCase().includes(lower)
    );
  }, [searchTerm, isShowingAll]);

  const handleSearch = () => {
    if (searchTerm) {
      setIsShowingAll(false);
      trackSearch();
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormStatus('sending');
    setTimeout(() => setFormStatus('success'), 1500);
  };

  const scrollTo = (id: string) => {
    setActiveSection(id);
    setIsMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-bg-geometric">
      {/* Navbar */}
      <header className="fixed top-0 left-0 right-0 bg-brand-dark text-white z-50 h-[60px] flex items-center shadow-md">
        <div className="max-w-7xl mx-auto px-6 w-full flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => scrollTo('inicio')}>
            <span className="font-extrabold text-xl tracking-[-0.5px] uppercase whitespace-nowrap">Consulta de Multas BR</span>
          </div>

            <nav className="hidden md:flex items-center gap-6 text-[0.85rem] font-medium">
              {['Início', 'Consultar Infração', 'Como Funciona', 'Blog', 'Anuncie Conosco'].map(item => {
                const id = item.toLowerCase().replace(/ /g, '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return (
                  <button 
                    id={`nav-${id}`}
                    key={item} 
                    onClick={() => scrollTo(id)}
                    className={`text-white/80 hover:text-white transition-colors cursor-pointer ${activeSection === id ? 'text-white' : ''}`}
                  >
                    {item}
                  </button>
                );
              })}
              <button 
                id="admin-trigger"
                onClick={() => setIsAdminOpen(true)}
                className="bg-white/10 hover:bg-white/20 px-3 py-1 rounded-lg transition-all flex items-center gap-2 text-white/90"
              >
                <Shield size={14} className="text-brand-primary" /> Admin
              </button>
            </nav>

          <button className="md:hidden p-2" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 pt-[60px] z-40 bg-white md:hidden"
          >
            <div className="p-6 flex flex-col gap-6 text-base font-semibold">
              {['Início', 'Consultar Infração', 'Como Funciona', 'Blog', 'Anuncie Conosco'].map(item => {
                const id = item.toLowerCase().replace(/ /g, '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return (
                  <button key={item} onClick={() => scrollTo(id)} className="text-left py-3 border-b border-gray-100">
                    {item}
                  </button>
                );
              })}
              <button 
                id="admin-mobile-trigger"
                onClick={() => { setIsAdminOpen(true); setIsMenuOpen(false); }} 
                className="text-left py-3 border-b border-gray-100 flex items-center gap-2 text-brand-primary"
              >
                <Shield size={18} /> Acesso Administrativo
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-grow pt-[60px]">
        {/* Hero Section */}
        <section id="inicio" className="bg-gradient-to-br from-brand-dark to-brand-primary text-white py-12 px-6 text-center">
          <div className="max-w-4xl mx-auto relative z-10">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-3xl md:text-5xl font-bold mb-3 tracking-tight"
            >
              Pesquise infrações de trânsito em segundos
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-base md:text-lg opacity-90 mb-10"
            >
              Consulte códigos de multas, entenda valores e pontos do CTB
            </motion.p>
            
            <div className="max-w-[600px] mx-auto space-y-4">
              <div className="flex bg-white rounded-xl shadow-2xl overflow-hidden" id="consultar-infracao">
                <input 
                  type="text"
                  placeholder="Digite o código (ex: 501-00) ou palavra-chave..."
                  className="flex-1 bg-transparent text-slate-900 py-4 px-6 focus:outline-none text-base"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    if (e.target.value) setIsShowingAll(false);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button 
                  onClick={handleSearch}
                  className="bg-brand-primary hover:bg-blue-600 px-8 text-white font-bold uppercase text-sm transition-all"
                >
                  Pesquisar
                </button>
              </div>

              <div className="flex flex-wrap justify-center items-center gap-2">
                <button 
                  onClick={() => {
                    setIsShowingAll(true);
                    setSearchTerm('');
                    trackSearch();
                  }}
                  className="bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-full text-[0.75rem] font-medium text-white transition-colors border border-white/10 flex items-center gap-2"
                >
                  <FileText size={14} /> Todas as Multas
                </button>
                
                {['501-00', 'celular', 'sinal vermelho', 'velocidade', 'álcool'].map(tag => (
                    <button 
                      key={tag}
                      onClick={() => { setSearchTerm(tag); setIsShowingAll(false); handleSearch(); }}
                      className="bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-full text-[0.75rem] font-medium transition-colors border border-white/10"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

        {/* Main Content Layout */}
        <div className="max-w-7xl mx-auto px-6 py-8 md:grid md:grid-cols-[1fr_300px] gap-8 items-start">
          {/* Results Side */}
          <div className="space-y-6">
            <AnimatePresence mode="wait">
              {(searchTerm || isShowingAll) && filteredViolations.length > 0 ? (
                <motion.div 
                  key="results"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xl font-bold text-text-dark">
                      {isShowingAll ? 'Todas as Infrações (Ordem por Código)' : 'Resultados'}
                    </h2>
                    <span className="text-[0.8rem] text-text-muted">{filteredViolations.length} encontrados</span>
                  </div>
                  
                  {filteredViolations.map((v) => (
                    <motion.div 
                      layout
                      key={v.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-xl p-4 border border-border shadow-sm hover:shadow-md transition-all grid grid-cols-1 md:grid-cols-[100px_1fr_150px] gap-4 items-center group cursor-pointer"
                      onClick={() => setSelectedViolation(v)}
                    >
                      <div className="text-brand-primary font-extrabold text-lg text-center md:text-left">
                        {v.codigo}
                      </div>
                      <div>
                        <h3 className="font-bold text-[0.95rem] text-text-dark mb-1 leading-tight group-hover:text-brand-primary transition-colors">
                          {v.descricao}
                        </h3>
                        <p className="text-[0.8rem] text-text-muted">Artigo {v.artigo} do CTB</p>
                      </div>
                      <div className="text-right flex flex-col items-center md:items-end gap-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          v.classificacao === 'Gravíssima' ? 'bg-[#FEE2E2] text-[#991B1B]' :
                          v.classificacao === 'Grave' ? 'bg-[#FFEDD5] text-[#9A3412]' :
                          v.classificacao === 'Média' ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#D1FAE5] text-[#065F46]'
                        }`}>
                          {v.classificacao}
                        </span>
                        <div className="font-bold text-slate-800">R$ {v.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        <div className="text-[10px] uppercase text-text-muted font-bold tracking-wider">{v.pontos} Pontos</div>
                      </div>
                    </motion.div>
                  ))}
                  
                  <AdBlock position="result_list" customAds={customAds} label="Parceiro em Destaque" />
                </motion.div>
              ) : searchTerm ? (
                <motion.div 
                  key="no-results"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200"
                >
                  <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-slate-800 mb-2">Sem resultados</h3>
                  <p className="text-slate-500 text-sm px-8">Tente códigos numéricos ou palavras como "velocidade" ou "celular".</p>
                </motion.div>
              ) : (
                  <div key="welcome" className="bg-white rounded-2xl p-10 border border-border shadow-sm text-center">
                    <Info className="w-12 h-12 text-brand-primary mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-bold text-slate-800 mb-2">Inicie sua consulta</h3>
                    <p className="text-slate-500 text-sm">Use o campo de busca acima para pesquisar códigos ou infrações.</p>
                  </div>
              )}
            </AnimatePresence>
          </div>

          {/* Sidebar */}
          <aside className="mt-8 md:mt-0 space-y-6">
            {/* Stats Card */}
            <div className="bg-white rounded-xl p-5 border border-border shadow-sm">
              <div className="space-y-5">
                <div>
                  <div className="text-[0.7rem] font-bold uppercase text-text-muted tracking-wider mb-1">Visitantes Totais</div>
                  <div className="text-2xl font-extrabold text-brand-dark tracking-tight">{stats.visits.toLocaleString('pt-BR')}</div>
                </div>
                <div className="h-px bg-border w-full" />
                <div>
                  <div className="text-[0.7rem] font-bold uppercase text-text-muted tracking-wider mb-1">Consultas Realizadas</div>
                  <div className="text-2xl font-extrabold text-brand-dark tracking-tight">{stats.searches.toLocaleString('pt-BR')}</div>
                </div>
              </div>
            </div>

            <AdBlock position="sidebar" customAds={customAds} className="h-[250px]" label="Lateral - Médio" />
            <div className="bg-slate-50 border border-border p-6 rounded-xl text-center">
              <h4 className="text-[0.7rem] font-bold uppercase text-brand-primary tracking-widest mb-2">Parceria Direta</h4>
              <p className="text-[0.7rem] text-text-muted leading-relaxed">
                Quer anunciar sua Autoescola ou Escritório aqui? <br/>
                <strong>contato@seusite.com.br</strong>
              </p>
            </div>
          </aside>
        </div>

        {/* Informational Sections Container */}
        <div className="max-w-7xl mx-auto px-6 pb-20 space-y-24">
          {/* How it Works */}
          <section id="como-funciona" className="scroll-mt-20">
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold text-brand-dark mb-3">Como Funciona o Portal</h2>
              <div className="w-16 h-1 bg-brand-primary mx-auto rounded-full" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { title: "Pesquisa Facilitada", desc: "Localize por código CTB ou palavras-chave." },
                { title: "Informação Técnica", desc: "Acesse valores, pontos e embasamento legal." },
                { title: "Redirecionamento", desc: "Direcionamos você aos canais oficiais competentes." }
              ].map((step, i) => (
                <div key={i} className="bg-white p-6 rounded-xl border border-border text-center">
                  <h3 className="text-[0.95rem] font-bold text-brand-dark mb-2 uppercase tracking-wide">{step.title}</h3>
                  <p className="text-text-muted text-[0.85rem] leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Blog Section */}
          <section id="blog" className="scroll-mt-20">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-brand-dark">Blog</h2>
              <button className="text-[0.8rem] font-bold text-brand-primary hover:underline flex items-center gap-1">
                VER TUDO <ArrowRight size={14} />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { title: "O que significa a multa 501-00", tag: "Penalidades" },
                { title: "Multa por uso de celular", tag: "Segurança" },
                { title: "Como recorrer de multas", tag: "Direito" }
              ].map((post, i) => (
                <div key={i} className="group cursor-pointer">
                  <div className="h-40 rounded-xl bg-slate-200 mb-3 overflow-hidden">
                    <img src={`https://picsum.photos/seed/${i+50}/400/300`} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary mb-1 block">{post.tag}</span>
                  <h3 className="font-bold text-[0.95rem] text-brand-dark group-hover:text-brand-primary transition-colors">{post.title}</h3>
                </div>
              ))}
            </div>
          </section>

          {/* Contact/Advertise Section */}
          <section id="anuncie-conosco" className="scroll-mt-20 bg-brand-dark text-white rounded-3xl p-8 md:p-12 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/20 blur-[80px] rounded-full translate-x-1/2 -translate-y-1/2" />
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-12 relative z-10">
              <div>
                <h2 className="text-3xl font-bold mb-4">Sua marca para milhões de motoristas</h2>
                <p className="text-white/80 text-[0.95rem] mb-8 leading-relaxed max-w-xl">
                  O Consulta de Multas BR é o ponto de encontro de condutores. Anuncie para um público segmentado.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[0.85rem] mb-6">
                   <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-brand-primary" /> Visibilidade nacional</div>
                   <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-brand-primary" /> Público segmentado</div>
                </div>
                
                <div className="space-y-3 bg-white/5 p-6 rounded-2xl border border-white/10">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-brand-primary">Parceria & Relatórios</h4>
                  <div className="flex flex-col gap-3">
                    <a href="mailto:welersonfaril@gmail.com" className="flex items-center gap-3 text-white hover:text-brand-primary transition-colors">
                      <div className="bg-brand-primary/20 p-2 rounded-lg">
                        <Mail size={18} className="text-brand-primary" />
                      </div>
                      <span className="font-medium">welersonfaril@gmail.com</span>
                    </a>
                    <button 
                      onClick={() => setIsMediaKitOpen(true)}
                      className="flex items-center gap-3 text-white hover:text-brand-primary transition-colors text-left"
                    >
                      <div className="bg-white/10 p-2 rounded-lg">
                        <BarChart3 size={18} className="text-white" />
                      </div>
                      <div>
                        <span className="font-medium block text-sm">Ver Relatório de Audiência</span>
                        <span className="text-[10px] text-white/50">Métricas atualizadas em tempo real</span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 text-slate-800 shadow-xl">
                {formStatus === 'success' ? (
                  <div className="text-center py-10">
                    <CheckCircle2 size={40} className="text-green-500 mx-auto mb-4" />
                    <h3 className="font-bold text-lg mb-1">Enviado!</h3>
                    <p className="text-sm text-slate-500">Retornaremos em breve.</p>
                  </div>
                ) : (
                  <form onSubmit={handleFormSubmit} className="space-y-4">
                    <input required type="text" className="w-full bg-slate-50 border border-slate-200 p-3 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all" placeholder="Nome" />
                    <input required type="email" className="w-full bg-slate-50 border border-slate-200 p-3 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all" placeholder="E-mail" />
                    <textarea required className="w-full bg-slate-50 border border-slate-200 p-3 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all resize-none h-24" placeholder="Mensagem"></textarea>
                    <button type="submit" className="w-full bg-brand-primary text-white font-bold py-3 rounded-lg text-sm uppercase tracking-wide hover:bg-blue-600 transition-all">Enviar</button>
                  </form>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="h-auto md:h-12 bg-white border-t border-border flex flex-col md:flex-row items-center justify-between px-6 py-4 md:py-0 text-[0.75rem] text-text-muted gap-4">
        <div className="flex items-center gap-4">
          <span>&copy; 2026 Consulta de Multas BR - Uso informativo apenas.</span>
          <a href="#inicio" className="hover:underline">Política de Privacidade</a>
        </div>
        <div className="flex items-center gap-4">
          Consulte sempre os <a href="https://www.gov.br/infraestrutura/pt-br/assuntos/transito/detran" target="_blank" rel="noopener noreferrer" className="text-brand-primary font-bold hover:underline">órgãos oficiais (DETRAN/SENATRAN)</a>
        </div>
      </footer>

      {/* Admin Panel */}
      <AdminPanel isOpen={isAdminOpen} onClose={() => setIsAdminOpen(false)} onAdChange={loadCustomAds} />

      {/* Media Kit Modal */}
      <AnimatePresence>
        {isMediaKitOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMediaKitOpen(false)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="bg-brand-dark p-8 md:p-12 text-white relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/20 blur-[80px] rounded-full translate-x-1/2 -translate-y-1/2" />
                <button 
                  onClick={() => setIsMediaKitOpen(false)}
                  className="absolute top-6 right-6 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
                >
                  <X size={20} />
                </button>
                <div className="relative z-10">
                  <span className="bg-brand-primary px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4 inline-block">Métricas de Audiência</span>
                  <h2 className="text-3xl md:text-4xl font-black mb-4">Relatório de Performance Comercial</h2>
                  <p className="text-white/70 max-w-2xl text-[0.95rem]">
                    Dados reais coletados em tempo real diretamente do portal Consulta de Multas BR. 
                    Use essas métricas para planejar suas campanhas publicitárias.
                  </p>
                </div>
              </div>

              <div className="p-8 md:p-12 bg-slate-50">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
                  {[
                    { label: 'Visitas Totais', value: stats.visits, icon: Eye, color: 'text-blue-600', bg: 'bg-blue-100' },
                    { label: 'Buscas Realizadas', value: stats.searches, icon: Search, color: 'text-brand-primary', bg: 'bg-indigo-100' },
                    { label: 'Visualizações de Anúncios', value: stats.adImpressions, icon: Maximize2, color: 'text-purple-600', bg: 'bg-purple-100' },
                    { label: 'Cliques nos Banners', value: stats.adClicks, icon: MousePointer2, color: 'text-pink-600', bg: 'bg-pink-100' },
                  ].map((stat, i) => (
                    <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <div className={`${stat.bg} ${stat.color} w-10 h-10 rounded-xl flex items-center justify-center mb-4`}>
                        <stat.icon size={20} />
                      </div>
                      <div className="text-2xl font-black text-slate-900 mb-1">{stat.value.toLocaleString('pt-BR')}</div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{stat.label}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                  <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                       <Maximize2 size={18} className="text-brand-primary" /> Medidas dos Banners (AdSense)
                    </h3>
                    <div className="space-y-4">
                      {[
                        { size: '728 x 90', label: 'Leaderboard (Topo)', desc: 'Alto impacto visual, ideal para o cabeçalho.' },
                        { size: '300 x 250', label: 'Retângulo Médio (Lateral)', desc: 'Excelente taxa de clique na barra lateral.' },
                        { size: '336 x 280', label: 'Retângulo Grande (Corpo)', desc: 'Integrado ao conteúdo, máxima atenção.' }
                      ].map((b, i) => (
                        <div key={i} className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="bg-brand-dark text-white font-mono text-[0.65rem] px-2 py-4 rounded-lg flex items-center justify-center min-w-[70px]">
                            {b.size}
                          </div>
                          <div>
                            <div className="font-bold text-sm">{b.label}</div>
                            <div className="text-[0.7rem] text-slate-500">{b.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                       <h3 className="font-bold text-lg mb-4">CTR Médio (Eficiência)</h3>
                       <div className="flex items-end gap-2 mb-2">
                          <div className="text-4xl font-black text-brand-primary">
                            {stats.adImpressions > 0 ? ((stats.adClicks / stats.adImpressions) * 100).toFixed(2) : '0.00'}%
                          </div>
                          <div className="text-xs text-slate-400 mb-1 font-medium">Click-Through Rate</div>
                       </div>
                       <p className="text-xs text-slate-500 leading-relaxed">
                         Nossa audiência é altamente qualificada e busca soluções específicas para multas e licenciamento.
                       </p>
                    </div>

                    <button 
                      onClick={() => window.print()}
                      className="w-full bg-brand-primary hover:bg-blue-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 transition-colors shadow-lg shadow-blue-200"
                    >
                      <Download size={20} /> BAIXAR RELATÓRIO PDF
                    </button>
                    
                    <div className="text-center">
                      <p className="text-[0.7rem] text-slate-400">Dados baseados nos últimos 30 dias de acesso.</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Violation Detail Modal */}
      <AnimatePresence>
        {selectedViolation && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedViolation(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative z-10 shadow-2xl flex flex-col"
            >
              <div className="p-6 md:p-10">
                <div className="flex items-start justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="bg-blue-50 text-brand-primary p-3 rounded-2xl">
                      <FileText className="w-10 h-10" />
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Código {selectedViolation.codigo}</div>
                      <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Detalhes da Infração</h2>
                    </div>
                  </div>
                  <button onClick={() => setSelectedViolation(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                    <X />
                  </button>
                </div>

                <div className="space-y-8">
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Descrição Completa</h4>
                    <p className="text-lg font-medium text-slate-800 leading-snug">{selectedViolation.descricao}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold">CTB</div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Artigo do CTB</p>
                        <p className="font-bold text-slate-800">Artigo {selectedViolation.artigo}</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">PTS</div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Pontuação</p>
                        <p className="font-bold text-slate-800">{selectedViolation.pontos} Pontos</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center font-bold">$</div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Valor Atualizado</p>
                        <p className="font-bold text-slate-800">R$ {selectedViolation.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold">!</div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Classificação</p>
                        <p className="font-bold text-slate-800">{selectedViolation.classificacao}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-4">
                      <Info className="w-4 h-4 text-brand-primary" /> Observações e Orientações
                    </h4>
                    <p className="text-slate-600 text-sm leading-relaxed bg-blue-50/30 p-4 rounded-xl border border-blue-50">
                      {selectedViolation.observacoes}
                    </p>
                  </div>

                  <div className="pt-6 border-t border-gray-100">
                    <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 flex gap-3 text-yellow-800">
                      <AlertTriangle className="w-5 h-5 shrink-0" />
                      <p className="text-xs">
                        Para verificar autuações reais vinculadas a um veículo, consulte sempre os canais oficiais dos órgãos de trânsito (DETRAN/SENATRAN).
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-10 mb-2">
                   <AdBlock position="sidebar" customAds={customAds} label="Anúncio no detalhe da infração" />
                </div>

                <div className="mt-8 flex flex-col md:flex-row gap-4 sticky bottom-0 bg-white py-4">
                   <a 
                    href="https://www.gov.br/infraestrutura/pt-br/assuntos/transito/detran"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-brand-primary hover:bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    Consultar Órgão Oficial <ExternalLink className="w-4 h-4" />
                  </a>
                   <button 
                    onClick={() => setSelectedViolation(null)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-all"
                  >
                    Fechar Detalhes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
