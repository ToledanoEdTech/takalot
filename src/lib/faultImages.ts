import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';

export async function saveFaultImage(faultId: string, dataUrl: string): Promise<void> {
  await setDoc(doc(db, 'fault_images', faultId), { data: dataUrl });
}

export async function getFaultImage(faultId: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'fault_images', faultId));
  if (!snap.exists()) return null;
  const data = snap.data().data;
  return typeof data === 'string' ? data : null;
}

export async function deleteFaultImage(faultId: string): Promise<void> {
  await deleteDoc(doc(db, 'fault_images', faultId));
}
