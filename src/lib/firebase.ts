import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc, updateDoc, increment, setDoc, collection, query, where, getDocs, addDoc, deleteDoc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// ... (previous app initialization)

export interface CustomAd {
  id?: string;
  imageUrl: string;
  targetUrl: string;
  label: string;
  active: boolean;
  position: 'sidebar' | 'result_list';
  createdAt?: any;
  expiresAt?: string;
}

// ... (previous stats functions)

export const getCustomAds = async (activeOnly = true): Promise<CustomAd[]> => {
  const adsCol = collection(db, 'ads');
  const q = activeOnly ? query(adsCol, where('active', '==', true)) : adsCol;
  const snap = await getDocs(q);
  const now = new Date();
  
  let ads = snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomAd));
  
  if (activeOnly) {
    // Filtrar anúncios expirados
    ads = ads.filter(ad => {
      if (!ad.expiresAt) return true; // Sem data de expiração = permanente
      return new Date(ad.expiresAt) > now;
    });
  }
  
  return ads;
};

export const createCustomAd = async (ad: CustomAd) => {
  const adsCol = collection(db, 'ads');
  try {
    console.log("Firestore: Starting addDoc for new ad...");
    const docRef = await addDoc(adsCol, {
      imageUrl: ad.imageUrl,
      targetUrl: ad.targetUrl,
      label: ad.label,
      active: ad.active,
      position: ad.position,
      createdAt: new Date().toISOString(),
      expiresAt: ad.expiresAt || null
    });
    console.log("Firestore: Ad created successfully with ID:", docRef.id);
    return docRef;
  } catch (error) {
    console.error("Firestore Error in createCustomAd:", error);
    throw error;
  }
};

export const deleteCustomAd = async (adId: string) => {
  try {
    await deleteDoc(doc(db, 'ads', adId));
    console.log("Ad deleted successfully:", adId);
  } catch (error) {
    console.error("Error in deleteCustomAd:", error);
    throw error;
  }
};

export const toggleAdStatus = async (adId: string, currentStatus: boolean) => {
  try {
    const adDoc = doc(db, 'ads', adId);
    await updateDoc(adDoc, {
      active: !currentStatus
    });
    console.log("Firestore: Ad status toggled successfully:", adId);
  } catch (error) {
    console.error("Firestore Error in toggleAdStatus:", error);
    throw error;
  }
};
// CONFIGURAÇÕES DO FIREBASE
// As credenciais são carregadas automaticamente do arquivo firebase-applet-config.json.
// Para editar manualmente as chaves ou IDs, você pode modificar o arquivo acima 
// ou substituir o 'firebaseConfig' por um objeto literal com suas chaves.

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth();

// Test Connection and Log Errors properly
const testConnection = async () => {
  try {
    await getDocFromServer(doc(db, 'stats', 'global'));
    console.log("Firestore Connected successfully.");
  } catch (error) {
    if (error instanceof Error && error.message.includes('permission-denied')) {
      console.error("Firestore Permission Denied. Please check your rules.");
    }
  }
};
testConnection();

export interface Stats {
  visits: number;
  searches: number;
  adClicks: number;
  adImpressions: number;
}

export const getStats = async (): Promise<Stats> => {
  const statsDoc = doc(db, 'stats', 'global');
  const snap = await getDoc(statsDoc);
  if (snap.exists()) {
    const data = snap.data();
    return {
      visits: data.visits || 0,
      searches: data.searches || 0,
      adClicks: data.adClicks || 0,
      adImpressions: data.adImpressions || 0
    };
  } else {
    // Initialize if not exists
    const initial = { visits: 0, searches: 0, adClicks: 0, adImpressions: 0 };
    await setDoc(statsDoc, initial);
    return initial;
  }
};

export const trackVisit = async () => {
  const statsDoc = doc(db, 'stats', 'global');
  try {
    await updateDoc(statsDoc, {
      visits: increment(1)
    });
  } catch (e) {
    // If update fails (e.g. doc doesn't exist yet), create it
    await setDoc(statsDoc, { visits: 1, searches: 0, adClicks: 0, adImpressions: 0 }, { merge: true });
  }
};

export const trackSearch = async () => {
  const statsDoc = doc(db, 'stats', 'global');
  try {
    await updateDoc(statsDoc, {
      searches: increment(1)
    });
  } catch (e) {
    await setDoc(statsDoc, { visits: 0, searches: 1, adClicks: 0, adImpressions: 0 }, { merge: true });
  }
};

export const trackAdImpression = async () => {
  const statsDoc = doc(db, 'stats', 'global');
  try {
    await updateDoc(statsDoc, {
      adImpressions: increment(1)
    });
  } catch (e) {
    await setDoc(statsDoc, { visits: 0, searches: 0, adClicks: 0, adImpressions: 1 }, { merge: true });
  }
};

export const trackAdClick = async () => {
  const statsDoc = doc(db, 'stats', 'global');
  try {
    await updateDoc(statsDoc, {
      adClicks: increment(1)
    });
  } catch (e) {
    await setDoc(statsDoc, { visits: 0, searches: 0, adClicks: 1, adImpressions: 0 }, { merge: true });
  }
};
