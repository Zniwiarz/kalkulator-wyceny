import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, addDoc, getDoc, onSnapshot, deleteDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { 
  Plus, Settings, Trash2, Copy, Save, Calculator, Truck, Edit2, 
  FolderOpen, X, FilePlus, Layers, Layout, Scissors, Ruler, Palette, 
  ArrowUpToLine, ArrowDownToLine, FileText, Wrench, Search, Minus,
  CheckSquare, Square, CheckCircle2, Link as LinkIcon, Loader2, ClipboardList,
  Package, Image as ImageIcon, ExternalLink
} from 'lucide-react';

// TWOJA KONFIGURACJA FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyB8ajuravVycMlmMNTlYfSIKfibh6LQEiQ",
  authDomain: "wyceny-4a7af.firebaseapp.com",
  projectId: "wyceny-4a7af",
  storageBucket: "wyceny-4a7af.firebasestorage.app",
  messagingSenderId: "540942259129",
  appId: "1:540942259129:web:6a05b4b5bc4426f8dc5c68"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'stolarnia-master-calc-prod';

const App = () => {
  // --- STANY APLIKACJI ---
  const [activeTab, setActiveTab] = useState('summary'); 
  const [user, setUser] = useState(null);
  
  // Współdzielony widok klienta
  const [isSharedView, setIsSharedView] = useState(false);
  const [sharedOfferData, setSharedOfferData] = useState(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  // Stany archiwum i projektów
  const [cloudProjects, setCloudProjects] = useState([]);
  const [currentProjectName, setCurrentProjectName] = useState('Nowa wycena');
  const [currentProjectId, setCurrentProjectId] = useState(null); 
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null });

  // Stany globalne wyceny
  const [globalCalcMaterials, setGlobalCalcMaterials] = useState(true);
  const [globalFrontType, setGlobalFrontType] = useState('standard');
  const [baseSettings, setBaseSettings] = useState({
    laborRate: 50, baseHoursPerItem: 4, laborDiscount: 0, 
    priceOkap: 250, priceZlew: 200, pricePlata: 200, platePriceM2: 120,    
    edgingPriceMb: 5, cuttingPriceMb: 2, frontStandardPriceM2: 150,
    frontMatPriceM2: 250, frontLakierPriceM2: 450, frontRyflowanyPriceM2: 600,
    countertopPriceMb: 150
  });

  // Stany list i kosztów dodatkowych
  const [wholesaleExtraCost, setWholesaleExtraCost] = useState(0);
  const [extraServices, setExtraServices] = useState({ okap: false, zlew: false, plata: false, customName: '', customValue: 0 });
  const [quoteItems, setQuoteItems] = useState([]);
  
  // Stany okuć
  const [hardwareItems, setHardwareItems] = useState([]);
  const [globalHardwareDb, setGlobalHardwareDb] = useState([]);
  const [searchHardware, setSearchHardware] = useState('');
  const [showAddGlobalModal, setShowAddGlobalModal] = useState(false);
  const [newGlobalHardware, setNewGlobalHardware] = useState({ name: '', category: 'Szuflady', unitPrice: 0, imageUrl: '', linkUrl: '' });

  // Stany materiałów
  const [projectMaterials, setProjectMaterials] = useState([]);
  const [globalMaterialsDb, setGlobalMaterialsDb] = useState([]);
  const [searchMaterial, setSearchMaterial] = useState('');
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [newMaterial, setNewMaterial] = useState({ name: '', category: 'Płyta korpusowa', imageUrl: '', linkUrl: '' });
  
  // Stany oferty i kreatora
  const [offerConfig, setOfferConfig] = useState({ clientName: '', estimatedDelivery: '', includeWholesale: false, includeServices: true, includeHardware: true, includeMaterials: true, includeDetailedPrices: true, selectedItems: {}, countertopStandardLength: 4100 });
  const [builderStep, setBuilderStep] = useState(1);
  const [currentFurniture, setCurrentFurniture] = useState({ 
    category: 'hanging', name: '', type: 'prosty', drawerCount: 1, 
    widthType: '600', customWidth: '', heightType: '720', customHeight: '', 
    depthType: '300', customDepth: '', hasFronts: true, frontCount: 1,
    thickness: '38', customThickness: '', isEdged: true, boardMaterial: 'korpus'
  });

  // --- HELPERY WYŚWIETLANIA ---
  const getDimString = (item) => {
    const W = item.widthType === 'custom' ? item.customWidth : item.widthType;
    const H = item.heightType === 'custom' ? item.customHeight : item.heightType;
    const D = item.depthType === 'custom' ? item.customDepth : item.depthType;
    const T = item.thickness === 'custom' ? item.customThickness : item.thickness;

    if (item.category === 'blat') return `${W} x ${D} x ${T} mm`;
    if (item.category === 'formatka') return `${W} x ${H} mm`;
    return `${H} x ${W} x ${D} mm`;
  };

  const getCategoryName = (item) => {
    if (item.category === 'hanging') return 'Zabudowa Wisząca';
    if (item.category === 'standing') return 'Zabudowa Stojąca';
    if (item.category === 'blat') return 'Blat Roboczy';
    if (item.category === 'formatka') return 'Pojedyncza Formatka';
    return '';
  };

  const getExtraInfo = (item) => {
    if (item.category === 'blat') return '';
    if (item.category === 'formatka') return `${item.boardMaterial === 'front' ? 'Płyta frontowa' : 'Płyta korpusowa'} • ${item.isEdged ? 'Oklejone krawędzie' : 'Surowa'}`;
    return item.hasFronts ? `${item.frontCount} front(y)` : 'Brak frontów';
  };

  // --- EFEKTY (FIREBASE & URL) ---
  useEffect(() => {
    // Autoryzacja Anonimowa działa w tle
    signInAnonymously(auth).catch((err) => console.error("Błąd logowania anonimowego:", err));
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return;
    const urlParams = new URLSearchParams(window.location.search);
    const offerId = urlParams.get('offer');
    
    if (offerId) {
      setIsSharedView(true);
      const fetchPublicOffer = async () => {
        try {
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'shared_offers', offerId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setSharedOfferData(docSnap.data());
          } else {
            setSharedOfferData({ error: 'Ta oferta nie istnieje lub została usunięta.' });
          }
        } catch(e) {
          console.error(e);
          setSharedOfferData({ error: 'Wystąpił błąd podczas ładowania oferty.' });
        }
      };
      fetchPublicOffer();
      return; 
    }

    const unsubProj = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'projects'), (snap) => setCloudProjects(snap.docs.map(d => ({ id: d.id, ...d.data() }))), (error) => console.error(error));
    const unsubHw = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'hardware_db'), (snap) => setGlobalHardwareDb(snap.docs.map(d => ({ id: d.id, ...d.data() }))), (error) => console.error(error));
    const unsubMat = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'materials_db'), (snap) => setGlobalMaterialsDb(snap.docs.map(d => ({ id: d.id, ...d.data() }))), (error) => console.error(error));
    
    return () => { unsubProj(); unsubHw(); unsubMat(); };
  }, [user]);

  useEffect(() => {
    setOfferConfig(prev => {
      const newSel = { ...prev.selectedItems };
      quoteItems.forEach(item => { if (newSel[item.id] === undefined) newSel[item.id] = true; });
      return { ...prev, selectedItems: newSel };
    });
  }, [quoteItems]);

  // --- LOGIKA KALKULACJI ---
  const calculateItemMetrics = useCallback((item, settings, isGlobalMaterialCalc, frontType) => {
    let hours = settings.baseHoursPerItem || 4;
    let multiplier = 1.0;
    
    if (item.category === 'hanging') multiplier = item.type === 'skomplikowany' ? 1.4 : 1.2;
    else if (item.category === 'standing') multiplier = item.type === 'skomplikowany' ? 1.3 : item.type === 'szuflady' ? 1.3 + (Number(item.drawerCount || 0) * 0.05) : 1.0;
    else if (item.category === 'blat') hours = (settings.baseHoursPerItem || 4) * 0.2; 
    else if (item.category === 'formatka') hours = (settings.baseHoursPerItem || 4) * 0.1; 
    
    hours *= multiplier;
    const laborCostRaw = hours * (settings.laborRate || 50);
    const laborCost = Math.round(laborCostRaw * (1 - (settings.laborDiscount / 100)));

    let plateM2 = 0, frontM2 = 0, totalEdging = 0, totalCutting = 0, materialCost = 0, countertopMb = 0;
    const W = (item.widthType === 'custom' ? Number(item.customWidth) : Number(item.widthType)) / 1000;
    const H = (item.heightType === 'custom' ? Number(item.customHeight) : Number(item.heightType)) / 1000;
    const D = (item.depthType === 'custom' ? Number(item.customDepth) : Number(item.depthType)) / 1000;

    if (item.category === 'blat' && W) {
       countertopMb = W;
       if (isGlobalMaterialCalc) materialCost = Math.round(countertopMb * (settings.countertopPriceMb || 150));
    } 
    else if (item.category === 'formatka' && W && H) {
       const area = W * H;
       if (item.boardMaterial === 'front') frontM2 = area;
       else plateM2 = area;

       if (item.isEdged) totalEdging = (W + H) * 2;
       totalCutting = (W + H) * 2;

       let formatkaFrontPrice = frontType === 'mat' ? settings.frontMatPriceM2 : frontType === 'lakier' ? settings.frontLakierPriceM2 : frontType === 'ryflowany' ? settings.frontRyflowanyPriceM2 : settings.frontStandardPriceM2;

       if (isGlobalMaterialCalc) {
         materialCost = Math.round(
           (plateM2 * settings.platePriceM2) + (frontM2 * formatkaFrontPrice) + 
           (totalEdging * settings.edgingPriceMb) + (totalCutting * settings.cuttingPriceMb)
         );
       }
    }
    else if (W && H && D) {
      plateM2 = 2 * (H * D) + (item.category === 'hanging' ? 2 * (W * D) : W * D + 2 * (W * 0.1));
      let bodyEdging = 2 * H + (item.category === 'hanging' ? 2 * W : W);
      let bodyCutting = 2 * (H * 2 + D * 2) + (item.category === 'hanging' ? 2 * (W * 2 + D * 2) : 1 * (W * 2 + D * 2));

      let frontOkleina = 0, frontCiecie = 0, frontPriceM2 = settings.frontStandardPriceM2;
      
      if (item.hasFronts && item.frontCount > 0) {
        frontM2 = W * H; 
        frontOkleina = frontCiecie = ((W / item.frontCount * 2) + (H * 2)) * item.frontCount;
        frontPriceM2 = frontType === 'mat' ? settings.frontMatPriceM2 : frontType === 'lakier' ? settings.frontLakierPriceM2 : frontType === 'ryflowany' ? settings.frontRyflowanyPriceM2 : settings.frontStandardPriceM2;
      }
      totalEdging = bodyEdging + frontOkleina;
      totalCutting = bodyCutting + frontCiecie;

      if (isGlobalMaterialCalc) materialCost = Math.round((plateM2 * settings.platePriceM2) + (frontM2 * frontPriceM2) + (totalEdging * settings.edgingPriceMb) + (totalCutting * settings.cuttingPriceMb));
    }

    return { hours: parseFloat(hours.toFixed(2)), laborCost, materialCost, totalPrice: laborCost + materialCost, rawLabor: Math.round(laborCostRaw), raw: { plateM2, frontM2, frontType, edging: totalEdging, cutting: totalCutting, countertopMb } };
  }, []);

  const calculatedQuoteItems = useMemo(() => quoteItems.map(item => ({ ...item, ...calculateItemMetrics(item, baseSettings, globalCalcMaterials, globalFrontType) })), [quoteItems, baseSettings, globalCalcMaterials, globalFrontType, calculateItemMetrics]);
  const materialTotals = useMemo(() => calculatedQuoteItems.reduce((acc, curr) => ({ plateM2: acc.plateM2 + curr.raw.plateM2, frontM2: acc.frontM2 + curr.raw.frontM2, edging: acc.edging + curr.raw.edging, cutting: acc.cutting + curr.raw.cutting }), { plateM2: 0, frontM2: 0, edging: 0, cutting: 0 }), [calculatedQuoteItems]);
  const furnitureTotalSum = useMemo(() => calculatedQuoteItems.reduce((acc, curr) => acc + curr.totalPrice, 0), [calculatedQuoteItems]);
  const hardwareTotalSum = useMemo(() => hardwareItems.reduce((acc, curr) => acc + (curr.quantity * curr.unitPrice), 0), [hardwareItems]);
  const servicesTotalSum = useMemo(() => Math.round(((extraServices.okap ? baseSettings.priceOkap : 0) + (extraServices.zlew ? baseSettings.priceZlew : 0) + (extraServices.plata ? baseSettings.pricePlata : 0) + Number(extraServices.customValue || 0)) * (1 - (baseSettings.laborDiscount / 100))), [extraServices, baseSettings]);
  
  const rawFinalProjectTotal = furnitureTotalSum + hardwareTotalSum + Number(wholesaleExtraCost || 0) + servicesTotalSum;
  const finalProjectTotal = Math.ceil(rawFinalProjectTotal / 10) * 10;
  
  const finalSplit = useMemo(() => {
    const itemRawLabor = calculatedQuoteItems.reduce((acc, i) => acc + i.rawLabor, 0);
    const sRaw = (extraServices.okap ? baseSettings.priceOkap : 0) + (extraServices.zlew ? baseSettings.priceZlew : 0) + (extraServices.plata ? baseSettings.pricePlata : 0) + Number(extraServices.customValue || 0);
    return {
      totalLabor: calculatedQuoteItems.reduce((acc, i) => acc + i.laborCost, 0) + servicesTotalSum,
      totalMaterials: calculatedQuoteItems.reduce((acc, i) => acc + i.materialCost, 0) + hardwareTotalSum + Number(wholesaleExtraCost || 0),
      discountAmount: Math.round((itemRawLabor + sRaw) * (baseSettings.laborDiscount / 100))
    };
  }, [calculatedQuoteItems, hardwareTotalSum, servicesTotalSum, extraServices, wholesaleExtraCost, baseSettings]);

  const offerItems = useMemo(() => calculatedQuoteItems.filter(item => offerConfig.selectedItems[item.id]), [calculatedQuoteItems, offerConfig.selectedItems]);
  const rawOfferTotal = offerItems.reduce((acc, item) => acc + item.totalPrice, 0) + (offerConfig.includeServices ? servicesTotalSum : 0) + (offerConfig.includeWholesale ? Number(wholesaleExtraCost || 0) : 0) + (offerConfig.includeHardware ? hardwareTotalSum : 0);
  const offerTotal = Math.ceil(rawOfferTotal / 10) * 10;

  // --- AKCJE I FUNKCJE ---
  const resetBuilder = () => { setCurrentFurniture({ category: 'hanging', name: '', type: 'prosty', drawerCount: 1, widthType: '600', customWidth: '', heightType: '720', customHeight: '', depthType: '300', customDepth: '', hasFronts: true, frontCount: 1, thickness: '38', customThickness: '', isEdged: true, boardMaterial: 'korpus' }); setBuilderStep(1); setEditingId(null); };

  const handleAddToQuote = () => {
    const newItem = { ...currentFurniture, id: editingId || Date.now() };
    setQuoteItems(editingId ? quoteItems.map(i => i.id === editingId ? newItem : i) : [newItem, ...quoteItems]);
    setActiveTab('summary'); 
    resetBuilder();
  };

  const saveProjectToCloud = async (overwrite = false) => {
    if (!user) {
      alert("Błąd zapisu! Brak połączenia z bazą (autoryzacja nieudana).");
      return;
    }
    try {
      const data = { name: currentProjectName, items: quoteItems, hardware: hardwareItems, materials: projectMaterials, wholesale: wholesaleExtraCost, services: extraServices, settings: baseSettings, globalCalcMaterials, globalFrontType, updatedAt: serverTimestamp() };
      if (overwrite && currentProjectId) await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'projects', currentProjectId), data);
      else setCurrentProjectId((await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'projects'), data)).id);
      setShowSaveModal(false);
    } catch (e) { 
      console.error("Błąd zapisu projektu:", e); 
      alert("Wystąpił błąd podczas zapisywania projektu.");
    }
  };

  const loadProject = (p) => {
    setQuoteItems(p.items || []); setHardwareItems(p.hardware || []); setProjectMaterials(p.materials || []); setWholesaleExtraCost(p.wholesale || 0);
    setExtraServices(p.services || { okap: false, zlew: false, plata: false, customName: '', customValue: 0 });
    setBaseSettings({ ...baseSettings, ...(p.settings || {}) }); 
    setGlobalCalcMaterials(p.globalCalcMaterials ?? true); setGlobalFrontType(p.globalFrontType || 'standard');
    setCurrentProjectName(p.name); setCurrentProjectId(p.id); setActiveTab('summary');
  };

  const requestConfirm = (title, message, onConfirm) => {
    setConfirmDialog({ isOpen: true, title, message, onConfirm });
  };

  // --- GENEROWANIE LINKU ---
  const handleGenerateLink = async () => {
    if (!user || offerItems.length === 0) return;
    setIsGeneratingLink(true);
    setShareLink('');
    try {
      const offerData = {
        projectName: currentProjectName,
        clientName: offerConfig.clientName,
        estimatedDelivery: offerConfig.estimatedDelivery,
        countertopStandardLength: offerConfig.countertopStandardLength,
        items: offerItems.map(i => ({ 
          name: i.name, category: i.category, widthType: i.widthType, customWidth: i.customWidth, 
          heightType: i.heightType, customHeight: i.customHeight, depthType: i.depthType, customDepth: i.customDepth, 
          thickness: i.thickness, customThickness: i.customThickness,
          totalPrice: i.totalPrice, raw: i.raw
        })),
        hardware: offerConfig.includeHardware ? hardwareItems.map(h => ({ name: h.name, category: h.category, quantity: h.quantity, unitPrice: h.unitPrice, imageUrl: h.imageUrl || '', linkUrl: h.linkUrl || '' })) : [],
        materials: offerConfig.includeMaterials ? projectMaterials.map(m => ({ name: m.name, category: m.category, imageUrl: m.imageUrl || '', linkUrl: m.linkUrl || '' })) : [],
        includeHardware: offerConfig.includeHardware,
        includeServices: offerConfig.includeServices,
        includeMaterials: offerConfig.includeMaterials,
        includeDetailedPrices: offerConfig.includeDetailedPrices,
        servicesTotal: servicesTotalSum,
        hardwareTotal: hardwareTotalSum,
        furnitureTotal: offerItems.reduce((acc, item) => acc + item.totalPrice, 0),
        offerTotal: offerTotal,
        dateStr: new Date().toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }),
        createdAt: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'shared_offers'), offerData);
      
      let baseUrl = window.location.href.split('?')[0];
      baseUrl = baseUrl.replace(/^blob:/i, ''); 
      setShareLink(`${baseUrl}?offer=${docRef.id}`);
    } catch (e) {
      console.error("Błąd generowania linku:", e);
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const copyToClipboard = () => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 3000);
    });
  };

  // --- KOMPONENT WSPÓLNY - ZESTAWIENIE MATERIAŁÓW DO OFERTY ---
  const RenderMaterialsOfferSection = ({ materials }) => {
    if (!materials || materials.length === 0) return null;
    const grouped = materials.reduce((acc, mat) => {
      if (!acc[mat.category]) acc[mat.category] = [];
      acc[mat.category].push(mat);
      return acc;
    }, {});
    return (
      <div className="mb-10 page-break-inside-avoid">
        <h3 className="text-sm font-black text-stone-800 uppercase tracking-widest mb-6 border-l-4 border-stone-800 pl-3">
          Zestawienie Użytych Materiałów
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Object.entries(grouped).map(([category, mats]) => (
            <div key={category} className="bg-stone-50 rounded-2xl p-5 border border-stone-200">
              <h4 className="text-[10px] font-black uppercase text-stone-800 tracking-widest mb-4 border-b border-stone-300 pb-2">
                {category}
              </h4>
              <div className="space-y-4">
                {mats.map((m, idx) => (
                  <div key={idx} className="flex items-center gap-4 bg-white p-3 rounded-xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow">
                    {m.imageUrl ? (
                      <img src={m.imageUrl} alt={m.name} className="w-12 h-12 rounded-lg object-cover border border-stone-300" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-stone-50 flex items-center justify-center text-stone-400 border border-stone-200">
                        <ImageIcon size={20} />
                      </div>
                    )}
                    {m.linkUrl ? (
                      <a href={m.linkUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-stone-800 hover:text-stone-600 hover:underline text-sm flex items-center gap-1.5 transition-colors">
                        {m.name} <ExternalLink size={14} className="opacity-75" />
                      </a>
                    ) : (
                      <span className="font-bold text-stone-800 text-sm">{m.name}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // --- WIDOK KLIENTA (PUBLICZNY) ---
  if (isSharedView) {
    if (!sharedOfferData) {
      return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center">
          <style>{`@import url('https://fonts.googleapis.com/css2?family=Poiret+One&display=swap');`}</style>
          <div className="flex flex-col items-center gap-4 text-stone-800"><Loader2 className="animate-spin" size={48}/><p className="font-bold text-sm uppercase tracking-widest">Wczytywanie oferty...</p></div>
        </div>
      );
    }
    if (sharedOfferData.error) {
      return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
          <style>{`@import url('https://fonts.googleapis.com/css2?family=Poiret+One&display=swap');`}</style>
          <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-xl text-center max-w-md"><div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"><X size={32}/></div><h2 className="text-xl font-black text-stone-800 mb-2">Błąd Oferty</h2><p className="text-stone-500 font-medium">{sharedOfferData.error}</p></div>
        </div>
      );
    }

    const { projectName, clientName, estimatedDelivery, items, hardware, materials, includeHardware, includeServices, includeMaterials, includeDetailedPrices = true, servicesTotal, hardwareTotal, furnitureTotal, offerTotal, dateStr, countertopStandardLength } = sharedOfferData;
    const totalCountertopMb = items.reduce((acc, item) => item.category === 'blat' ? acc + (item.raw?.countertopMb || 0) : acc, 0);

    return (
      <div className="min-h-screen bg-[#F4F1EA] p-4 sm:p-8 flex justify-center items-start overflow-x-auto">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Poiret+One&display=swap');`}</style>
        <div className="bg-white text-stone-900 shadow-2xl rounded-2xl w-full max-w-[800px] overflow-hidden">
          <div className="p-8 sm:p-14">
            {/* Nagłówek */}
            <div className="border-b-4 border-stone-900 pb-8 mb-10">
              <div className="flex justify-between items-start">
                <div><h1 className="text-4xl font-black uppercase tracking-tighter text-stone-900">Oferta Kosztowa</h1><p className="font-bold text-stone-500 mt-2 uppercase tracking-widest text-sm">{projectName}</p></div>
                <div className="text-right"><p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">Data Wystawienia</p><p className="font-bold text-stone-800 bg-stone-100 px-3 py-1 rounded-md capitalize">{dateStr}</p></div>
              </div>
              <div className="mt-8 flex flex-wrap gap-4">
                {clientName && (<div className="bg-stone-50 p-4 rounded-xl border border-stone-200 flex-1 min-w-[200px]"><p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">Przygotowano dla</p><p className="text-xl font-black text-stone-800">{clientName}</p></div>)}
                {estimatedDelivery && (<div className="bg-stone-100 p-4 rounded-xl border border-stone-300 flex-1 min-w-[200px]"><p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1">Szacowany Termin Realizacji</p><p className="text-xl font-black text-stone-900">{estimatedDelivery}</p></div>)}
              </div>
            </div>

            {/* Zestawienie Użytych Materiałów */}
            {includeMaterials && materials && materials.length > 0 && (
              <RenderMaterialsOfferSection materials={materials} />
            )}
            
            {/* Tabela Mebli */}
            <div className="mb-10">
              <h3 className="text-sm font-black text-stone-800 uppercase tracking-widest mb-4 border-l-4 border-stone-800 pl-3">Zestawienie Elementów Projektu</h3>
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-stone-200 bg-stone-50">
                    <th className="py-3 px-4 text-[10px] font-black uppercase text-stone-500 tracking-wider rounded-tl-lg">Lp.</th>
                    <th className="py-3 px-4 text-[10px] font-black uppercase text-stone-500 tracking-wider">Opis Elementu</th>
                    <th className={`py-3 px-4 text-[10px] font-black uppercase text-stone-500 tracking-wider text-center ${!includeDetailedPrices ? 'rounded-tr-lg' : ''}`}>Wymiary WxSxG / Długość</th>
                    {includeDetailedPrices && <th className="py-3 px-4 text-[10px] font-black uppercase text-stone-500 tracking-wider text-right rounded-tr-lg">Wartość Netto</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={index} className="border-b border-stone-100">
                      <td className="py-4 px-4 font-bold text-stone-400">{index + 1}.</td>
                      <td className="py-4 px-4"><span className="font-bold text-stone-800 text-base">{item.name}</span><div className="text-[10px] text-stone-500 font-medium uppercase tracking-widest mt-1">{getCategoryName(item)}</div></td>
                      <td className="py-4 px-4 text-center font-medium text-stone-600">{getDimString(item)}</td>
                      {includeDetailedPrices && <td className="py-4 px-4 font-black text-right text-stone-800 whitespace-nowrap">{item.totalPrice.toLocaleString()} zł</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Podsumowanie blatów (jeśli są) */}
            {totalCountertopMb > 0 && (
              <div className="mb-10 page-break-inside-avoid">
                <h3 className="text-sm font-black text-stone-800 uppercase tracking-widest mb-4 border-l-4 border-stone-800 pl-3">Zestawienie Blatów Roboczych</h3>
                <div className="bg-stone-50 p-4 sm:p-6 rounded-2xl border border-stone-200 flex justify-between items-center">
                   <div>
                     <p className="font-bold text-stone-800">Szacowana ilość blatów do zamówienia</p>
                     <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Zakładana długość 1 szt. blatu: {countertopStandardLength} mm</p>
                   </div>
                   <div className="text-right">
                     <div className="text-3xl font-black text-stone-800">{Math.ceil(totalCountertopMb / (countertopStandardLength / 1000))} szt.</div>
                     <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-1">Długość bieżąca w projekcie: {totalCountertopMb.toFixed(2)} mb</p>
                   </div>
                </div>
              </div>
            )}

            {/* Tabela Okuć */}
            {includeHardware && hardware.length > 0 && (
              <div className="mb-10 page-break-inside-avoid">
                <h3 className="text-sm font-black text-stone-800 uppercase tracking-widest mb-4 border-l-4 border-stone-800 pl-3">Wyszczególnienie Okuć i Akcesoriów</h3>
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-stone-200 bg-stone-50">
                      <th className="py-3 px-4 text-[10px] font-black uppercase text-stone-500 tracking-wider rounded-tl-lg">Kategoria</th>
                      <th className="py-3 px-4 text-[10px] font-black uppercase text-stone-500 tracking-wider">Zdjęcie i Nazwa</th>
                      <th className={`py-3 px-4 text-[10px] font-black uppercase text-stone-500 tracking-wider text-center ${!includeDetailedPrices ? 'rounded-tr-lg' : ''}`}>Ilość</th>
                      {includeDetailedPrices && <th className="py-3 px-4 text-[10px] font-black uppercase text-stone-500 tracking-wider text-right rounded-tr-lg">Wartość Netto</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {hardware.map((item, index) => (
                      <tr key={index} className="border-b border-stone-100">
                        <td className="py-4 px-4 text-[10px] font-bold text-stone-400 uppercase">{item.category}</td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.name} className="w-10 h-10 rounded-md object-cover border border-stone-200" />
                            ) : (
                              <div className="w-10 h-10 rounded-md bg-stone-50 flex items-center justify-center text-stone-300 border border-stone-200">
                                <Wrench size={16} />
                              </div>
                            )}
                            {item.linkUrl ? (
                              <a href={item.linkUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-stone-800 hover:text-stone-600 hover:underline flex items-center gap-1 transition-colors">
                                {item.name} <ExternalLink size={14} className="opacity-75"/>
                              </a>
                            ) : (
                              <span className="font-bold text-stone-800">{item.name}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center font-bold text-stone-600 bg-stone-50">{item.quantity} szt.</td>
                        {includeDetailedPrices && <td className="py-4 px-4 font-black text-right text-stone-700 whitespace-nowrap">{(item.quantity * item.unitPrice).toLocaleString()} zł</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Podsumowanie */}
            <div className="flex justify-end pt-8 mt-12 border-t-2 border-stone-200 page-break-inside-avoid">
              <div className="w-full md:w-2/3 bg-stone-50 p-6 rounded-2xl">
                <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-4 text-right">Podsumowanie Kosztów</h3>
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-sm font-bold text-stone-600"><span>Suma Wartości Mebli / Materiałów:</span><span className="text-stone-800">{furnitureTotal.toLocaleString()} zł</span></div>
                  {includeHardware && hardware.length > 0 && <div className="flex justify-between text-sm font-bold text-stone-600"><span>Suma Wartości Okuć:</span><span className="text-stone-800">{hardwareTotal.toLocaleString()} zł</span></div>}
                  {includeServices && servicesTotal > 0 && <div className="flex justify-between text-sm font-bold text-stone-600"><span>Usługi Dodatkowe:</span><span className="text-stone-800">{servicesTotal.toLocaleString()} zł</span></div>}
                </div>
                <div className="border-t-2 border-stone-200 pt-6 flex flex-col items-end">
                  <span className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-1">Do zapłaty całkowitej</span>
                  <div className="flex items-baseline gap-2"><span className="text-4xl font-black text-stone-900">{offerTotal.toLocaleString()}</span><span className="text-xl font-bold text-stone-500">PLN</span></div>
                </div>
              </div>
            </div>
            
            {/* ODRĘCZNY PODPIS */}
            <div className="mt-16 flex items-center w-full gap-6 opacity-60 page-break-inside-avoid">
              <div className="h-[1px] bg-stone-300 flex-1"></div>
              <span className="text-lg sm:text-xl font-bold text-stone-600 tracking-widest whitespace-nowrap" style={{ fontFamily: "'Poiret One', sans-serif" }}>Weronika Hutyra</span>
              <div className="h-[1px] bg-stone-300 flex-1"></div>
            </div>

            <div className="mt-16 pt-6 border-t border-stone-100 text-center">
              <p className="text-[9px] font-bold text-stone-300 uppercase tracking-[0.3em]">Dokument wygenerowany z Master Calc</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- WIDOK APLIKACJI GŁÓWNEJ ---
  const TabBtn = ({ id, label, icon: Icon }) => (
    <button onClick={() => setActiveTab(id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex gap-1.5 items-center transition-colors ${activeTab === id ? 'bg-white shadow text-stone-800' : 'text-stone-500 hover:text-stone-800'}`}>
      {Icon && <Icon size={14}/>} {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#F4F1EA] text-stone-900 flex flex-col font-sans relative">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poiret+One&display=swap');`}</style>
      
      {/* --- NAWIGACJA GŁÓWNA --- */}
      <nav className="bg-white border-b border-stone-200 px-4 py-3 flex flex-wrap justify-between items-center gap-4 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-stone-800 p-1.5 rounded-lg shadow-sm">
            <Calculator className="text-white w-5 h-5" />
          </div>
          <h1 className="text-lg font-black tracking-tight text-stone-800">Master Calc</h1>
        </div>
        <div className="flex flex-wrap bg-stone-100 p-1 rounded-xl gap-1">
          <TabBtn id="summary" label="Wycena" icon={ClipboardList} />
          <TabBtn id="materials" label="Formatki" icon={Layers} />
          <TabBtn id="hardware" label="Okucia i materiały" icon={Wrench} />
          <TabBtn id="projects" label="Archiwum" icon={FolderOpen} />
          <TabBtn id="settings" label="Cennik" icon={Settings} />
          <TabBtn id="offer" label="Oferta" icon={FileText} />
        </div>
      </nav>

      <main className="flex-1 max-w-5xl mx-auto w-full p-4 relative z-10">
        
        {/* --- 1. ZAKŁADKA WYCENY --- */}
        {activeTab === 'summary' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-stone-800">{currentProjectName}</h2>
                <label className="flex items-center gap-2 mt-2 cursor-pointer group">
                  <input 
                    type="checkbox" className="w-4 h-4 rounded text-stone-800 focus:ring-stone-800 cursor-pointer" 
                    checked={globalCalcMaterials} onChange={e => setGlobalCalcMaterials(e.target.checked)}
                  />
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-widest group-hover:text-stone-800 transition-colors">Naliczaj materiał we wszystkich meblach</span>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => requestConfirm("Nowa wycena", "Obecny niezapisany postęp zostanie utracony. Kontynuować?", () => { setQuoteItems([]); setHardwareItems([]); setProjectMaterials([]); setCurrentProjectId(null); setCurrentProjectName('Nowa wycena'); })} className="bg-white p-2.5 border border-stone-200 rounded-xl shadow-sm hover:bg-stone-50 transition-colors" title="Rozpocznij nową wycenę"><FilePlus size={18} className="text-stone-600" /></button>
                
                {/* TO JEST PRZYCISK ZAPISZ, KTÓRY AKTYWUJE MODAL */}
                <button 
                  onClick={() => setShowSaveModal(true)} 
                  className="bg-white border-2 border-stone-800 text-stone-800 px-5 py-2.5 rounded-xl font-bold text-sm flex gap-2 items-center hover:bg-stone-50 transition-colors shadow-sm"
                >
                  <Save size={18}/> Zapisz
                </button>

                <button onClick={() => { resetBuilder(); setActiveTab('builder'); }} className="bg-stone-800 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex gap-2 items-center shadow-md hover:bg-stone-900 transition-colors"><Plus size={18}/> Dodaj Mebel / Element</button>
              </div>
            </div>

            <div className="space-y-3">
              {calculatedQuoteItems.map((item) => (
                <div key={item.id} className="bg-white p-5 rounded-2xl border border-stone-100 shadow-sm flex flex-col gap-2 hover:border-stone-300 transition-colors group">
                  <div className="flex justify-between items-center">
                    <div className="flex gap-4 items-center">
                      <div className={`p-3 rounded-xl text-white shadow-inner ${item.category === 'hanging' ? 'bg-stone-500' : item.category === 'blat' ? 'bg-amber-600' : item.category === 'formatka' ? 'bg-orange-700' : 'bg-stone-700'}`}>
                        {item.category === 'hanging' ? <ArrowUpToLine size={24}/> : item.category === 'blat' ? <Ruler size={24}/> : item.category === 'formatka' ? <Layers size={24}/> : <ArrowDownToLine size={24}/>}
                      </div>
                      <div>
                        <h3 className="font-bold text-stone-800 text-lg flex items-center gap-2">
                          {item.name} 
                          <span className="text-[10px] bg-stone-100 text-stone-500 px-2 py-1 rounded-full uppercase tracking-wider font-bold">
                            {getCategoryName(item)}
                          </span>
                        </h3>
                        <p className="text-[11px] text-stone-400 font-bold uppercase tracking-widest mt-1">
                          {getDimString(item)} {getExtraInfo(item) ? ` • ${getExtraInfo(item)}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-5">
                      <div>
                        <div className="text-xl font-black text-stone-900">{item.totalPrice.toLocaleString()} zł</div>
                        <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mt-0.5">Rob: {item.laborCost} zł | Mat: {item.materialCost} zł</div>
                      </div>
                      <div className="flex flex-col gap-2 border-l border-stone-100 pl-4 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setQuoteItems([{ ...item, id: Date.now(), name: `${item.name} (Kopia)` }, ...quoteItems])} className="text-stone-400 hover:text-green-600 transition-colors"><Copy size={16}/></button>
                        <button onClick={() => { setEditingId(item.id); setCurrentFurniture({...item}); setBuilderStep(1); setActiveTab('builder'); }} className="text-stone-400 hover:text-stone-800 transition-colors"><Edit2 size={16}/></button>
                        <button onClick={() => setQuoteItems(quoteItems.filter(i => i.id !== item.id))} className="text-stone-400 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {calculatedQuoteItems.length === 0 && (
                <div className="py-16 text-center bg-white border-2 border-dashed border-stone-200 rounded-3xl">
                  <Calculator size={48} className="mx-auto mb-4 text-stone-300" />
                  <p className="font-bold text-stone-400 uppercase tracking-widest text-sm">Lista wyceny jest pusta</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm space-y-5">
                 <h3 className="text-xs font-black text-stone-800 uppercase tracking-widest flex justify-between items-center border-b border-stone-100 pb-3">Dodatkowe Usługi i Koszty</h3>
                 <div className="flex gap-2 flex-wrap">
                   {['okap', 'zlew', 'plata'].map(s => (
                     <button key={s} onClick={() => setExtraServices(p => ({...p, [s]: !p[s]}))} className={`px-4 py-2.5 rounded-xl border-2 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 ${extraServices[s] ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-500 hover:bg-stone-50 border-stone-200'}`}>{extraServices[s] ? <CheckSquare size={16}/> : <Square size={16}/>} Montaż: {s}</button>
                   ))}
                 </div>
                 <div className="flex gap-3 items-center bg-stone-50 p-3 rounded-2xl border border-stone-200">
                    <span className="text-xs font-bold text-stone-500 whitespace-nowrap pl-2">Inna usługa:</span>
                    <input type="text" placeholder="Nazwa..." className="flex-1 bg-white p-2.5 rounded-xl text-sm font-bold border border-stone-200 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-100" value={extraServices.customName} onChange={e => setExtraServices({...extraServices, customName: e.target.value})} />
                    <input type="number" placeholder="Cena zł" className="w-28 bg-white p-2.5 rounded-xl text-sm text-center font-black text-stone-800 border border-stone-200 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-100" value={extraServices.customValue || ''} onChange={e => setExtraServices({...extraServices, customValue: Number(e.target.value)})} />
                 </div>
                 <div className="flex justify-between items-center pt-2">
                    <span className="text-xs font-black text-amber-700 uppercase tracking-wider flex items-center gap-2"><Truck size={16}/> Faktura Hurtownia</span>
                    <div className="relative">
                      <input type="number" placeholder="0" className="w-36 bg-amber-50 p-3 pr-8 rounded-xl text-right font-black text-amber-900 border border-amber-100 outline-none focus:ring-2 focus:ring-amber-200" value={wholesaleExtraCost || ''} onChange={e => setWholesaleExtraCost(Number(e.target.value))} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-700 font-bold text-xs">zł</span>
                    </div>
                 </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm space-y-5">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <h3 className="font-black text-xs text-stone-700 uppercase tracking-widest flex items-center gap-2"><Palette size={16} /> Wykończenie frontów</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[{ id: 'standard', name: 'Standard (Płyta)' }, { id: 'mat', name: 'Lakier Matowy' }, { id: 'lakier', name: 'Lakier Połysk' }, { id: 'ryflowany', name: 'MDF Ryflowany' }].map(f => (
                    <button key={f.id} onClick={() => setGlobalFrontType(f.id)} className={`py-4 px-3 rounded-2xl border-2 text-[11px] font-black uppercase tracking-widest transition-all flex flex-col items-center justify-center gap-2 ${globalFrontType === f.id ? 'border-stone-600 bg-stone-100 text-stone-900 shadow-sm' : 'border-stone-200 bg-white text-stone-400 hover:bg-stone-50 hover:border-stone-300'}`}>
                      {globalFrontType === f.id ? <CheckCircle2 size={20} className="text-stone-700"/> : <div className="w-5 h-5 rounded-full border-2 border-stone-300" />} {f.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-stone-900 text-white p-8 sm:p-10 rounded-[40px] shadow-2xl flex flex-col sm:flex-row justify-between items-center gap-6 relative overflow-hidden">
               <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
               <div className="z-10 w-full text-center sm:text-left">
                  <p className="text-stone-400 text-xs font-black uppercase tracking-widest mb-2">Do zapłaty całkowitej przez Klienta</p>
                  <h2 className="text-5xl font-black tracking-tighter">{finalProjectTotal.toLocaleString()} <span className="text-3xl text-stone-500">PLN</span></h2>
                  <div className="mt-4 flex flex-wrap gap-4 justify-center sm:justify-start">
                    <div className="bg-stone-800/50 px-4 py-2 rounded-xl text-xs font-bold text-stone-300 uppercase tracking-wider border border-stone-700/50">Suma Robocizny: <span className="text-white ml-1">{finalSplit.totalLabor.toLocaleString()} zł</span></div>
                    <div className="bg-stone-800/50 px-4 py-2 rounded-xl text-xs font-bold text-stone-300 uppercase tracking-wider border border-stone-700/50">Suma Materiałów: <span className="text-white ml-1">{finalSplit.totalMaterials.toLocaleString()} zł</span></div>
                  </div>
               </div>
            </div>
          </div>
        )}

        {/* --- 2. ZAKŁADKA FORMATKI --- */}
        {activeTab === 'materials' && (
          <div className="space-y-6 animate-in fade-in">
             <h2 className="text-2xl font-black tracking-tight text-stone-800">Zestawienie Materiałowe</h2>
             <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm text-center flex flex-col items-center justify-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-stone-500"></div><Layers className="mb-3 text-stone-600" size={32}/>
                  <div className="text-3xl font-black text-stone-800">{materialTotals.plateM2.toFixed(2)}</div>
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-2">Płyta korpusowa (m²)</p>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm text-center flex flex-col items-center justify-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-stone-700"></div><Layout className="mb-3 text-stone-700" size={32}/>
                  <div className="text-3xl font-black text-stone-800">{materialTotals.frontM2.toFixed(2)}</div>
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-2">Fronty ({globalFrontType}) (m²)</p>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm text-center flex flex-col items-center justify-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-amber-600"></div><Scissors className="mb-3 text-amber-600" size={32}/>
                  <div className="text-3xl font-black text-stone-800">{materialTotals.cutting.toFixed(1)}</div>
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-2">Cięcie płyty (mb)</p>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm text-center flex flex-col items-center justify-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-green-500"></div><Ruler className="mb-3 text-green-500" size={32}/>
                  <div className="text-3xl font-black text-stone-800">{materialTotals.edging.toFixed(1)}</div>
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-2">Okleinowanie (mb)</p>
                </div>
             </div>
          </div>
        )}

        {/* --- 3. ZAKŁADKA OKUCIA I MATERIAŁY --- */}
        {activeTab === 'hardware' && (
          <div className="flex flex-col lg:flex-row gap-6 animate-in fade-in">
             <div className="w-full lg:w-3/5 space-y-6">
               
               {/* SEKCA: BAZA OKUĆ */}
               <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
                 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                   <h2 className="text-2xl font-black text-stone-800 flex items-center gap-3"><Wrench className="text-stone-800" size={24} /> Baza Okuć</h2>
                   <button onClick={() => setShowAddGlobalModal(true)} className="bg-stone-100 text-stone-800 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-stone-200 transition-colors"><Plus size={16}/> Dodaj okucie</button>
                 </div>
                 <div className="relative mb-6">
                   <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={18}/>
                   <input type="text" placeholder="Szukaj okuć..." className="w-full pl-12 pr-4 py-3 bg-stone-50 rounded-2xl text-sm font-bold border-none outline-none focus:ring-2 focus:ring-stone-200 placeholder:text-stone-400" value={searchHardware} onChange={(e) => setSearchHardware(e.target.value)} />
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-2 pb-2 custom-scrollbar">
                   {globalHardwareDb.filter(h => (h.name || '').toLowerCase().includes(searchHardware.toLowerCase())).map(hw => (
                     <div key={hw.id} className="border-2 border-stone-100 p-4 rounded-2xl flex flex-col justify-between hover:border-stone-300 transition-colors bg-white group">
                       <div>
                         <div className="flex justify-between items-start mb-3">
                           <p className="text-[9px] uppercase font-black text-stone-600 tracking-widest bg-stone-100 px-2 py-1 rounded-md">{hw.category}</p>
                           <button onClick={() => requestConfirm("Usuń okucie", `Usunąć ${hw.name} z bazy?`, async () => await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'hardware_db', hw.id)))} className="text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16}/></button>
                         </div>
                         <div className="flex gap-3 items-center">
                           {hw.imageUrl ? (
                             <img src={hw.imageUrl} alt={hw.name} className="w-10 h-10 rounded-lg object-cover border border-stone-200" />
                           ) : (
                             <div className="w-10 h-10 rounded-lg bg-stone-50 flex items-center justify-center text-stone-300 border border-stone-200">
                               <Wrench size={18} />
                             </div>
                           )}
                           <div>
                             <h3 className="font-bold text-sm text-stone-800 leading-tight">
                               {hw.linkUrl ? (
                                 <a href={hw.linkUrl} target="_blank" rel="noopener noreferrer" className="hover:text-stone-600 hover:underline flex items-center gap-1 transition-colors">
                                   {hw.name} <ExternalLink size={12}/>
                                 </a>
                               ) : hw.name}
                             </h3>
                             <p className="text-stone-700 font-black text-sm mt-1">{hw.unitPrice} zł <span className="text-stone-400 text-[9px] font-bold uppercase">/ szt</span></p>
                           </div>
                         </div>
                       </div>
                       <div className="mt-4 pt-3 border-t border-stone-100">
                         <button onClick={() => {const idx = hardwareItems.findIndex(i => i.globalId === hw.id); if(idx >= 0){let arr = [...hardwareItems]; arr[idx].quantity++; setHardwareItems(arr);} else {setHardwareItems([{...hw, globalId: hw.id, id: Date.now(), quantity: 1}, ...hardwareItems]);}}} className="w-full bg-stone-800 text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-stone-900 transition-colors">Dodaj do projektu</button>
                       </div>
                     </div>
                   ))}
                 </div>
               </div>

               {/* SEKCA: BAZA MATERIAŁÓW */}
               <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
                 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                   <h2 className="text-2xl font-black text-stone-800 flex items-center gap-3"><Package className="text-stone-800" size={24} /> Baza Materiałów</h2>
                   <button onClick={() => setShowAddMaterialModal(true)} className="bg-stone-100 text-stone-800 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-stone-200 transition-colors"><Plus size={16}/> Dodaj materiał</button>
                 </div>
                 <div className="relative mb-6">
                   <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={18}/>
                   <input type="text" placeholder="Szukaj materiałów (nazwa lub kategoria)..." className="w-full pl-12 pr-4 py-3 bg-stone-50 rounded-2xl text-sm font-bold border-none outline-none focus:ring-2 focus:ring-stone-200 placeholder:text-stone-400" value={searchMaterial} onChange={(e) => setSearchMaterial(e.target.value)} />
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-2 pb-2 custom-scrollbar">
                   {globalMaterialsDb.filter(m => (m.name || '').toLowerCase().includes(searchMaterial.toLowerCase()) || (m.category || '').toLowerCase().includes(searchMaterial.toLowerCase())).map(mat => {
                     const isAdded = projectMaterials.some(pm => pm.globalId === mat.id);
                     return (
                       <div key={mat.id} className="border-2 border-stone-100 p-4 rounded-2xl flex flex-col justify-between hover:border-stone-300 transition-colors bg-white group">
                         <div>
                           <div className="flex justify-between items-start mb-3">
                             <p className="text-[9px] uppercase font-black text-stone-600 tracking-widest bg-stone-100 px-2 py-1 rounded-md">{mat.category}</p>
                             <button onClick={() => requestConfirm("Usuń materiał", `Usunąć ${mat.name} z bazy?`, async () => await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'materials_db', mat.id)))} className="text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16}/></button>
                           </div>
                           <div className="flex gap-3 items-center">
                             {mat.imageUrl ? (
                               <img src={mat.imageUrl} alt={mat.name} className="w-10 h-10 rounded-lg object-cover border border-stone-200" />
                             ) : (
                               <div className="w-10 h-10 rounded-lg bg-stone-50 flex items-center justify-center text-stone-300 border border-stone-200">
                                 <ImageIcon size={18} />
                               </div>
                             )}
                             <h3 className="font-bold text-sm text-stone-800 leading-tight">
                               {mat.linkUrl ? (
                                 <a href={mat.linkUrl} target="_blank" rel="noopener noreferrer" className="hover:text-stone-600 hover:underline flex items-center gap-1 transition-colors">
                                   {mat.name} <ExternalLink size={12}/>
                                 </a>
                               ) : mat.name}
                             </h3>
                           </div>
                         </div>
                         <div className="mt-4 pt-3 border-t border-stone-100">
                           <button 
                             disabled={isAdded}
                             onClick={() => setProjectMaterials([...projectMaterials, {...mat, globalId: mat.id}])} 
                             className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${isAdded ? 'bg-green-100 text-green-700' : 'bg-stone-800 text-white shadow-sm hover:bg-stone-900'}`}
                           >
                             {isAdded ? 'Wybrano do projektu' : 'Wybierz materiał'}
                           </button>
                         </div>
                       </div>
                     )
                   })}
                 </div>
               </div>

             </div>
             
             {/* PRAWY PANEL - WYBRANE ELEMENTY */}
             <div className="w-full lg:w-2/5 flex flex-col gap-6">
               
               {/* Podsumowanie Okuć */}
               <div className="bg-stone-100 p-6 rounded-3xl border border-stone-200">
                 <h2 className="text-sm font-black text-stone-800 mb-4 flex justify-between items-center uppercase tracking-tight">
                   Wybrane Okucia <span className="bg-stone-800 text-white px-3 py-1 rounded-xl text-xs shadow-sm">{hardwareTotalSum.toLocaleString()} zł</span>
                 </h2>
                 <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                   {hardwareItems.map(item => (
                     <div key={item.id} className="bg-white p-3 rounded-2xl flex justify-between items-center shadow-sm border border-stone-200">
                       <div className="flex gap-3 items-center flex-1 pr-2">
                         {item.imageUrl ? (
                           <img src={item.imageUrl} alt={item.name} className="w-8 h-8 rounded-md object-cover border border-stone-200" />
                         ) : (
                           <div className="w-8 h-8 rounded-md bg-stone-50 flex items-center justify-center text-stone-300 border border-stone-200">
                             <Wrench size={14} />
                           </div>
                         )}
                         <div>
                           <p className="text-[8px] font-bold text-stone-400 uppercase mb-0.5">{item.category}</p>
                           <h4 className="font-bold text-xs text-stone-800 leading-tight">
                             {item.linkUrl ? (
                               <a href={item.linkUrl} target="_blank" rel="noopener noreferrer" className="hover:text-stone-600 hover:underline flex items-center gap-1">
                                 {item.name}
                               </a>
                             ) : item.name}
                           </h4>
                           <div className="text-stone-800 font-black text-xs mt-0.5">{(item.quantity * item.unitPrice).toLocaleString()} zł</div>
                         </div>
                       </div>
                       <div className="flex items-center gap-1 bg-stone-50 p-1 rounded-xl border border-stone-200">
                         <button onClick={() => setHardwareItems(hardwareItems.map(i => i.id === item.id ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i))} className="p-1 bg-white text-stone-500 rounded-lg hover:text-stone-800"><Minus size={12}/></button>
                         <span className="text-xs font-black w-6 text-center text-stone-800">{item.quantity}</span>
                         <button onClick={() => setHardwareItems(hardwareItems.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i))} className="p-1 bg-white text-stone-500 rounded-lg hover:text-stone-800"><Plus size={12}/></button>
                         <button onClick={() => setHardwareItems(hardwareItems.filter(i => i.id !== item.id))} className="text-stone-300 hover:text-red-500 ml-1 p-1"><X size={14}/></button>
                       </div>
                     </div>
                   ))}
                   {hardwareItems.length === 0 && <div className="text-center py-6 bg-white border-2 border-dashed border-stone-200 rounded-2xl text-[10px] font-bold text-stone-400 uppercase tracking-widest">Brak okuć</div>}
                 </div>
               </div>

               {/* Podsumowanie Materiałów */}
               <div className="bg-stone-100 p-6 rounded-3xl border border-stone-200">
                 <h2 className="text-sm font-black text-stone-800 mb-4 flex justify-between items-center uppercase tracking-tight">
                   Wybrane Materiały <span className="bg-stone-800 text-white px-3 py-1 rounded-xl text-xs shadow-sm">{projectMaterials.length} szt.</span>
                 </h2>
                 <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                   {projectMaterials.map(item => (
                     <div key={item.globalId} className="bg-white p-3 rounded-2xl flex justify-between items-center shadow-sm border border-stone-200">
                       <div className="flex gap-3 items-center flex-1">
                         {item.imageUrl ? (
                           <img src={item.imageUrl} alt={item.name} className="w-8 h-8 rounded-md object-cover border border-stone-200" />
                         ) : (
                           <div className="w-8 h-8 rounded-md bg-stone-50 flex items-center justify-center text-stone-300 border border-stone-200">
                             <ImageIcon size={14} />
                           </div>
                         )}
                         <div>
                           <p className="text-[8px] font-bold text-stone-400 uppercase mb-0.5">{item.category}</p>
                           <h4 className="font-bold text-xs text-stone-800 leading-tight">
                             {item.linkUrl ? (
                               <a href={item.linkUrl} target="_blank" rel="noopener noreferrer" className="hover:text-stone-600 hover:underline flex items-center gap-1">
                                 {item.name}
                               </a>
                             ) : item.name}
                           </h4>
                         </div>
                       </div>
                       <button onClick={() => setProjectMaterials(projectMaterials.filter(i => i.globalId !== item.globalId))} className="text-stone-300 hover:text-red-500 p-2"><X size={16}/></button>
                     </div>
                   ))}
                   {projectMaterials.length === 0 && <div className="text-center py-6 bg-white border-2 border-dashed border-stone-200 rounded-2xl text-[10px] font-bold text-stone-400 uppercase tracking-widest">Brak materiałów</div>}
                 </div>
               </div>

             </div>
          </div>
        )}

        {/* --- 4. ZAKŁADKA CENNIK --- */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto bg-white p-8 sm:p-12 rounded-[40px] border border-stone-200 shadow-xl space-y-8 animate-in zoom-in-95">
             <div className="text-center">
               <div className="bg-stone-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"><Settings className="text-stone-800" size={32}/></div>
               <h2 className="text-3xl font-black text-stone-800 tracking-tight">Cennik Główny</h2>
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-stone-100">
               <div className="sm:col-span-2 bg-stone-50 p-6 rounded-3xl border border-stone-200">
                 <h3 className="text-xs font-black uppercase tracking-widest text-stone-800 mb-4">Robocizna i Czas</h3>
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                   <div><label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-2">Czas (h/szafkę)</label><input type="number" className="w-full p-4 bg-white rounded-xl font-black text-stone-800 border border-stone-200 outline-none focus:ring-2 focus:ring-stone-200" value={baseSettings.baseHoursPerItem} onChange={e => setBaseSettings({...baseSettings, baseHoursPerItem: Number(e.target.value)})} /></div>
                   <div><label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-2">Stawka (zł/h)</label><input type="number" className="w-full p-4 bg-white rounded-xl font-black text-stone-800 border border-stone-200 outline-none focus:ring-2 focus:ring-stone-200" value={baseSettings.laborRate} onChange={e => setBaseSettings({...baseSettings, laborRate: Number(e.target.value)})} /></div>
                   <div><label className="text-[10px] font-bold text-green-600 uppercase tracking-widest block mb-2">Rabat (%)</label><input type="number" className="w-full p-4 bg-green-50 text-green-700 border border-green-200 rounded-xl font-black outline-none focus:ring-2 focus:ring-green-300" value={baseSettings.laborDiscount} onChange={e => setBaseSettings({...baseSettings, laborDiscount: Number(e.target.value)})} /></div>
                 </div>
               </div>
               <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
                 <div className="space-y-4"><h3 className="text-xs font-black uppercase tracking-widest text-amber-700 border-b border-stone-200 pb-2">Materiały i Usługi</h3>
                    <div><label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest flex justify-between">Cena blatu <span>zł/mb</span></label><input type="number" className="w-full mt-1.5 p-3 bg-stone-100 text-stone-900 rounded-xl font-black border border-stone-300" value={baseSettings.countertopPriceMb} onChange={e => setBaseSettings({...baseSettings, countertopPriceMb: Number(e.target.value)})} /></div>
                    <div><label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest flex justify-between">Płyta korp. <span>zł/m²</span></label><input type="number" className="w-full mt-1.5 p-3 bg-stone-50 rounded-xl font-bold border border-stone-200" value={baseSettings.platePriceM2} onChange={e => setBaseSettings({...baseSettings, platePriceM2: Number(e.target.value)})} /></div>
                    <div><label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest flex justify-between">Cięcie <span>zł/mb</span></label><input type="number" className="w-full mt-1.5 p-3 bg-stone-50 rounded-xl font-bold border border-stone-200" value={baseSettings.cuttingPriceMb} onChange={e => setBaseSettings({...baseSettings, cuttingPriceMb: Number(e.target.value)})} /></div>
                    <div><label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest flex justify-between">Oklejanie <span>zł/mb</span></label><input type="number" className="w-full mt-1.5 p-3 bg-stone-50 rounded-xl font-bold border border-stone-200" value={baseSettings.edgingPriceMb} onChange={e => setBaseSettings({...baseSettings, edgingPriceMb: Number(e.target.value)})} /></div>
                 </div>
                 <div className="space-y-4"><h3 className="text-xs font-black uppercase tracking-widest text-stone-600 border-b border-stone-200 pb-2">Ceny frontów</h3>
                    <div><label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest flex justify-between">Standard <span>zł/m²</span></label><input type="number" className="w-full mt-1.5 p-3 bg-stone-50 rounded-xl font-bold border border-stone-200" value={baseSettings.frontStandardPriceM2} onChange={e => setBaseSettings({...baseSettings, frontStandardPriceM2: Number(e.target.value)})} /></div>
                    <div><label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest flex justify-between">Lakier Mat <span>zł/m²</span></label><input type="number" className="w-full mt-1.5 p-3 bg-stone-50 rounded-xl font-bold border border-stone-200" value={baseSettings.frontMatPriceM2} onChange={e => setBaseSettings({...baseSettings, frontMatPriceM2: Number(e.target.value)})} /></div>
                    <div><label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest flex justify-between">Lakier Połysk <span>zł/m²</span></label><input type="number" className="w-full mt-1.5 p-3 bg-stone-50 rounded-xl font-bold border border-stone-200" value={baseSettings.frontLakierPriceM2} onChange={e => setBaseSettings({...baseSettings, frontLakierPriceM2: Number(e.target.value)})} /></div>
                    <div><label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest flex justify-between">Ryflowany <span>zł/m²</span></label><input type="number" className="w-full mt-1.5 p-3 bg-stone-50 rounded-xl font-bold border border-stone-200" value={baseSettings.frontRyflowanyPriceM2} onChange={e => setBaseSettings({...baseSettings, frontRyflowanyPriceM2: Number(e.target.value)})} /></div>
                 </div>
               </div>
             </div>
             <button onClick={() => setActiveTab('summary')} className="w-full py-5 mt-6 bg-stone-800 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-stone-200 hover:bg-stone-900 transition-all">Zapisz ustawienia</button>
          </div>
        )}

        {/* --- 5. ZAKŁADKA ARCHIWUM --- */}
        {activeTab === 'projects' && (
          <div className="space-y-6 animate-in fade-in">
             <div className="flex items-center gap-3 mb-8">
               <div className="bg-stone-200 p-2 rounded-xl text-stone-800"><FolderOpen size={24}/></div>
               <h2 className="text-2xl font-black tracking-tight text-stone-800">Archiwum wycen</h2>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
               {cloudProjects.map(proj => (
                 <div key={proj.id} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm hover:border-stone-400 hover:shadow-md transition-all flex flex-col justify-between group">
                   <div>
                     <div className="flex justify-between items-start mb-4">
                       <div className="bg-stone-100 px-3 py-1 rounded-lg text-[10px] font-black uppercase text-stone-800 tracking-widest">Projekt zapisany</div>
                       <button onClick={() => requestConfirm("Usuń Projekt", `Czy usunąć bezpowrotnie wycenę ${proj.name}?`, async () => await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'projects', proj.id)))} className="text-stone-300 hover:text-red-500 bg-stone-50 hover:bg-red-50 p-2 rounded-xl transition-colors"><Trash2 size={16}/></button>
                     </div>
                     <h3 className="font-black text-xl text-stone-800 leading-tight">{proj.name}</h3>
                     <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-2">Elementów: {proj.items?.length || 0}</p>
                   </div>
                   <button onClick={() => loadProject(proj)} className="w-full mt-6 py-3.5 bg-stone-100 text-stone-800 rounded-xl font-black text-xs uppercase tracking-widest group-hover:bg-stone-800 group-hover:text-white transition-colors">Wczytaj do edytora</button>
                 </div>
               ))}
               {cloudProjects.length === 0 && (
                 <div className="col-span-full py-20 text-center flex flex-col items-center">
                   <div className="bg-white p-6 rounded-full shadow-sm border border-stone-200 mb-4"><FolderOpen size={48} className="text-stone-300"/></div>
                   <h3 className="font-black text-stone-400 text-lg">Brak zapisanych projektów</h3>
                 </div>
               )}
             </div>
          </div>
        )}

        {/* --- 6. ZAKŁADKA OFERTA --- */}
        {activeTab === 'offer' && (
          <div className="flex flex-col lg:flex-row gap-6 animate-in fade-in">
            {/* Panel konfiguracyjny - lewa strona */}
            <div className="w-full lg:w-1/3 space-y-4">
              <div className="bg-white p-8 rounded-[32px] border border-stone-200 shadow-sm sticky top-24">
                 <h2 className="text-xl font-black mb-6 tracking-tight flex items-center gap-2">
                   <FileText className="text-stone-800"/> Ustawienia Oferty
                 </h2>
                 
                 <div className="mb-4">
                   <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest block mb-2 ml-1">Nazwa Klienta / Inwestycji</label>
                   <input type="text" placeholder="np. Jan Kowalski" className="w-full p-4 bg-stone-50 rounded-2xl text-sm font-bold border-2 border-transparent outline-none focus:border-stone-200 focus:bg-white transition-colors" value={offerConfig.clientName} onChange={e => setOfferConfig({...offerConfig, clientName: e.target.value})} />
                 </div>
                 
                 <div className="mb-4">
                   <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest block mb-2 ml-1">Przybliżony Termin Realizacji (Opcjonalnie)</label>
                   <input type="text" placeholder="np. 4-6 tygodni" className="w-full p-4 bg-stone-50 rounded-2xl text-sm font-bold border-2 border-transparent outline-none focus:border-stone-200 focus:bg-white transition-colors" value={offerConfig.estimatedDelivery} onChange={e => setOfferConfig({...offerConfig, estimatedDelivery: e.target.value})} />
                 </div>

                 <div className="mb-6">
                   <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest block mb-2 ml-1">Długość standardowa blatu (mm)</label>
                   <input type="number" placeholder="4100" className="w-full p-4 bg-stone-50 rounded-2xl text-sm font-bold border-2 border-transparent outline-none focus:border-stone-200 focus:bg-white transition-colors" value={offerConfig.countertopStandardLength} onChange={e => setOfferConfig({...offerConfig, countertopStandardLength: Number(e.target.value)})} />
                 </div>
                 
                 <div className="space-y-3 mb-6 border-t border-stone-100 pt-6">
                    <label className="flex items-center justify-between p-4 bg-stone-50 hover:bg-stone-100 rounded-2xl cursor-pointer transition-colors">
                      <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">Zestawienie Materiałów</span>
                      <div className={`w-10 h-6 rounded-full relative transition-colors ${offerConfig.includeMaterials ? 'bg-stone-800' : 'bg-stone-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${offerConfig.includeMaterials ? 'left-5' : 'left-1'}`}></div></div>
                      <input type="checkbox" className="hidden" checked={offerConfig.includeMaterials} onChange={e => setOfferConfig({...offerConfig, includeMaterials: e.target.checked})}/>
                    </label>

                    <label className="flex items-center justify-between p-4 bg-stone-50 hover:bg-stone-100 rounded-2xl cursor-pointer transition-colors">
                      <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">Pokaż szczegółowe ceny</span>
                      <div className={`w-10 h-6 rounded-full relative transition-colors ${offerConfig.includeDetailedPrices ? 'bg-stone-800' : 'bg-stone-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${offerConfig.includeDetailedPrices ? 'left-5' : 'left-1'}`}></div></div>
                      <input type="checkbox" className="hidden" checked={offerConfig.includeDetailedPrices} onChange={e => setOfferConfig({...offerConfig, includeDetailedPrices: e.target.checked})}/>
                    </label>

                    <label className="flex items-center justify-between p-4 bg-stone-50 hover:bg-stone-100 rounded-2xl cursor-pointer transition-colors">
                      <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">Pokaż listę okuć</span>
                      <div className={`w-10 h-6 rounded-full relative transition-colors ${offerConfig.includeHardware ? 'bg-stone-800' : 'bg-stone-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${offerConfig.includeHardware ? 'left-5' : 'left-1'}`}></div></div>
                      <input type="checkbox" className="hidden" checked={offerConfig.includeHardware} onChange={e => setOfferConfig({...offerConfig, includeHardware: e.target.checked})}/>
                    </label>
                    
                    <label className="flex items-center justify-between p-4 bg-stone-50 hover:bg-stone-100 rounded-2xl cursor-pointer transition-colors">
                      <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">Pokaż usługi montażu</span>
                      <div className={`w-10 h-6 rounded-full relative transition-colors ${offerConfig.includeServices ? 'bg-stone-800' : 'bg-stone-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${offerConfig.includeServices ? 'left-5' : 'left-1'}`}></div></div>
                      <input type="checkbox" className="hidden" checked={offerConfig.includeServices} onChange={e => setOfferConfig({...offerConfig, includeServices: e.target.checked})}/>
                    </label>
                 </div>

                 {/* SEKCJA GENEROWANIA LINKU */}
                 <div className="mt-8 pt-6 border-t border-stone-100">
                    <button 
                      onClick={handleGenerateLink} disabled={isGeneratingLink || offerItems.length === 0}
                      className="w-full py-4 bg-stone-800 text-white rounded-xl font-black text-sm uppercase tracking-widest flex justify-center gap-2 items-center shadow-md disabled:opacity-50 hover:bg-stone-900 transition-colors"
                    >
                      {isGeneratingLink ? <Loader2 className="animate-spin" size={18}/> : <LinkIcon size={18}/>} Generuj link dla Klienta
                    </button>

                    {shareLink && (
                      <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl animate-in fade-in slide-in-from-top-2">
                         <p className="text-[10px] font-black text-green-800 uppercase tracking-widest mb-2 text-center">Gotowy link (oferta zamrożona)</p>
                         <div className="flex flex-col gap-2">
                           <input type="text" readOnly value={shareLink} className="w-full p-3 rounded-lg text-xs font-medium border border-green-200 bg-white text-stone-600 outline-none text-center"/>
                           <button onClick={copyToClipboard} className="w-full py-3 bg-green-600 text-white rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-green-700 transition-colors flex justify-center items-center gap-2">
                             {linkCopied ? <><CheckCircle2 size={16}/> Skopiowano</> : 'Kopiuj Link'}
                           </button>
                         </div>
                      </div>
                    )}
                 </div>
              </div>
            </div>
            
            {/* Podgląd Oferty - prawa strona */}
            <div className="w-full lg:w-2/3 bg-stone-200 p-4 sm:p-8 rounded-[40px] shadow-inner overflow-x-auto">
               <div id="offer-content" className="bg-white text-stone-900 shadow-xl mx-auto rounded-lg overflow-hidden" style={{ padding: '60px', maxWidth: '800px', width: '100%', boxSizing: 'border-box', minHeight: '1000px' }}>
                  
                  {/* Nagłówek Dokumentu */}
                  <div className="border-b-4 border-stone-900 pb-8 mb-10">
                    <div className="flex justify-between items-start">
                      <div>
                        <h1 className="text-4xl font-black uppercase tracking-tighter text-stone-900">Oferta Kosztowa</h1>
                        <p className="font-bold text-stone-500 mt-2 uppercase tracking-widest text-sm">{currentProjectName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">Data Wystawienia</p>
                        <p className="font-bold text-stone-800 bg-stone-100 px-3 py-1 rounded-md capitalize">{new Date().toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}</p>
                      </div>
                    </div>
                    <div className="mt-8 flex flex-wrap gap-4">
                      {offerConfig.clientName && (
                        <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 flex-1 min-w-[200px]">
                          <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">Przygotowano dla</p>
                          <p className="text-xl font-black text-stone-800">{offerConfig.clientName}</p>
                        </div>
                      )}
                      {offerConfig.estimatedDelivery && (
                        <div className="bg-stone-100 p-4 rounded-xl border border-stone-300 flex-1 min-w-[200px]">
                          <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1">Szacowany Termin Realizacji</p>
                          <p className="text-xl font-black text-stone-900">{offerConfig.estimatedDelivery}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Zestawienie Użytych Materiałów (Nowość) */}
                  {offerConfig.includeMaterials && projectMaterials.length > 0 && (
                    <RenderMaterialsOfferSection materials={projectMaterials} />
                  )}

                  {/* Tabela Mebli */}
                  <div className="mb-10">
                    <h3 className="text-sm font-black text-stone-800 uppercase tracking-widest mb-4 border-l-4 border-stone-800 pl-3">Zestawienie Elementów Projektu</h3>
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b-2 border-stone-200 bg-stone-50">
                          <th className="py-3 px-4 text-[10px] font-black uppercase text-stone-500 tracking-wider rounded-tl-lg">Lp.</th>
                          <th className="py-3 px-4 text-[10px] font-black uppercase text-stone-500 tracking-wider">Opis Elementu</th>
                          <th className={`py-3 px-4 text-[10px] font-black uppercase text-stone-500 tracking-wider text-center ${!offerConfig.includeDetailedPrices ? 'rounded-tr-lg' : ''}`}>Wymiary WxSxG / Długość</th>
                          {offerConfig.includeDetailedPrices && <th className="py-3 px-4 text-[10px] font-black uppercase text-stone-500 tracking-wider text-right rounded-tr-lg">Wartość Netto</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {offerItems.length > 0 ? (
                          offerItems.map((item, index) => (
                            <tr key={item.id} className="border-b border-stone-100">
                              <td className="py-4 px-4 font-bold text-stone-400">{index + 1}.</td>
                              <td className="py-4 px-4">
                                <span className="font-bold text-stone-800 text-base">{item.name}</span>
                                <div className="text-[10px] text-stone-500 font-medium uppercase tracking-widest mt-1">{getCategoryName(item)}</div>
                              </td>
                              <td className="py-4 px-4 text-center font-medium text-stone-600">{getDimString(item)}</td>
                              {offerConfig.includeDetailedPrices && <td className="py-4 px-4 font-black text-right text-stone-800 whitespace-nowrap">{item.totalPrice.toLocaleString()} zł</td>}
                            </tr>
                          ))
                        ) : (<tr><td colSpan={offerConfig.includeDetailedPrices ? "4" : "3"} className="py-8 text-center text-stone-400 text-xs font-bold uppercase tracking-widest">Brak wybranych elementów do oferty</td></tr>)}
                      </tbody>
                    </table>
                  </div>

                  {/* Podsumowanie Blatów (jeśli są) */}
                  {offerItems.some(i => i.category === 'blat') && (
                    <div className="mb-10 page-break-inside-avoid">
                      <h3 className="text-sm font-black text-stone-800 uppercase tracking-widest mb-4 border-l-4 border-stone-800 pl-3">Zestawienie Blatów Roboczych</h3>
                      <div className="bg-stone-50 p-4 sm:p-6 rounded-2xl border border-stone-200 flex justify-between items-center">
                         <div>
                           <p className="font-bold text-stone-800">Szacowana ilość blatów do zamówienia</p>
                           <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Zakładana długość 1 szt. blatu: {offerConfig.countertopStandardLength} mm</p>
                         </div>
                         <div className="text-right">
                           <div className="text-3xl font-black text-stone-800">
                             {Math.ceil(offerItems.reduce((acc, item) => item.category === 'blat' ? acc + (item.raw?.countertopMb || 0) : acc, 0) / (offerConfig.countertopStandardLength / 1000))} szt.
                           </div>
                           <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-1">
                             Długość bieżąca w projekcie: {offerItems.reduce((acc, item) => item.category === 'blat' ? acc + (item.raw?.countertopMb || 0) : acc, 0).toFixed(2)} mb
                           </p>
                         </div>
                      </div>
                    </div>
                  )}

                  {/* Tabela Okuć (Opcjonalna) */}
                  {offerConfig.includeHardware && hardwareItems.length > 0 && (
                    <div className="mb-10 page-break-inside-avoid">
                      <h3 className="text-sm font-black text-stone-800 uppercase tracking-widest mb-4 border-l-4 border-stone-800 pl-3">Wyszczególnienie Okuć i Akcesoriów</h3>
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="border-b-2 border-stone-200 bg-stone-50">
                            <th className="py-3 px-4 text-[10px] font-black uppercase text-stone-500 tracking-wider rounded-tl-lg">Kategoria</th>
                            <th className="py-3 px-4 text-[10px] font-black uppercase text-stone-500 tracking-wider">Zdjęcie i Nazwa</th>
                            <th className={`py-3 px-4 text-[10px] font-black uppercase text-stone-500 tracking-wider text-center ${!offerConfig.includeDetailedPrices ? 'rounded-tr-lg' : ''}`}>Ilość</th>
                            {offerConfig.includeDetailedPrices && <th className="py-3 px-4 text-[10px] font-black uppercase text-stone-500 tracking-wider text-right rounded-tr-lg">Wartość Netto</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {hardwareItems.map((item, index) => (
                            <tr key={item.id} className="border-b border-stone-100">
                              <td className="py-4 px-4 text-[10px] font-bold text-stone-400 uppercase">{item.category}</td>
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-3">
                                  {item.imageUrl ? (
                                    <img src={item.imageUrl} alt={item.name} className="w-10 h-10 rounded-md object-cover border border-stone-200" />
                                  ) : (
                                    <div className="w-10 h-10 rounded-md bg-stone-50 flex items-center justify-center text-stone-300 border border-stone-200">
                                      <Wrench size={16} />
                                    </div>
                                  )}
                                  {item.linkUrl ? (
                                    <a href={item.linkUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-stone-800 hover:text-stone-600 hover:underline flex items-center gap-1 transition-colors">
                                      {item.name} <ExternalLink size={14} className="opacity-75"/>
                                    </a>
                                  ) : (
                                    <span className="font-bold text-stone-800">{item.name}</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-4 px-4 text-center font-bold text-stone-600 bg-stone-50">{item.quantity} szt.</td>
                              {offerConfig.includeDetailedPrices && <td className="py-4 px-4 font-black text-right text-stone-700 whitespace-nowrap">{(item.quantity * item.unitPrice).toLocaleString()} zł</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Podsumowanie i Koszty Całkowite */}
                  <div className="flex justify-end pt-8 mt-12 border-t-2 border-stone-200 page-break-inside-avoid">
                    <div className="w-full md:w-2/3 bg-stone-50 p-6 rounded-2xl">
                      <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-4 text-right">Podsumowanie Kosztów</h3>
                      <div className="space-y-3 mb-6">
                        <div className="flex justify-between text-sm font-bold text-stone-600"><span>Suma Wartości Mebli / Materiałów:</span><span className="text-stone-800">{offerItems.reduce((acc, item) => acc + item.totalPrice, 0).toLocaleString()} zł</span></div>
                        {offerConfig.includeHardware && hardwareItems.length > 0 && <div className="flex justify-between text-sm font-bold text-stone-600"><span>Suma Wartości Okuć:</span><span className="text-stone-800">{hardwareTotalSum.toLocaleString()} zł</span></div>}
                        {offerConfig.includeServices && servicesTotalSum > 0 && <div className="flex justify-between text-sm font-bold text-stone-600"><span>Usługi Dodatkowe:</span><span className="text-stone-800">{servicesTotalSum.toLocaleString()} zł</span></div>}
                      </div>
                      <div className="border-t-2 border-stone-200 pt-6 flex flex-col items-end">
                        <span className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-1">Do zapłaty całkowitej</span>
                        <div className="flex items-baseline gap-2"><span className="text-4xl font-black text-stone-900">{offerTotal.toLocaleString()}</span><span className="text-xl font-bold text-stone-500">PLN</span></div>
                      </div>
                    </div>
                  </div>

                  {/* ODRĘCZNY PODPIS */}
                  <div className="mt-16 flex items-center w-full gap-6 opacity-60 page-break-inside-avoid">
                    <div className="h-[1px] bg-stone-300 flex-1"></div>
                    <span className="text-lg sm:text-xl font-bold text-stone-600 tracking-widest whitespace-nowrap" style={{ fontFamily: "'Poiret One', sans-serif" }}>Weronika Hutyra</span>
                    <div className="h-[1px] bg-stone-300 flex-1"></div>
                  </div>

               </div>
            </div>
          </div>
        )}

      </main>

      {/* --- MODALE (WYSKAKUJĄCE OKIENKA) WYCIĄGNIĘTE NA SAM DÓŁ ABY UNIKNĄĆ BLOKOWANIA PRZEZ CSS --- */}
      
      {/* 1. KREATOR MEBLI */}
      {activeTab === 'builder' && (
        <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-md flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[40px] p-8 sm:p-10 w-full max-w-lg shadow-2xl relative animate-in zoom-in-95 border border-stone-100 max-h-[90vh] overflow-y-auto">
             <button onClick={() => { setActiveTab('summary'); resetBuilder(); }} className="absolute top-6 right-6 text-stone-400 bg-stone-50 p-2.5 rounded-full hover:bg-stone-200 transition-colors"><X size={20}/></button>
             
             {/* Krok 1 */}
             {builderStep === 1 && (
               <div className="space-y-4 text-center mt-2">
                 <h2 className="text-2xl font-black mb-6 tracking-tight text-stone-800">Co chcesz dodać?</h2>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <button onClick={() => { setCurrentFurniture(p => ({...p, category: 'hanging', heightType: '720', depthType: '300'})); setBuilderStep(2); }} className="p-6 border-2 border-stone-200 rounded-3xl font-black text-sm flex flex-col items-center gap-3 hover:border-stone-800 hover:bg-stone-50 transition-all text-stone-600 uppercase tracking-widest"><div className="bg-stone-100 text-stone-400 p-4 rounded-2xl"><ArrowUpToLine size={24}/></div> Szafka Wisząca</button>
                   <button onClick={() => { setCurrentFurniture(p => ({...p, category: 'standing', heightType: '720', depthType: '510'})); setBuilderStep(2); }} className="p-6 border-2 border-stone-200 rounded-3xl font-black text-sm flex flex-col items-center gap-3 hover:border-stone-800 hover:bg-stone-50 transition-all text-stone-600 uppercase tracking-widest"><div className="bg-stone-100 text-stone-400 p-4 rounded-2xl"><ArrowDownToLine size={24}/></div> Szafka Stojąca</button>
                   <button onClick={() => { setCurrentFurniture(p => ({...p, category: 'blat', widthType: '2000', depthType: '600', thickness: '38'})); setBuilderStep(2); }} className="p-6 border-2 border-stone-200 rounded-3xl font-black text-sm flex flex-col items-center gap-3 hover:border-amber-600 hover:bg-amber-50 transition-all text-stone-600 uppercase tracking-widest"><div className="bg-stone-100 text-stone-400 p-4 rounded-2xl"><Ruler size={24}/></div> Blat Roboczy</button>
                   <button onClick={() => { setCurrentFurniture(p => ({...p, category: 'formatka', widthType: '600', heightType: '720', isEdged: true, boardMaterial: 'korpus'})); setBuilderStep(2); }} className="p-6 border-2 border-stone-200 rounded-3xl font-black text-sm flex flex-col items-center gap-3 hover:border-orange-600 hover:bg-orange-50 transition-all text-stone-600 uppercase tracking-widest"><div className="bg-stone-100 text-stone-400 p-4 rounded-2xl"><Layers size={24}/></div> Poj. Formatka</button>
                 </div>
               </div>
             )}

             {/* Krok 2 */}
             {builderStep === 2 && (
               <div className="space-y-6 text-center mt-2">
                 <h2 className="text-2xl font-black mb-2 tracking-tight text-stone-800">Nazwij ten moduł / element</h2>
                 <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-8">Ułatwi to identyfikację na liście</p>
                 <input autoFocus className="w-full p-6 bg-stone-50 rounded-[24px] font-black text-center text-2xl text-stone-800 outline-none uppercase tracking-wider" placeholder={currentFurniture.category === 'blat' ? 'np. Blat Kuchenny' : currentFurniture.category === 'formatka' ? 'np. Bok Szafki' : 'np. Szafka Zlew'} value={currentFurniture.name} onChange={e => setCurrentFurniture({...currentFurniture, name: e.target.value})}/>
               </div>
             )}

             {/* Krok 3 */}
             {builderStep === 3 && (
               <div className="space-y-4 mt-2">
                 <h2 className="text-2xl font-black text-center mb-6 uppercase text-stone-800">
                   {currentFurniture.category === 'blat' ? 'Wymiary Blatu' : currentFurniture.category === 'formatka' ? 'Wymiary Formatki' : 'Gabaryty bryły'}
                 </h2>
                 
                 {/* Szerokość / Długość */}
                 <div className="bg-stone-50 p-4 rounded-2xl">
                   <p className="text-[10px] font-black uppercase text-stone-500 mb-3 text-center">
                     {currentFurniture.category === 'blat' ? 'Długość blatu (mm)' : currentFurniture.category === 'formatka' ? 'Szerokość formatki (mm)' : 'Szerokość (mm)'}
                   </p>
                   <div className="flex gap-2">
                     <select className="p-4 bg-white rounded-xl font-black text-stone-700 flex-1 outline-none" value={currentFurniture.widthType} onChange={e=>setCurrentFurniture({...currentFurniture, widthType: e.target.value})}>
                       <option value="450">450 mm</option>
                       <option value="600">600 mm</option>
                       <option value="800">800 mm</option>
                       <option value="900">900 mm</option>
                       {currentFurniture.category === 'blat' && <option value="2000">2000 mm</option>}
                       {currentFurniture.category === 'blat' && <option value="4100">4100 mm</option>}
                       <option value="custom">WŁASNY</option>
                     </select>
                     {currentFurniture.widthType === 'custom' && <input type="number" className="p-4 bg-white rounded-xl font-black w-28 text-center text-stone-800 outline-none" placeholder="mm" value={currentFurniture.customWidth} onChange={e=>setCurrentFurniture({...currentFurniture, customWidth: e.target.value})}/>}
                   </div>
                 </div>

                 {/* Wysokość (oprócz blatu) */}
                 {currentFurniture.category !== 'blat' && (
                   <div className="bg-stone-50 p-4 rounded-2xl">
                     <p className="text-[10px] font-black uppercase text-stone-500 mb-3 text-center">
                       {currentFurniture.category === 'formatka' ? 'Wysokość formatki (mm)' : 'Wysokość korpusu (mm)'}
                     </p>
                     <div className="flex gap-2">
                       <select className="p-4 bg-white rounded-xl font-black text-stone-700 flex-1 outline-none" value={currentFurniture.heightType} onChange={e=>setCurrentFurniture({...currentFurniture, heightType: e.target.value})}>
                         <option value="360">360 mm</option>
                         <option value="720">720 mm</option>
                         <option value="820">820 mm</option>
                         <option value="2100">2100 mm</option>
                         <option value="custom">WŁASNY</option>
                       </select>
                       {currentFurniture.heightType === 'custom' && <input type="number" className="p-4 bg-white rounded-xl font-black w-28 text-center text-stone-800 outline-none" placeholder="mm" value={currentFurniture.customHeight} onChange={e=>setCurrentFurniture({...currentFurniture, customHeight: e.target.value})}/>}
                     </div>
                   </div>
                 )}

                 {/* Głębokość (oprócz formatki) */}
                 {currentFurniture.category !== 'formatka' && (
                   <div className="bg-stone-50 p-4 rounded-2xl">
                     <p className="text-[10px] font-black uppercase text-stone-500 mb-3 text-center">
                       {currentFurniture.category === 'blat' ? 'Głębokość blatu (mm)' : 'Głębokość całkowita (mm)'}
                     </p>
                     <div className="flex gap-2">
                       <select className="p-4 bg-white rounded-xl font-black text-stone-700 flex-1 outline-none" value={currentFurniture.depthType} onChange={e=>setCurrentFurniture({...currentFurniture, depthType: e.target.value})}>
                         <option value="300">300 mm</option>
                         <option value="510">510 mm</option>
                         <option value="560">560 mm</option>
                         {currentFurniture.category === 'blat' && <option value="600">600 mm</option>}
                         {currentFurniture.category === 'blat' && <option value="650">650 mm</option>}
                         <option value="custom">WŁASNY</option>
                       </select>
                       {currentFurniture.depthType === 'custom' && <input type="number" className="p-4 bg-white rounded-xl font-black w-28 text-center text-stone-800 outline-none" placeholder="mm" value={currentFurniture.customDepth} onChange={e=>setCurrentFurniture({...currentFurniture, customDepth: e.target.value})}/>}
                     </div>
                   </div>
                 )}

                 {/* Grubość (Tylko blat) */}
                 {currentFurniture.category === 'blat' && (
                   <div className="bg-stone-50 p-4 rounded-2xl">
                     <p className="text-[10px] font-black uppercase text-stone-500 mb-3 text-center">Grubość blatu (mm)</p>
                     <div className="flex gap-2">
                       <select className="p-4 bg-white rounded-xl font-black text-stone-700 flex-1 outline-none" value={currentFurniture.thickness} onChange={e=>setCurrentFurniture({...currentFurniture, thickness: e.target.value})}>
                         <option value="28">28 mm</option>
                         <option value="38">38 mm</option>
                         <option value="custom">WŁASNY</option>
                       </select>
                       {currentFurniture.thickness === 'custom' && <input type="number" className="p-4 bg-white rounded-xl font-black w-28 text-center text-stone-800 outline-none" placeholder="mm" value={currentFurniture.customThickness} onChange={e=>setCurrentFurniture({...currentFurniture, customThickness: e.target.value})}/>}
                     </div>
                   </div>
                 )}
               </div>
             )}

             {/* Krok 4 (Dla szafek i formatki) */}
             {builderStep === 4 && ['hanging', 'standing'].includes(currentFurniture.category) && (
               <div className="space-y-4 text-center mt-2">
                 <h2 className="text-2xl font-black mb-8 uppercase text-stone-800">Złożoność Konstrukcji</h2>
                 <button onClick={() => setCurrentFurniture({...currentFurniture, type: 'prosty'})} className={`w-full p-5 border-2 rounded-2xl font-black uppercase text-sm transition-all ${currentFurniture.type === 'prosty' ? 'bg-stone-800 text-white border-stone-800' : 'border-stone-200 text-stone-500'}`}>Moduł Standardowy</button>
                 <button onClick={() => setCurrentFurniture({...currentFurniture, type: 'skomplikowany'})} className={`w-full p-5 border-2 rounded-2xl font-black uppercase text-sm transition-all ${currentFurniture.type === 'skomplikowany' ? 'bg-stone-800 text-white border-stone-800' : 'border-stone-200 text-stone-500'}`}>Złożony / Narożny</button>
                 {currentFurniture.category === 'standing' && (<button onClick={() => setCurrentFurniture({...currentFurniture, type: 'szuflady'})} className={`w-full p-5 border-2 rounded-2xl font-black uppercase text-sm transition-all ${currentFurniture.type === 'szuflady' ? 'bg-stone-800 text-white border-stone-800' : 'border-stone-200 text-stone-500'}`}>Z Szufladami</button>)}
                 {currentFurniture.type === 'szuflady' && (
                   <div className="mt-8 p-5 bg-stone-100 border border-stone-200 rounded-2xl">
                     <p className="text-[10px] font-black uppercase text-stone-800 mb-4">Liczba szuflad</p>
                     <div className="flex gap-3 justify-center">{[1,2,3,4,5].map(n => (<button key={n} onClick={()=>setCurrentFurniture({...currentFurniture, drawerCount: n, frontCount: n})} className={`w-12 h-12 rounded-xl font-black text-xl transition-all ${currentFurniture.drawerCount === n ? 'bg-stone-800 text-white' : 'bg-white text-stone-400 border border-stone-200'}`}>{n}</button>))}</div>
                   </div>
                 )}
               </div>
             )}

             {/* Krok 4 Opcje formatki */}
             {builderStep === 4 && currentFurniture.category === 'formatka' && (
               <div className="space-y-6 text-center mt-2">
                  <h2 className="text-2xl font-black mb-8 uppercase text-stone-800">Opcje Formatki</h2>

                  <div className="bg-stone-50 p-6 rounded-2xl border border-stone-200">
                    <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-4">Materiał Płyty</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => setCurrentFurniture({...currentFurniture, boardMaterial: 'korpus'})} className={`p-4 rounded-xl font-black text-xs uppercase transition-all ${currentFurniture.boardMaterial === 'korpus' ? 'bg-stone-800 text-white shadow-md' : 'bg-white text-stone-500 border border-stone-200'}`}>Płyta Korpusowa</button>
                      <button onClick={() => setCurrentFurniture({...currentFurniture, boardMaterial: 'front'})} className={`p-4 rounded-xl font-black text-xs uppercase transition-all ${currentFurniture.boardMaterial === 'front' ? 'bg-stone-800 text-white shadow-md' : 'bg-white text-stone-500 border border-stone-200'}`}>Płyta Frontowa</button>
                    </div>
                  </div>

                  <label className={`flex items-center justify-between p-6 rounded-2xl cursor-pointer border-2 transition-all ${currentFurniture.isEdged ? 'bg-green-50 border-green-200' : 'bg-stone-50 border-stone-200'}`}>
                    <span className={`font-black uppercase tracking-widest text-sm ${currentFurniture.isEdged ? 'text-green-800' : 'text-stone-500'}`}>Oklejanie krawędzi (dokooła)</span>
                    <div className={`w-14 h-8 rounded-full relative transition-colors ${currentFurniture.isEdged ? 'bg-green-500' : 'bg-stone-300'}`}><div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${currentFurniture.isEdged ? 'left-7' : 'left-1'}`}></div></div>
                    <input type="checkbox" className="hidden" checked={currentFurniture.isEdged} onChange={e => setCurrentFurniture({...currentFurniture, isEdged: e.target.checked})} />
                  </label>
               </div>
             )}

             {/* Krok 5 (Tylko dla szafek) */}
             {builderStep === 5 && (
               <div className="space-y-6 text-center mt-2">
                 <h2 className="text-2xl font-black mb-8 uppercase text-stone-800">Zamknięcie Mebla</h2>
                 <label className={`flex items-center justify-between p-6 rounded-2xl cursor-pointer border-2 transition-all ${currentFurniture.hasFronts ? 'bg-green-50 border-green-200' : 'bg-stone-50 border-stone-200'}`}>
                   <span className={`font-black uppercase tracking-widest text-sm ${currentFurniture.hasFronts ? 'text-green-800' : 'text-stone-500'}`}>Zamykany frontem?</span>
                   <div className={`w-14 h-8 rounded-full relative transition-colors ${currentFurniture.hasFronts ? 'bg-green-500' : 'bg-stone-300'}`}><div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${currentFurniture.hasFronts ? 'left-7' : 'left-1'}`}></div></div>
                   <input type="checkbox" className="hidden" checked={currentFurniture.hasFronts} onChange={e => setCurrentFurniture({...currentFurniture, hasFronts: e.target.checked})} />
                 </label>
                 {currentFurniture.hasFronts && (
                   <div className="mt-8 p-6 bg-white border-2 border-stone-100 rounded-2xl">
                     <p className="text-[10px] font-black uppercase text-stone-400 mb-4">Ilość sztuk frontów?</p>
                     <div className="flex justify-center gap-3 flex-wrap">{[1,2,3,4].map(n => (<button key={n} onClick={()=>setCurrentFurniture({...currentFurniture, frontCount: n})} className={`w-16 h-16 rounded-2xl font-black text-2xl transition-all ${currentFurniture.frontCount === n ? 'bg-stone-800 text-white' : 'bg-stone-50 text-stone-400 border border-stone-200'}`}>{n}</button>))}</div>
                   </div>
                 )}
               </div>
             )}

             <div className="flex gap-4 mt-10 pt-6 border-t border-stone-100">
               {builderStep > 1 && (<button onClick={() => setBuilderStep(builderStep - 1)} className="flex-1 py-4 border-2 border-stone-200 bg-white rounded-xl font-black text-stone-500 text-xs uppercase tracking-widest hover:bg-stone-50">Cofnij</button>)}
               <button 
                 disabled={builderStep === 2 && !currentFurniture.name} 
                 onClick={() => {
                   const isReadyToSubmit = (currentFurniture.category === 'blat' && builderStep === 3) || (currentFurniture.category === 'formatka' && builderStep === 4) || (builderStep === 5);
                   if (isReadyToSubmit) handleAddToQuote();
                   else setBuilderStep(builderStep + 1);
                 }} 
                 className="flex-[2] py-4 bg-stone-800 text-white rounded-xl font-black text-sm uppercase tracking-widest disabled:opacity-50 hover:bg-stone-900 transition-colors"
               >
                 {((currentFurniture.category === 'blat' && builderStep === 3) || (currentFurniture.category === 'formatka' && builderStep === 4) || (builderStep === 5)) ? (editingId ? 'Zapisz Zmiany' : 'Gotowe') : 'Dalej'}
               </button>
             </div>
          </div>
        </div>
      )}

      {/* 2. DODAJ OKUCIE */}
      {showAddGlobalModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 border border-stone-200 max-h-[95vh] overflow-y-auto custom-scrollbar">
            <h3 className="font-black text-xl mb-6 uppercase tracking-tight text-center text-stone-800 flex flex-col items-center gap-3">
              <div className="bg-stone-100 p-3 rounded-full text-stone-800"><Wrench size={24}/></div> Dodaj Nowe Okucie
            </h3>
            
            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1 block">Kategoria</label>
            <select className="w-full p-4 bg-stone-50 rounded-xl mb-4 font-bold text-sm border border-stone-200 outline-none focus:ring-2 focus:ring-stone-200" value={newGlobalHardware.category} onChange={e=>setNewGlobalHardware({...newGlobalHardware, category: e.target.value})}>
              {['Szuflady', 'Zawiasy', 'Uchwyty', 'Oświetlenie', 'Systemy Przesuwne', 'Inne'].map(c=><option key={c}>{c}</option>)}
            </select>
            
            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1 block">Nazwa modelu (np. Blum Tandembox)</label>
            <input className="w-full p-4 bg-stone-50 rounded-xl mb-4 font-bold text-sm border border-stone-200 outline-none focus:ring-2 focus:ring-stone-200" placeholder="Wpisz nazwę okucia..." value={newGlobalHardware.name} onChange={e=>setNewGlobalHardware({...newGlobalHardware, name: e.target.value})} />
            
            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1 block flex justify-between items-center">Link do zdjęcia (Opcjonalnie) <ImageIcon size={12}/></label>
            <input className="w-full p-4 bg-stone-50 rounded-xl mb-4 font-bold text-xs border border-stone-200 outline-none focus:ring-2 focus:ring-stone-200" placeholder="Wklej URL zdjęcia..." value={newGlobalHardware.imageUrl} onChange={e=>setNewGlobalHardware({...newGlobalHardware, imageUrl: e.target.value})} />

            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1 block flex justify-between items-center">Link do produktu (Opcjonalnie) <ExternalLink size={12}/></label>
            <input className="w-full p-4 bg-stone-50 rounded-xl mb-4 font-bold text-xs border border-stone-200 outline-none focus:ring-2 focus:ring-stone-200" placeholder="https://sklep..." value={newGlobalHardware.linkUrl} onChange={e=>setNewGlobalHardware({...newGlobalHardware, linkUrl: e.target.value})} />
            
            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1 block">Cena zakupu netto za szt/kpl</label>
            <div className="relative mb-6">
              <input type="number" className="w-full p-4 bg-stone-50 rounded-xl font-black text-stone-800 text-lg border border-stone-200 outline-none focus:ring-2 focus:ring-stone-200" placeholder="0.00" value={newGlobalHardware.unitPrice || ''} onChange={e=>setNewGlobalHardware({...newGlobalHardware, unitPrice: Number(e.target.value)})} />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-stone-400">PLN</span>
            </div>
            
            <div className="flex gap-3">
              <button onClick={()=>setShowAddGlobalModal(false)} className="flex-1 py-4 bg-stone-100 text-stone-600 font-black rounded-xl text-xs uppercase hover:bg-stone-200 transition-colors">Anuluj</button>
              <button onClick={async () => { if (!user || !newGlobalHardware.name) return; await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'hardware_db'), { ...newGlobalHardware, createdAt: serverTimestamp() }); setShowAddGlobalModal(false); setNewGlobalHardware({ name: '', category: 'Szuflady', unitPrice: 0, imageUrl: '', linkUrl: '' }); }} disabled={!newGlobalHardware.name} className="flex-1 py-4 bg-stone-800 text-white font-black rounded-xl text-xs uppercase shadow-md hover:bg-stone-900 disabled:opacity-50 transition-colors">Zapisz</button>
            </div>
          </div>
        </div>
      )}

      {/* 3. DODAJ MATERIAŁ */}
      {showAddMaterialModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 border border-stone-200 max-h-[95vh] overflow-y-auto custom-scrollbar">
            <h3 className="font-black text-xl mb-6 uppercase tracking-tight text-center text-stone-800 flex flex-col items-center gap-3">
              <div className="bg-stone-100 p-3 rounded-full text-stone-800"><Package size={24}/></div> Dodaj Materiał
            </h3>
            
            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1 block">Kategoria</label>
            <select className="w-full p-4 bg-stone-50 rounded-xl mb-4 font-bold text-sm border border-stone-200 outline-none focus:ring-2 focus:ring-stone-200" value={newMaterial.category} onChange={e=>setNewMaterial({...newMaterial, category: e.target.value})}>
              {['Płyta korpusowa', 'Płyta frontowa', 'Blat', 'Inne'].map(c=><option key={c}>{c}</option>)}
            </select>
            
            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1 block">Nazwa materiału (np. Dąb Lancelot)</label>
            <input className="w-full p-4 bg-stone-50 rounded-xl mb-4 font-bold text-sm border border-stone-200 outline-none focus:ring-2 focus:ring-stone-200" placeholder="Wpisz nazwę..." value={newMaterial.name} onChange={e=>setNewMaterial({...newMaterial, name: e.target.value})} />
            
            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1 block flex justify-between items-center">Link do zdjęcia (Opcjonalnie) <ImageIcon size={12}/></label>
            <input className="w-full p-4 bg-stone-50 rounded-xl mb-4 font-bold text-xs border border-stone-200 outline-none focus:ring-2 focus:ring-stone-200" placeholder="Wklej URL zdjęcia..." value={newMaterial.imageUrl} onChange={e=>setNewMaterial({...newMaterial, imageUrl: e.target.value})} />

            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1 block flex justify-between items-center">Link do produktu (Opcjonalnie) <ExternalLink size={12}/></label>
            <input className="w-full p-4 bg-stone-50 rounded-xl mb-6 font-bold text-xs border border-stone-200 outline-none focus:ring-2 focus:ring-stone-200" placeholder="https://sklep..." value={newMaterial.linkUrl} onChange={e=>setNewMaterial({...newMaterial, linkUrl: e.target.value})} />
            
            <div className="flex gap-3">
              <button onClick={()=>setShowAddMaterialModal(false)} className="flex-1 py-4 bg-stone-100 text-stone-600 font-black rounded-xl text-xs uppercase hover:bg-stone-200 transition-colors">Anuluj</button>
              <button onClick={async () => { if (!user || !newMaterial.name) return; await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'materials_db'), { ...newMaterial, createdAt: serverTimestamp() }); setShowAddMaterialModal(false); setNewMaterial({ name: '', category: 'Płyta korpusowa', imageUrl: '', linkUrl: '' }); }} disabled={!newMaterial.name} className="flex-1 py-4 bg-stone-800 text-white font-black rounded-xl text-xs uppercase shadow-md hover:bg-stone-900 disabled:opacity-50 transition-colors">Zapisz</button>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL POTWIERDZENIA USUWANIA */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 text-center">
            <h3 className="font-black text-xl mb-3 text-stone-800 uppercase tracking-tight">{confirmDialog.title}</h3>
            <p className="text-sm font-medium text-stone-500 mb-8">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDialog({ isOpen: false, title: '', message: '', onConfirm: null })} className="flex-1 py-3 bg-stone-100 text-stone-600 font-black rounded-xl text-xs uppercase tracking-widest hover:bg-stone-200">Anuluj</button>
              <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog({ isOpen: false, title: '', message: '', onConfirm: null }); }} className="flex-1 py-3 bg-red-600 text-white font-black rounded-xl text-xs uppercase tracking-widest shadow-md hover:bg-red-700">Potwierdź</button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL ZAPISYWANIA PROJEKTU */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-md flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 text-center border border-stone-200 relative">
            <button onClick={() => setShowSaveModal(false)} className="absolute top-4 right-4 text-stone-400 bg-stone-50 p-2 rounded-full hover:bg-stone-200 transition-colors"><X size={16}/></button>

            <h3 className="font-black text-2xl mb-6 text-stone-800 uppercase tracking-tight flex items-center justify-center gap-3">
              <div className="bg-stone-100 p-3 rounded-full text-stone-800"><Save size={24}/></div> Zapisz Wycenę
            </h3>
            
            {/* OSTRZEŻENIE O BRAKU AUTORYZACJI */}
            {!user && (
              <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-[10px] font-bold uppercase tracking-widest">
                Uwaga! Brak połączenia z bazą.
              </div>
            )}

            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-2 block text-left">Nazwa projektu</label>
            <input 
              type="text" 
              autoFocus
              className="w-full p-4 bg-stone-50 rounded-xl mb-6 font-black text-stone-800 border-2 border-transparent outline-none focus:border-stone-200 focus:bg-white text-center text-lg transition-colors" 
              value={currentProjectName} 
              onChange={(e) => setCurrentProjectName(e.target.value)}
            />
            
            <div className="flex flex-col gap-3">
              {currentProjectId && (
                <button 
                  onClick={() => saveProjectToCloud(true)} 
                  disabled={!user || !currentProjectName}
                  className="w-full py-4 bg-stone-800 text-white font-black rounded-xl text-xs uppercase tracking-widest shadow-md disabled:opacity-50 hover:bg-stone-900 transition-colors"
                >
                  Nadpisz obecny
                </button>
              )}
              <button 
                onClick={() => saveProjectToCloud(false)} 
                disabled={!user || !currentProjectName}
                className={`w-full py-4 font-black rounded-xl text-xs uppercase tracking-widest disabled:opacity-50 transition-colors ${currentProjectId ? 'bg-stone-100 text-stone-600 hover:bg-stone-200' : 'bg-stone-800 text-white shadow-md hover:bg-stone-900'}`}
              >
                {currentProjectId ? 'Zapisz jako nowa kopia' : 'Zapisz w archiwum'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
