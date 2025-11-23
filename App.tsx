import React, { useState, useEffect, useRef } from 'react';
import { Camera, Plus, Search, ArrowLeft, Trash2, Receipt, ChevronRight, ScanLine, Download, X, Share, Database, Lock, User as UserIcon, LogOut, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { ReceiptData, AnalysisResult, User } from './types';
import * as db from './services/db';
import * as gemini from './services/gemini';
import * as auth from './services/auth';
import ReceiptCard from './components/ReceiptCard';

// --- Views Management ---
type ViewMode = 'AUTH' | 'DASHBOARD' | 'STORE_DETAIL' | 'RECEIPT_DETAIL';
type AuthMode = 'LOGIN' | 'REGISTER';

function App() {
  const [view, setView] = useState<ViewMode>('AUTH');
  const [user, setUser] = useState<User | null>(null);

  // Data State
  const [receipts, setReceipts] = useState<ReceiptData[]>([]);
  
  // Navigation State
  const [selectedStoreName, setSelectedStoreName] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptData | null>(null);
  
  // UI State
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  
  // Auth Form State
  const [authMode, setAuthMode] = useState<AuthMode>('LOGIN');
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check if running in standalone mode (installed)
    const checkStandalone = () => {
      const isStd = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
      setIsStandalone(isStd);
    };
    checkStandalone();
    
    // Check local storage for simple session persistence (optional, for now we force login on refresh for security as requested implicitly by "secure")
    // If you wanted persistent login: const savedUser = localStorage.getItem('userEmail'); ...
  }, []);

  const loadReceipts = async () => {
    try {
      const data = await db.getAllReceipts();
      setReceipts(data);
    } catch (error) {
      console.error("Error loading receipts", error);
    }
  };

  // --- Auth Handlers ---

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsProcessing(true);
    try {
      const loggedUser = await auth.login(authEmail, authPass);
      setUser(loggedUser);
      await loadReceipts();
      setView('DASHBOARD');
      // Clear sensitive fields
      setAuthPass(''); 
    } catch (err: any) {
      setAuthError(err.message || "Error al iniciar sesión");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    
    // Validar regex visualmente antes de enviar
    if (!auth.PASSWORD_REGEX.test(authPass)) {
      setAuthError("La contraseña no es segura.");
      return;
    }

    setIsProcessing(true);
    try {
      const newUser = await auth.register(authName, authEmail, authPass);
      setUser(newUser);
      await loadReceipts();
      setView('DASHBOARD');
      setAuthPass('');
    } catch (err: any) {
      setAuthError(err.message || "Error al registrarse");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setReceipts([]);
    setView('AUTH');
    setAuthEmail('');
    setAuthPass('');
    setAuthMode('LOGIN');
  };

  // --- Logic: Grouping & Sorting ---
  
  // Group receipts by Store Name
  const groupedReceipts = receipts.reduce((groups, receipt) => {
    const store = receipt.storeName;
    if (!groups[store]) {
      groups[store] = [];
    }
    groups[store].push(receipt);
    return groups;
  }, {} as Record<string, ReceiptData[]>);

  // Get list of stores (filtered by search)
  const storeNames = Object.keys(groupedReceipts).filter(name => 
    name.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort();

  // Helper to get a representative logo for the store
  const getStoreLogo = (storeName: string) => {
    const group = groupedReceipts[storeName];
    // Try to find a website in any of the receipts for this store
    const website = group.find(r => r.website)?.website;
    
    if (website) {
      return `https://www.google.com/s2/favicons?domain=${website}&sz=128`;
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(storeName)}&background=random&color=fff&size=128`;
  };

  // --- Utilities ---

  // Compress image to ensure IndexedDB doesn't hit quota limits with large camera photos
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_DIM = 1024; // Sufficient for OCR, keeps storage light
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_DIM) {
              height *= MAX_DIM / width;
              width = MAX_DIM;
            }
          } else {
            if (height > MAX_DIM) {
              width *= MAX_DIM / height;
              height = MAX_DIM;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context missing'));
            return;
          }
          // White background for transparent PNGs
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          
          // Compress to JPEG 60% quality
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // --- Handlers ---

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    
    try {
      // 1. Compress Image
      const base64 = await compressImage(file);

      // 2. Analyze with AI
      const analysis: AnalysisResult = await gemini.analyzeReceiptImage(base64);

      // 3. Save to DB
      const newReceipt: ReceiptData = {
        id: crypto.randomUUID(),
        ...analysis,
        imageBase64: base64, // Storing the compressed version
        createdAt: Date.now()
      };

      await db.saveReceipt(newReceipt);
      await loadReceipts();
      
      // Go to the store of the uploaded receipt
      setSelectedStoreName(newReceipt.storeName);
      setView('STORE_DETAIL');
      
    } catch (error) {
      alert('No se pudo analizar el ticket. Intenta con una foto más clara.');
      console.error(error);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Borrar ticket definitivamente?')) {
      await db.deleteReceipt(id);
      await loadReceipts();
      
      // Check if store is empty now
      const remainingInStore = receipts.filter(r => r.storeName === selectedStoreName && r.id !== id);
      if (remainingInStore.length === 0) {
        setView('DASHBOARD');
        setSelectedStoreName(null);
      } else {
        setView('STORE_DETAIL'); // Go back to list
      }
      setSelectedReceipt(null);
    }
  };

  // --- Renderers ---

  const renderLoader = () => (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center z-[70] text-white p-8 text-center">
      <div className="relative">
        <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse"></div>
        <ScanLine className="w-16 h-16 mb-6 text-indigo-400 animate-bounce" />
      </div>
      <h3 className="text-2xl font-bold mb-2">Procesando</h3>
      <p className="text-gray-300 text-sm max-w-xs">Esto tomará solo unos segundos...</p>
    </div>
  );

  const renderAuth = () => {
    const isLogin = authMode === 'LOGIN';
    
    // Password validation visual checks
    const hasUpper = /[A-Z]/.test(authPass);
    const hasLower = /[a-z]/.test(authPass);
    const hasNumber = /\d/.test(authPass);
    const hasSpecial = /[\W_]/.test(authPass);
    const hasLength = authPass.length >= 8;
    const isPassValid = hasUpper && hasLower && hasNumber && hasSpecial && hasLength;

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center px-6 py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-sm">
           <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto mb-6 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
             <Receipt className="w-8 h-8" strokeWidth={2.5} />
           </div>
           <h2 className="text-center text-3xl font-black leading-9 tracking-tight text-gray-900">
             Ticket<span className="text-indigo-600">App</span>
           </h2>
           <p className="mt-2 text-center text-sm text-gray-500">
             {isLogin ? 'Inicia sesión para ver tus tickets' : 'Crea tu cuenta segura'}
           </p>
        </div>

        <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
          <form className="space-y-6" onSubmit={isLogin ? handleLogin : handleRegister}>
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium leading-6 text-gray-900">Nombre</label>
                <div className="mt-2 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    required={!isLogin}
                    value={authName}
                    onChange={e => setAuthName(e.target.value)}
                    className="block w-full rounded-xl border-0 py-3 pl-10 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    placeholder="Tu nombre"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium leading-6 text-gray-900">Email</label>
              <div className="mt-2 relative">
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                  className="block w-full rounded-xl border-0 py-3 pl-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  placeholder="ejemplo@email.com"
                />
              </div>
            </div>

            <div>
               <div className="flex items-center justify-between">
                <label className="block text-sm font-medium leading-6 text-gray-900">Contraseña</label>
              </div>
              <div className="mt-2 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={authPass}
                  onChange={e => setAuthPass(e.target.value)}
                  className="block w-full rounded-xl border-0 py-3 pl-10 pr-10 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  placeholder="********"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>

              {/* Password Requirements UI (Only on Register) */}
              {!isLogin && authPass.length > 0 && (
                <div className="mt-3 bg-white p-3 rounded-lg border border-gray-100 shadow-sm text-xs space-y-1">
                   <p className="font-semibold text-gray-500 mb-2">La contraseña debe contener:</p>
                   <div className={`flex items-center ${hasLower ? 'text-green-600' : 'text-gray-400'}`}>
                      <CheckCircle className="w-3 h-3 mr-1.5" /> 1 minúscula
                   </div>
                   <div className={`flex items-center ${hasUpper ? 'text-green-600' : 'text-gray-400'}`}>
                      <CheckCircle className="w-3 h-3 mr-1.5" /> 1 mayúscula
                   </div>
                   <div className={`flex items-center ${hasNumber ? 'text-green-600' : 'text-gray-400'}`}>
                      <CheckCircle className="w-3 h-3 mr-1.5" /> 1 número
                   </div>
                   <div className={`flex items-center ${hasSpecial ? 'text-green-600' : 'text-gray-400'}`}>
                      <CheckCircle className="w-3 h-3 mr-1.5" /> 1 símbolo (!@#$...)
                   </div>
                   <div className={`flex items-center ${hasLength ? 'text-green-600' : 'text-gray-400'}`}>
                      <CheckCircle className="w-3 h-3 mr-1.5" /> Mínimo 8 caracteres
                   </div>
                </div>
              )}
            </div>

            {authError && (
              <div className="text-red-500 text-sm font-medium bg-red-50 p-3 rounded-lg text-center animate-fade-in">
                {authError}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={!isLogin && !isPassValid}
                className="flex w-full justify-center rounded-xl bg-indigo-600 px-3 py-3 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isLogin ? 'Entrar' : 'Registrarse'}
              </button>
            </div>
          </form>

          <p className="mt-10 text-center text-sm text-gray-500">
            {isLogin ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
            <button 
              onClick={() => {
                setAuthMode(isLogin ? 'REGISTER' : 'LOGIN');
                setAuthError('');
                setAuthPass('');
              }}
              className="font-semibold leading-6 text-indigo-600 hover:text-indigo-500"
            >
              {isLogin ? 'Regístrate aquí' : 'Inicia sesión'}
            </button>
          </p>
        </div>
      </div>
    );
  };

  const renderInstallModal = () => (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowInstallModal(false)}>
      <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl relative" onClick={e => e.stopPropagation()}>
        <button 
          onClick={() => setShowInstallModal(false)}
          className="absolute top-4 right-4 p-1 bg-gray-100 rounded-full text-gray-500"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto mb-4 flex items-center justify-center text-white shadow-lg">
            <Receipt className="w-8 h-8" strokeWidth={2.5} />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Instalar App</h2>
          <p className="text-gray-500 text-sm mt-1">Tus tickets se guardarán en este teléfono.</p>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-xl flex items-start">
             <span className="bg-gray-200 text-gray-700 font-bold w-6 h-6 rounded flex items-center justify-center mr-3 text-xs shrink-0">1</span>
             <div>
               <p className="text-sm font-semibold text-gray-800">En iPhone (Safari)</p>
               <p className="text-xs text-gray-500 mt-1">
                 Pulsa el botón <span className="inline-block"><Share className="w-3 h-3 inline" /> Compartir</span> y elige <br/>
                 <span className="font-bold text-gray-700">"Añadir a pantalla de inicio"</span>.
               </p>
             </div>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-xl flex items-start">
             <span className="bg-gray-200 text-gray-700 font-bold w-6 h-6 rounded flex items-center justify-center mr-3 text-xs shrink-0">2</span>
             <div>
               <p className="text-sm font-semibold text-gray-800">En Android (Chrome)</p>
               <p className="text-xs text-gray-500 mt-1">
                 Pulsa los <span className="font-bold text-gray-700">3 puntos</span> del menú y elige <br/>
                 <span className="font-bold text-gray-700">"Instalar aplicación"</span>.
               </p>
             </div>
          </div>
        </div>
        
        <button 
          onClick={() => setShowInstallModal(false)}
          className="w-full mt-6 bg-gray-900 text-white py-3 rounded-xl font-medium"
        >
          Entendido
        </button>
      </div>
    </div>
  );

  const renderReceiptDetail = () => {
    if (!selectedReceipt) return null;
    
    const qrValue = selectedReceipt.barcodeValue || selectedReceipt.id;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrValue)}`;

    return (
      <div className="min-h-screen bg-gray-900 flex flex-col animate-fade-in">
        {/* Navbar */}
        <div className="px-4 py-4 flex items-center text-white sticky top-0 z-10 bg-gray-900/80 backdrop-blur-md">
          <button onClick={() => setView('STORE_DETAIL')} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="flex-1 text-center font-medium">Ticket Digital</h1>
          <button onClick={() => handleDelete(selectedReceipt.id)} className="p-2 -mr-2 rounded-full hover:bg-red-500/20 text-red-400 transition-colors">
            <Trash2 className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 p-4 flex flex-col items-center justify-start overflow-y-auto pb-20">
          
          {/* The Ticket "Pass" */}
          <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl">
            
            {/* Header Brand */}
            <div className="bg-gray-50 p-6 border-b border-gray-100 text-center">
              <img 
                src={getStoreLogo(selectedReceipt.storeName)} 
                className="w-16 h-16 rounded-full mx-auto mb-3 shadow-md object-cover bg-white" 
                alt="Logo" 
                onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${selectedReceipt.storeName}&background=random`)}
              />
              <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase">{selectedReceipt.storeName}</h2>
              <p className="text-gray-500 text-sm">{selectedReceipt.category}</p>
            </div>

            {/* QR Area */}
            <div className="p-8 flex flex-col items-center bg-white">
              <div className="bg-white p-2 border-4 border-gray-900 rounded-xl">
                <img src={qrUrl} alt="QR" className="w-56 h-56 mix-blend-multiply" />
              </div>
              <p className="mt-4 font-mono text-gray-500 tracking-[0.2em] text-sm">{qrValue}</p>
              <p className="text-xs text-gray-400 mt-1 text-center max-w-[200px]">Muestra este código en caja para devoluciones</p>
            </div>

            {/* Cut Line */}
            <div className="relative h-8 bg-gray-50 w-full overflow-hidden flex items-center">
              <div className="absolute -left-4 w-8 h-8 rounded-full bg-gray-900"></div>
              <div className="w-full border-t-2 border-dashed border-gray-300 mx-4"></div>
              <div className="absolute -right-4 w-8 h-8 rounded-full bg-gray-900"></div>
            </div>

            {/* Details */}
            <div className="p-6 bg-gray-50 space-y-4">
               <div className="flex justify-between items-end">
                 <div>
                   <p className="text-xs text-gray-400 uppercase tracking-wider">Fecha Compra</p>
                   <p className="font-semibold text-gray-800 text-lg">{selectedReceipt.date}</p>
                 </div>
                 <div className="text-right">
                   <p className="text-xs text-gray-400 uppercase tracking-wider">Total</p>
                   <p className="font-bold text-gray-900 text-3xl">{selectedReceipt.totalAmount.toFixed(2)}{selectedReceipt.currency}</p>
                 </div>
               </div>
               
               {selectedReceipt.summary && (
                 <div className="pt-4 border-t border-gray-200">
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Resumen</p>
                    <p className="text-gray-700 font-medium">{selectedReceipt.summary}</p>
                 </div>
               )}
            </div>

            {/* Toggle Real Image */}
            <div className="bg-gray-100 p-4 border-t border-gray-200">
              <details className="group">
                <summary className="flex items-center justify-center cursor-pointer list-none text-sm font-semibold text-gray-600 hover:text-gray-900">
                  <span>Ver Foto Original</span>
                  <ChevronRight className="w-4 h-4 ml-1 transition-transform group-open:rotate-90" />
                </summary>
                <div className="mt-4 rounded-lg overflow-hidden border border-gray-300 shadow-inner">
                  <img src={selectedReceipt.imageBase64} className="w-full" alt="Original" />
                </div>
              </details>
            </div>
          </div>

        </div>
      </div>
    );
  };

  const renderStoreDetail = () => {
    if (!selectedStoreName) return null;

    const storeReceipts = groupedReceipts[selectedStoreName] || [];
    // Sort by Purchase Date Descending (Newest purchase first)
    const sortedReceipts = [...storeReceipts].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const totalSpent = sortedReceipts.reduce((acc, r) => acc + r.totalAmount, 0);
    const logoUrl = getStoreLogo(selectedStoreName);

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
         {/* Header */}
         <div className="bg-white sticky top-0 z-10 shadow-sm">
            <div className="px-4 h-16 flex items-center">
              <button onClick={() => setView('DASHBOARD')} className="p-2 -ml-2 rounded-full hover:bg-gray-100">
                <ArrowLeft className="w-6 h-6 text-gray-700" />
              </button>
              <div className="flex-1 flex flex-col items-center pr-8">
                <span className="text-xs text-gray-400 uppercase tracking-wider">Comercio</span>
                <h1 className="font-bold text-lg text-gray-900 leading-tight">{selectedStoreName}</h1>
              </div>
            </div>
         </div>

         {/* Store Info Hero */}
         <div className="bg-white px-6 py-8 flex flex-col items-center border-b border-gray-100">
             <img 
                src={logoUrl} 
                alt={selectedStoreName} 
                className="w-24 h-24 rounded-2xl shadow-lg mb-4 object-cover bg-white border border-gray-100"
                onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${selectedStoreName}&background=random`)}
              />
             <p className="text-gray-500 text-sm font-medium">{storeReceipts.length} compras registradas</p>
             <p className="text-3xl font-bold text-gray-900 mt-1">{totalSpent.toFixed(2)} € <span className="text-sm text-gray-400 font-normal">total</span></p>
         </div>

         {/* List */}
         <div className="p-4 flex-1 pb-24">
            <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">Historial de compras</h3>
            {sortedReceipts.map(receipt => (
              <ReceiptCard 
                key={receipt.id} 
                receipt={receipt} 
                onClick={(r) => { setSelectedReceipt(r); setView('RECEIPT_DETAIL'); }} 
              />
            ))}
         </div>

         {/* FAB */}
         <div className="fixed bottom-6 right-6">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="bg-gray-900 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-xl active:scale-95 transition-transform"
            >
              <Plus className="w-6 h-6" />
            </button>
         </div>
      </div>
    );
  };

  const renderDashboard = () => (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col pb-24">
      {/* Minimal Header */}
      <div className="px-6 pt-12 pb-6 bg-white sticky top-0 z-10">
        <div className="flex justify-between items-center mb-6">
          <div>
             <h1 className="text-3xl font-black text-gray-900 tracking-tighter">Ticket<span className="text-indigo-600">App</span></h1>
             <p className="text-gray-400 font-medium text-sm">Hola, <span className="text-indigo-600 font-bold">{user?.name}</span></p>
          </div>
          
          <div className="flex items-center gap-2">
            {!isStandalone && (
              <button 
                onClick={() => setShowInstallModal(true)}
                className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center hover:bg-indigo-100 transition-colors"
              >
                <Download className="w-4 h-4 mr-1.5" />
                Instalar
              </button>
            )}
             <button 
                onClick={handleLogout}
                className="bg-gray-100 text-gray-600 p-2.5 rounded-xl flex items-center hover:bg-red-50 hover:text-red-600 transition-colors"
                title="Cerrar Sesión"
              >
                <LogOut className="w-5 h-5" />
              </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Buscar tienda..." 
            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-gray-100 text-gray-900 placeholder-gray-400 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all border-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Store Grid */}
      <div className="px-4 pt-4 flex-1">
        {storeNames.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 opacity-60">
            <div className="relative">
               <div className="absolute inset-0 bg-indigo-200 blur-2xl opacity-30"></div>
               <Database className="w-20 h-20 mb-4 text-gray-300 relative" />
            </div>
            <p className="text-lg font-medium text-gray-500">Sin tickets guardados</p>
            <p className="text-sm text-center max-w-[200px] mt-2">Sube una foto. Los tickets se guardarán en este dispositivo.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {storeNames.map(name => {
              const count = groupedReceipts[name].length;
              const latest = groupedReceipts[name].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
              const logo = getStoreLogo(name);

              return (
                <div 
                  key={name}
                  onClick={() => { setSelectedStoreName(name); setView('STORE_DETAIL'); }}
                  className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center active:scale-95 transition-all cursor-pointer hover:shadow-md"
                >
                  <div className="w-16 h-16 rounded-full mb-3 bg-gray-50 p-1 border border-gray-100">
                    <img 
                      src={logo} 
                      alt={name} 
                      className="w-full h-full rounded-full object-cover"
                      onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${name}&background=random`)}
                    />
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm truncate w-full mb-1">{name}</h3>
                  <p className="text-xs text-gray-400 font-medium">{count} {count === 1 ? 'ticket' : 'tickets'}</p>
                  <p className="text-[10px] text-gray-300 mt-2">Ult: {new Date(latest.date).toLocaleDateString('es-ES', {day: 'numeric', month: 'short'})}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-6 left-0 right-0 flex justify-center z-20 pointer-events-none">
        <div className="pointer-events-auto shadow-2xl shadow-indigo-300/50 rounded-full">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full w-16 h-16 flex items-center justify-center transform transition-transform hover:scale-105 active:scale-95"
            aria-label="Escanear o subir ticket"
          >
            <Camera className="w-7 h-7" />
          </button>
        </div>
      </div>
      
      <input 
        type="file" 
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );

  // --- Main Return ---

  return (
    <>
      {showInstallModal && renderInstallModal()}
      {isProcessing && renderLoader()}
      
      {view === 'AUTH' && renderAuth()}
      {view === 'DASHBOARD' && renderDashboard()}
      {view === 'STORE_DETAIL' && renderStoreDetail()}
      {view === 'RECEIPT_DETAIL' && renderReceiptDetail()}
    </>
  );
}

export default App;