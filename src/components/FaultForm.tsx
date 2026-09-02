import React, { useState } from 'react';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { compressImageFile } from '../lib/imageUtils';
import { useAuth } from '../contexts/AuthContext';
import { FaultCategory } from '../types';
import { notifyFaultCreated } from '../lib/adminApi';
import { ImagePlus, X, Wrench, Monitor } from 'lucide-react';

interface FaultFormProps {
  onClose: () => void;
}

export function FaultForm({ onClose }: FaultFormProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [reporterName, setReporterName] = useState(user?.displayName || '');
  const [category, setCategory] = useState<FaultCategory>('general');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await compressImageFile(file);
      setImageBase64(dataUrl);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בעיבוד התמונה.');
      setImageBase64(null);
    }

    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!title.trim() || !location.trim() || !reporterName.trim()) {
      setError('נא למלא את כל השדות החובה');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const newRef = doc(collection(db, 'faults'));

      // Must match currently deployed Firestore rules (legacy schema):
      // 8 required fields + optional imageUrl. The hasImage/fault_images
      // schema works only after deploy-rules.bat is run.
      const payload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        reporterName: reporterName.trim(),
        status: 'open',
        category,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.uid,
      };

      if (imageBase64) {
        payload.imageUrl = imageBase64;
      }

      await setDoc(newRef, payload);
      try {
        await notifyFaultCreated(newRef.id, {
          title: title.trim(),
          description: description.trim(),
          location: location.trim(),
          reporterName: reporterName.trim(),
          category,
          status: 'open',
        });
      } catch (notifyError) {
        console.warn('Fault email notification failed:', notifyError);
        setError(
          notifyError instanceof Error
            ? `התקלה נשמרה, אבל המייל לא נשלח: ${notifyError.message}`
            : 'התקלה נשמרה, אבל שליחת המייל נכשלה.'
        );
        return;
      }
      onClose();
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, 'faults');
      } catch {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('permission') || message.includes('PERMISSION_DENIED')) {
          setError('אין הרשאה ליצור תקלה. הריצו deploy-rules.bat כדי לעדכן את כללי Firebase.');
        } else {
          setError('שגיאה ביצירת התקלה. ייתכן שגודל הטקסט חורג מהמותר או שגיאת רשת.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 shrink-0">
          <h2 className="text-2xl font-semibold text-gray-800">דיווח תקלה חדשה</h2>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-xl text-sm font-medium border border-red-100">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">סוג התקלה</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setCategory('general')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  category === 'general'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                }`}
              >
                <Wrench size={24} />
                <span className="text-sm font-bold">תקלה כללית</span>
                <span className="text-xs text-center opacity-80">אחזקה, חשמל, ניקיון</span>
              </button>
              <button
                type="button"
                onClick={() => setCategory('computer')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  category === 'computer'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                }`}
              >
                <Monitor size={24} />
                <span className="text-sm font-bold">תקלת מחשבים</span>
                <span className="text-xs text-center opacity-80">מחשב, רשת, מקרן</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">נושא התקלה (בקצרה)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none text-slate-900"
              placeholder="לדוגמה: מזגן לא עובד"
              maxLength={100}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">מיקום מדויק</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none text-slate-900"
              placeholder="לדוגמה: כיתה ז׳2, בניין ראשי"
              maxLength={100}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">תיאור מפורט (לא חובה)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none resize-none h-32 text-slate-900"
              placeholder="נא לתאר את התקלה בצורה מפורטת ככל הניתן..."
              maxLength={1000}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">שם המדווח/ת</label>
            <input
              type="text"
              value={reporterName}
              onChange={(e) => setReporterName(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none text-slate-900"
              maxLength={100}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">תמונה של התקלה (לא חובה)</label>
            <div className="flex items-center gap-4">
              <label className="cursor-pointer flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-colors shrink-0">
                <ImagePlus size={18} />
                <span>הוספת תמונה</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleImageChange}
                />
              </label>
              {imageBase64 && (
                <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200">
                  <img src={imageBase64} alt="Preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImageBase64(null)}
                    className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full p-0.5 hover:bg-black/70"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-xl transition-colors"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-sm focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50 flex items-center justify-center min-w-[120px]"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'שליחת הדיווח'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
