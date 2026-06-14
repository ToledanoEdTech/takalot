import React, { useState } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { Fault, ARCHIVE_DAYS } from '../types';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Trash2, ShieldAlert, Loader2 } from 'lucide-react';

interface AdminPanelProps {
  onDataChanged?: () => void;
}

async function deleteFaultsWithImages(faultIds: string[]) {
  let batch = writeBatch(db);
  let count = 0;

  for (const faultId of faultIds) {
    batch.delete(doc(db, 'faults', faultId));
    batch.delete(doc(db, 'fault_images', faultId));
    count++;

    if (count % 450 === 0) {
      await batch.commit();
      batch = writeBatch(db);
    }
  }

  if (count % 450 !== 0) {
    await batch.commit();
  }
}

export function AdminPanel({ onDataChanged }: AdminPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleExportExcel = async () => {
    setLoading('export');
    try {
      const snapshot = await getDocs(collection(db, 'faults'));

      const faults: Fault[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as Fault[];

      const dataToExport = faults.map((f) => ({
        'מספר מזהה': f.id,
        'כותרת': f.title,
        'תיאור': f.description,
        'המשך טיפול': f.treatmentNote || '',
        'מיקום': f.location,
        'שם המדווח': f.reporterName,
        'סטטוס': f.status === 'open' ? 'פעיל' : f.status === 'in_progress' ? 'בטיפול' : 'טופל',
        'תאריך דיווח': f.createdAt ? f.createdAt.toDate().toLocaleString('he-IL') : '',
        'תאריך עדכון אחרון': f.updatedAt ? f.updatedAt.toDate().toLocaleString('he-IL') : '',
        'קיימת תמונה?': f.hasImage || f.imageUrl ? 'כן' : 'לא',
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);

      if (!worksheet['!views']) {
        worksheet['!views'] = [];
      }
      worksheet['!views'].push({ rightToLeft: true });

      worksheet['!cols'] = [
        { wch: 15 },
        { wch: 25 },
        { wch: 40 },
        { wch: 40 },
        { wch: 15 },
        { wch: 15 },
        { wch: 10 },
        { wch: 20 },
        { wch: 20 },
        { wch: 10 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'תקלות');
      XLSX.writeFile(workbook, 'דוח_תקלות_ישיבת_צביה.xlsx');
    } catch (e) {
      console.error('Export failed', e);
      alert('שגיאה ביצירת קובץ אקסל');
    } finally {
      setLoading(null);
    }
  };

  const handleDeleteFixed = async () => {
    setLoading('delete_fixed');
    try {
      const snapshot = await getDocs(query(collection(db, 'faults'), where('status', '==', 'fixed')));
      if (snapshot.empty) {
        alert('אין תקלות שטופלו למחיקה');
        return;
      }

      if (!window.confirm(`האם למחוק לצמיתות את ${snapshot.size} התקלות שטופלו (כולל תמונות)?`)) {
        return;
      }

      await deleteFaultsWithImages(snapshot.docs.map((docSnap) => docSnap.id));
      alert('התקלות נמחקו בהצלחה');
      onDataChanged?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'שגיאה לא ידועה';
      alert('שגיאה במחיקת התקלות: ' + message);
      try {
        handleFirestoreError(error, OperationType.DELETE, 'faults/*');
      } catch {
        // handled above
      }
    } finally {
      setLoading(null);
    }
  };

  const handleDeleteOld = async () => {
    setLoading('delete_old');
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - ARCHIVE_DAYS);

      const snapshot = await getDocs(
        query(
          collection(db, 'faults'),
          where('status', '==', 'fixed'),
          where('updatedAt', '<', Timestamp.fromDate(cutoff))
        )
      );

      if (snapshot.empty) {
        alert(`אין תקלות "טופלו" ישנות מ-${ARCHIVE_DAYS} יום למחיקה`);
        return;
      }

      if (!window.confirm(`האם למחוק לצמיתות ${snapshot.size} תקלות "טופלו" מלפני ${ARCHIVE_DAYS} יום?`)) {
        return;
      }

      await deleteFaultsWithImages(snapshot.docs.map((docSnap) => docSnap.id));
      alert('התקלות נמחקו בהצלחה');
      onDataChanged?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'שגיאה לא ידועה';
      alert('שגיאה במחיקת התקלות: ' + message);
      try {
        handleFirestoreError(error, OperationType.DELETE, 'faults/*');
      } catch {
        // handled above
      }
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="bg-slate-800 text-white p-6 rounded-2xl shadow-sm mb-6 border border-slate-700">
      <div className="flex items-center gap-3 mb-6">
        <ShieldAlert className="w-6 h-6 text-indigo-400" />
        <div>
          <h2 className="text-lg font-bold">פאנל ניהול אתר</h2>
          <p className="text-sm text-slate-400">אזור ייעודי למנהלי המערכת (שחרור חלל אחסון ודוחות)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={handleExportExcel}
          disabled={loading !== null}
          className="flex flex-col items-center justify-center gap-3 p-4 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl transition-colors disabled:opacity-50"
        >
          {loading === 'export' ? <Loader2 className="w-8 h-8 mb-1 animate-spin" /> : <FileSpreadsheet className="w-8 h-8 mb-1" />}
          <span className="font-bold text-sm">הורדת דוח באקסל (Excel)</span>
          <span className="text-xs opacity-70">מסודר ומעוצב כולל כל הנתונים</span>
        </button>

        <button
          onClick={handleDeleteFixed}
          disabled={loading !== null}
          className="flex flex-col items-center justify-center gap-3 p-4 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 rounded-xl transition-colors disabled:opacity-50"
        >
          {loading === 'delete_fixed' ? <Loader2 className="w-8 h-8 mb-1 animate-spin" /> : <Trash2 className="w-8 h-8 mb-1" />}
          <span className="font-bold text-sm">מחיקת תקלות ש"טופלו"</span>
          <span className="text-xs opacity-70">כולל מחיקת תמונות מהענן</span>
        </button>

        <button
          onClick={handleDeleteOld}
          disabled={loading !== null}
          className="flex flex-col items-center justify-center gap-3 p-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl transition-colors disabled:opacity-50"
        >
          {loading === 'delete_old' ? <Loader2 className="w-8 h-8 mb-1 animate-spin" /> : <Trash2 className="w-8 h-8 mb-1" />}
          <span className="font-bold text-sm">מחיקת "טופלו" מעל {ARCHIVE_DAYS} יום</span>
          <span className="text-xs opacity-70">ניקוי היסטוריה ישנה לשחרור מקום</span>
        </button>
      </div>
    </div>
  );
}
