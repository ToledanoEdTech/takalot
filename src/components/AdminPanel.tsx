import React, { useState } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { Fault } from '../types';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Trash2, ShieldAlert, ImageMinus, Loader2 } from 'lucide-react';

interface AdminPanelProps {
  faults: Fault[];
}

export function AdminPanel({ faults }: AdminPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleExportExcel = () => {
    try {
      const dataToExport = faults.map(f => ({
        'מספר מזהה': f.id,
        'כותרת': f.title,
        'תיאור': f.description,
        'המשך טיפול': f.treatmentNote || '',
        'מיקום': f.location,
        'שם המדווח': f.reporterName,
        'סטטוס': f.status === 'open' ? 'פעיל' : f.status === 'in_progress' ? 'בטיפול' : 'טופל',
        'תאריך דיווח': f.createdAt ? f.createdAt.toDate().toLocaleString('he-IL') : '',
        'תאריך עדכון אחרון': f.updatedAt ? f.updatedAt.toDate().toLocaleString('he-IL') : '',
        'קיימת תמונה?': f.imageUrl ? 'כן' : 'לא'
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      
      // Set right to left
      if (!worksheet['!views']) {
        worksheet['!views'] = [];
      }
      worksheet['!views'].push({ rightToLeft: true });

      // Column widths
      worksheet['!cols'] = [
        { wch: 15 }, // ID
        { wch: 25 }, // Title
        { wch: 40 }, // Description
        { wch: 40 }, // Treatment Note
        { wch: 15 }, // Location
        { wch: 15 }, // Reporter
        { wch: 10 }, // Status
        { wch: 20 }, // Created At
        { wch: 20 }, // Updated At
        { wch: 10 }  // Has Image
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'תקלות');
      XLSX.writeFile(workbook, 'דוח_תקלות_ישיבת_צביה.xlsx');
    } catch (e) {
      console.error('Export failed', e);
      alert('שגיאה ביצירת קובץ אקסל');
    }
  };

  const handleDeleteFixed = async () => {
    const fixedFaults = faults.filter(f => f.status === 'fixed');
    if (fixedFaults.length === 0) {
       alert('אין תקלות שטופלו למחיקה');
       return;
    }

    if (!window.confirm(`האם למחוק לצמיתות את ${fixedFaults.length} התקלות שטופלו?`)) return;

    setLoading('delete_fixed');
    try {
      const batch = writeBatch(db);
      fixedFaults.forEach(f => {
        batch.delete(doc(db, 'faults', f.id));
      });
      await batch.commit();
      alert('התקלות נמחקו בהצלחה');
    } catch (error: any) {
      alert('שגיאה במחיקת התקלות: ' + error?.message);
      try {
        handleFirestoreError(error, OperationType.DELETE, 'faults/*');
      } catch (e) {}
    } finally {
      setLoading(null);
    }
  };

  const handleDeleteOld = async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const oldFaults = faults.filter(f => f.createdAt && f.createdAt.toDate() < thirtyDaysAgo);

    if (oldFaults.length === 0) {
      alert('אין תקלות ישנות מ-30 יום למחיקה');
      return;
    }

    if (!window.confirm(`האם למחוק לצמיתות את ${oldFaults.length} התקלות הישנות? (פעולה זו בלתי הפיכה)`)) return;

    setLoading('delete_old');
    try {
      // If there are many, we might need multiple batches, but usually a single batch allows 500 max.
      // Assuming it's less than 500 for a school.
      let batch = writeBatch(db);
      let count = 0;
      
      for (const f of oldFaults) {
        batch.delete(doc(db, 'faults', f.id));
        count++;
        
        // Firestore batch max limit is 500 docs per batch
        if (count % 450 === 0) {
          await batch.commit();
          batch = writeBatch(db);
        }
      }
      
      if (count % 450 !== 0) {
        await batch.commit();
      }

      alert('התקלות נמחקו בהצלחה');
    } catch (error: any) {
      alert('שגיאה במחיקת התקלות: ' + error?.message);
      try {
        handleFirestoreError(error, OperationType.DELETE, 'faults/*');
      } catch (e) {}
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
          className="flex flex-col items-center justify-center gap-3 p-4 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl transition-colors"
        >
          <FileSpreadsheet className="w-8 h-8 mb-1" />
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
          <span className="text-xs opacity-70">פינוי שטח ענן על ידי מחיקת דיווחים סגורים</span>
        </button>

        <button
          onClick={handleDeleteOld}
          disabled={loading !== null}
          className="flex flex-col items-center justify-center gap-3 p-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl transition-colors disabled:opacity-50"
        >
          {loading === 'delete_old' ? <Loader2 className="w-8 h-8 mb-1 animate-spin" /> : <Trash2 className="w-8 h-8 mb-1" />}
          <span className="font-bold text-sm">מחיקת תקלות מעל 30 יום</span>
          <span className="text-xs opacity-70">ניקוי היסטוריה ישנה לשחרור מקום רב</span>
        </button>
      </div>
    </div>
  );
}
