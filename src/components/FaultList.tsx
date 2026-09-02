import { useState, useEffect, useCallback } from 'react';
import {
  doc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  limit,
  getDocs,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { deleteFaultImage, getFaultImage } from '../lib/faultImages';
import { Fault, FaultStatus, FaultCategory, FIXED_FAULTS_PAGE_SIZE, getFaultCategory, categoryLabel } from '../types';
import {
  Trash2,
  Wrench,
  X,
  ImageIcon,
  Loader2,
  MapPin,
  User,
  Clock,
  ChevronLeft,
  StickyNote,
  Monitor,
  ArrowRightLeft,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';

interface FaultListProps {
  activeFaults: Fault[];
  category: FaultCategory;
  loading: boolean;
  onStatsChange?: () => void;
}

function faultHasImage(fault: Fault): boolean {
  return fault.hasImage === true || !!fault.imageUrl;
}

function statusLabel(status: FaultStatus): string {
  if (status === 'fixed') return 'טופל';
  if (status === 'in_progress') return 'בטיפול';
  return 'פעיל';
}

function statusBadgeClass(status: FaultStatus): string {
  if (status === 'fixed') return 'bg-emerald-100 text-emerald-800';
  if (status === 'in_progress') return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}

function statusAccentClass(status: FaultStatus): string {
  if (status === 'fixed') return 'bg-emerald-500';
  if (status === 'in_progress') return 'bg-amber-500';
  return 'bg-red-500';
}

/** Normalize Firestore Timestamp / plain {seconds} / Date into a valid Date */
function toJsDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'object' && value !== null) {
    const maybe = value as {
      toMillis?: () => number;
      toDate?: () => Date;
      seconds?: number;
      nanoseconds?: number;
      _seconds?: number;
      _nanoseconds?: number;
    };

    if (typeof maybe.toMillis === 'function') {
      const ms = maybe.toMillis();
      if (Number.isFinite(ms)) {
        const d = new Date(ms);
        if (!Number.isNaN(d.getTime())) return d;
      }
    }

    if (typeof maybe.toDate === 'function') {
      const d = maybe.toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
    }

    const seconds = maybe.seconds ?? maybe._seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
      const nanos = maybe.nanoseconds ?? maybe._nanoseconds ?? 0;
      const d = new Date(seconds * 1000 + nanos / 1e6);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value > 1e12 ? value : value * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function formatRelativeFrom(date: Date | null): string {
  if (!date) return '';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfTarget.getTime()) / (24 * 60 * 60 * 1000)
  );

  if (dayDiff === 0) return 'היום';
  if (dayDiff === 1) return 'אתמול';
  if (dayDiff === 2) return 'שלשום';
  if (dayDiff > 2 && dayDiff < 7) return `לפני ${dayDiff} ימים`;

  return formatDistanceToNow(date, { addSuffix: true, locale: he });
}

function formatRelative(fault: Fault): string {
  return formatRelativeFrom(toJsDate(fault.createdAt));
}

function formatAbsolute(fault: Fault, field: 'createdAt' | 'updatedAt'): string {
  const date = toJsDate(fault[field]);
  if (!date) return '—';
  return format(date, 'd MMMM yyyy, HH:mm', { locale: he });
}

export function FaultList({ activeFaults, category, loading, onStatsChange }: FaultListProps) {
  const [filter, setFilter] = useState<'all' | 'open' | 'in_progress' | 'fixed'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [fixedFaults, setFixedFaults] = useState<Fault[]>([]);
  const [fixedLoading, setFixedLoading] = useState(false);
  const [fixedLoadingMore, setFixedLoadingMore] = useState(false);
  const [fixedLastDoc, setFixedLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreFixed, setHasMoreFixed] = useState(false);
  const [fixedLoaded, setFixedLoaded] = useState(false);

  const [treatmentModalActiveFor, setTreatmentModalActiveFor] = useState<Fault | null>(null);
  const [treatmentText, setTreatmentText] = useState('');
  const [savingTreatment, setSavingTreatment] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [transferringId, setTransferringId] = useState<string | null>(null);

  const [selectedFault, setSelectedFault] = useState<Fault | null>(null);
  const [expandedImageUrl, setExpandedImageUrl] = useState<string | null>(null);
  const [imageCache, setImageCache] = useState<Record<string, string>>({});
  const [loadingImageId, setLoadingImageId] = useState<string | null>(null);

  const loadFixedFaults = useCallback(async (loadMore = false) => {
    if (loadMore) {
      setFixedLoadingMore(true);
    } else {
      setFixedLoading(true);
    }

    try {
      const col = collection(db, 'faults');
      // Avoid orderBy + where (needs composite index). Sort client-side instead.
      const q = loadMore && fixedLastDoc
        ? query(
            col,
            where('status', '==', 'fixed'),
            startAfter(fixedLastDoc),
            limit(FIXED_FAULTS_PAGE_SIZE)
          )
        : query(
            col,
            where('status', '==', 'fixed'),
            limit(FIXED_FAULTS_PAGE_SIZE)
          );

      const snapshot = await getDocs(q);
      const page: Fault[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as Fault[];

      page.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() ?? 0;
        const bTime = b.createdAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      });

      const categoryPage = page.filter((f) => getFaultCategory(f) === category);

      setFixedFaults((prev) => {
        const merged = loadMore ? [...prev, ...categoryPage] : categoryPage;
        return merged.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() ?? 0;
          const bTime = b.createdAt?.toMillis?.() ?? 0;
          return bTime - aTime;
        });
      });
      setFixedLastDoc(snapshot.docs[snapshot.docs.length - 1] ?? null);
      setHasMoreFixed(snapshot.docs.length === FIXED_FAULTS_PAGE_SIZE);
      setFixedLoaded(true);
    } catch (error) {
      console.error('Failed to load fixed faults:', error);
      setFixedLoaded(true);
    } finally {
      setFixedLoading(false);
      setFixedLoadingMore(false);
    }
  }, [fixedLastDoc, category]);

  useEffect(() => {
    setFixedLoaded(false);
    setFixedFaults([]);
    setFixedLastDoc(null);
  }, [category]);

  useEffect(() => {
    if (filter === 'fixed' && !fixedLoaded) {
      loadFixedFaults(false);
    }
  }, [filter, fixedLoaded, loadFixedFaults]);

  // Keep detail modal in sync with live / loaded data
  useEffect(() => {
    if (!selectedFault) return;
    const updated =
      activeFaults.find((f) => f.id === selectedFault.id) ??
      fixedFaults.find((f) => f.id === selectedFault.id);
    if (updated) {
      setSelectedFault(updated);
    }
  }, [activeFaults, fixedFaults, selectedFault?.id]);

  const handleViewImage = async (fault: Fault) => {
    if (fault.imageUrl) {
      setExpandedImageUrl(fault.imageUrl);
      return;
    }

    if (imageCache[fault.id]) {
      setExpandedImageUrl(imageCache[fault.id]);
      return;
    }

    setLoadingImageId(fault.id);
    try {
      const dataUrl = await getFaultImage(fault.id);
      if (!dataUrl) {
        alert('לא נמצאה תמונה לתקלה זו.');
        return;
      }
      setImageCache((prev) => ({ ...prev, [fault.id]: dataUrl }));
      setExpandedImageUrl(dataUrl);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `fault_images/${fault.id}`);
      alert('לא ניתן לטעון את התמונה.');
    } finally {
      setLoadingImageId(null);
    }
  };

  const handleToggleStatus = async (fault: Fault) => {
    if (togglingId) return;
    setTogglingId(fault.id);
    try {
      const newStatus: FaultStatus = fault.status === 'fixed' ? 'open' : 'fixed';
      const faultRef = doc(db, 'faults', fault.id);
      await updateDoc(faultRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      if (newStatus === 'fixed') {
        setFixedLoaded(false);
        setFixedFaults([]);
        setFixedLastDoc(null);
        if (selectedFault?.id === fault.id) {
          setSelectedFault({ ...fault, status: newStatus });
        }
      } else {
        setFixedFaults((prev) => prev.filter((f) => f.id !== fault.id));
        if (selectedFault?.id === fault.id) {
          setSelectedFault({ ...fault, status: newStatus });
        }
      }

      onStatsChange?.();
    } catch (error) {
      console.error('Failed to update fault status:', error);
      alert('לא ניתן לעדכן את סטטוס התקלה. נסו שוב.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleSaveTreatment = async () => {
    if (!treatmentModalActiveFor) return;
    setSavingTreatment(true);
    try {
      const faultRef = doc(db, 'faults', treatmentModalActiveFor.id);
      await updateDoc(faultRef, {
        status: 'in_progress',
        treatmentNote: treatmentText,
        updatedAt: serverTimestamp(),
      });
      if (selectedFault?.id === treatmentModalActiveFor.id) {
        setSelectedFault({
          ...treatmentModalActiveFor,
          status: 'in_progress',
          treatmentNote: treatmentText,
        });
      }
      setTreatmentModalActiveFor(null);
      setTreatmentText('');
      onStatsChange?.();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `faults/${treatmentModalActiveFor.id}`);
    } finally {
      setSavingTreatment(false);
    }
  };

  const handleTransferToComputer = async (fault: Fault) => {
    if (transferringId || getFaultCategory(fault) !== 'general') return;
    if (!window.confirm('להעביר תקלה זו לקטגוריית מחשבים?')) return;

    setTransferringId(fault.id);
    try {
      const faultRef = doc(db, 'faults', fault.id);
      await updateDoc(faultRef, {
        category: 'computer',
        updatedAt: serverTimestamp(),
      });
      if (selectedFault?.id === fault.id) {
        setSelectedFault(null);
      }
      onStatsChange?.();
    } catch (error) {
      console.error('Failed to transfer fault:', error);
      alert('לא ניתן להעביר את התקלה. נסו שוב.');
    } finally {
      setTransferringId(null);
    }
  };

  const handleDelete = async (fault: Fault) => {
    if (deletingId !== fault.id) {
      setDeletingId(fault.id);
      setTimeout(() => setDeletingId(null), 3000);
      return;
    }

    try {
      await Promise.all([
        deleteDoc(doc(db, 'faults', fault.id)),
        deleteFaultImage(fault.id).catch(() => undefined),
      ]);
      setFixedFaults((prev) => prev.filter((f) => f.id !== fault.id));
      if (selectedFault?.id === fault.id) setSelectedFault(null);
      setDeletingId(null);
      onStatsChange?.();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `faults/${fault.id}`);
    }
  };

  const isFixedView = filter === 'fixed';
  const isLoading = isFixedView ? fixedLoading && !fixedLoaded : loading;

  const filteredFaults = isFixedView
    ? fixedFaults
    : activeFaults.filter((f) => filter === 'all' || f.status === filter);

  const renderActions = (fault: Fault, compact = false) => (
    <div
      className={`flex gap-2 ${compact ? '' : 'pt-1'}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {getFaultCategory(fault) === 'general' && category === 'general' && (
        <button
          type="button"
          onClick={() => handleTransferToComputer(fault)}
          disabled={transferringId === fault.id}
          className="flex-1 py-2 px-2 text-sm font-bold rounded-xl transition-colors bg-violet-100 text-violet-800 hover:bg-violet-200 disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {transferringId === fault.id ? (
            <div className="w-5 h-5 border-2 border-violet-400/30 border-t-violet-800 rounded-full animate-spin" />
          ) : (
            <>
              <ArrowRightLeft className="w-4 h-4" />
              העבר למחשבים
            </>
          )}
        </button>
      )}
      {fault.status === 'open' && (
        <button
          type="button"
          onClick={() => {
            setTreatmentText(fault.treatmentNote ?? '');
            setTreatmentModalActiveFor(fault);
          }}
          className="flex-1 py-2 px-2 text-sm font-bold rounded-xl transition-colors bg-amber-100 text-amber-800 hover:bg-amber-200"
        >
          המשך טיפול
        </button>
      )}
      <button
        type="button"
        onClick={() => handleToggleStatus(fault)}
        disabled={togglingId === fault.id}
        className={`flex-1 py-2 px-2 text-sm font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          fault.status === 'open' || fault.status === 'in_progress'
            ? 'bg-emerald-500 text-white hover:bg-emerald-600'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
        }`}
      >
        {togglingId === fault.id ? (
          <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
        ) : fault.status === 'fixed' ? (
          'החזר לפעיל'
        ) : (
          'סמן כבוצע'
        )}
      </button>
      <button
        type="button"
        onClick={() => handleDelete(fault)}
        className={`px-3 py-2 rounded-xl transition-colors border shrink-0 ${
          deletingId === fault.id
            ? 'bg-red-500 text-white border-red-500 hover:bg-red-600'
            : 'bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 border-slate-100'
        }`}
        title={deletingId === fault.id ? 'לחצו שוב לאישור מחיקה' : 'מחיקה'}
      >
        <Trash2 className="w-5 h-5" />
      </button>
    </div>
  );

  const renderFaultCard = (fault: Fault) => (
    <article
      key={fault.id}
      role="button"
      tabIndex={0}
      onClick={() => setSelectedFault(fault)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setSelectedFault(fault);
        }
      }}
      className={`group bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col h-fit cursor-pointer
        hover:shadow-md hover:border-slate-300 transition-all
        focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2
        ${fault.status === 'fixed' ? 'opacity-80' : ''}`}
    >
      <div className="flex justify-between items-start gap-2 mb-3">
        <div className="flex flex-wrap gap-1.5">
          <span
            className={`shrink-0 px-2.5 py-1 text-xs font-bold rounded-md ${statusBadgeClass(fault.status)}`}
          >
            {statusLabel(fault.status)}
          </span>
          {getFaultCategory(fault) === 'computer' && (
            <span className="shrink-0 px-2.5 py-1 text-xs font-bold rounded-md bg-violet-100 text-violet-800 flex items-center gap-1">
              <Monitor className="w-3 h-3" />
              {categoryLabel('computer')}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500 font-medium text-left leading-snug">
          {formatRelative(fault)}
        </span>
      </div>

      <h4 className="text-lg font-bold text-slate-800 mb-1.5 line-clamp-2 break-words leading-snug">
        {fault.title}
      </h4>

      {fault.description ? (
        <p className="text-sm text-slate-600 mb-3 whitespace-pre-wrap line-clamp-3 break-words leading-relaxed">
          {fault.description}
        </p>
      ) : (
        <p className="text-sm text-slate-400 mb-3 italic">ללא תיאור</p>
      )}

      {fault.status === 'in_progress' && fault.treatmentNote && (
        <div className="mb-3 bg-amber-50 rounded-lg p-2.5 border border-amber-100">
          <strong className="block mb-0.5 text-xs text-amber-800">המשך טיפול:</strong>
          <p className="text-sm text-amber-900 whitespace-pre-wrap line-clamp-2 break-words">
            {fault.treatmentNote}
          </p>
        </div>
      )}

      <div className="mt-auto space-y-3 pt-1">
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-2 min-w-0 text-sm text-slate-600">
            <div className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
              {fault.reporterName.charAt(0)}
            </div>
            <span className="truncate font-semibold" title={fault.reporterName}>
              {fault.reporterName}
            </span>
            {faultHasImage(fault) && (
              <ImageIcon className="w-4 h-4 text-indigo-500 shrink-0 mr-auto" aria-label="יש תמונה" />
            )}
          </div>
          <div className="flex items-center gap-1.5 min-w-0 text-sm text-slate-500">
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate" title={fault.location}>
              {fault.location}
            </span>
          </div>
        </div>

        <div className="flex items-center text-xs font-semibold text-indigo-600 group-hover:text-indigo-700 transition-colors">
          לחצו לפרטים המלאים
          <ChevronLeft className="w-3.5 h-3.5 mr-0.5 transition-transform group-hover:-translate-x-0.5" />
        </div>

        {renderActions(fault, true)}
      </div>
    </article>
  );

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-2 sm:gap-4 overflow-x-auto pb-2">
          <button
            onClick={() => setFilter('all')}
            className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-bold transition-colors ${filter === 'all' ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            פעילות
          </button>
          <button
            onClick={() => setFilter('open')}
            className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-bold transition-colors ${filter === 'open' ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            פתוחות
          </button>
          <button
            onClick={() => setFilter('in_progress')}
            className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-bold transition-colors ${filter === 'in_progress' ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            בטיפול
          </button>
          <button
            onClick={() => setFilter('fixed')}
            className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-bold transition-colors ${filter === 'fixed' ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            טופלו
          </button>
        </div>
        <p className="hidden sm:block text-xs text-slate-400 font-medium">
          {isFixedView ? 'נטענות לפי דרישה' : 'עדכון בזמן אמת'}
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-20 flex-1">
          <div className="w-8 h-8 flex items-center justify-center border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : filteredFaults.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm mt-4">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Wrench className="text-slate-400" size={32} />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">אין תקלות כאן</h3>
          <p className="text-slate-500 text-sm">לא נמצאו דיווחים התואמים לסינון או שעוד לא דווחו.</p>
        </div>
      ) : (
        <>
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredFaults.map(renderFaultCard)}
          </div>
          {isFixedView && hasMoreFixed && (
            <div className="flex justify-center mt-6">
              <button
                onClick={() => loadFixedFaults(true)}
                disabled={fixedLoadingMore}
                className="px-6 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2"
              >
                {fixedLoadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                טען עוד
              </button>
            </div>
          )}
        </>
      )}

      {/* Detail modal */}
      {selectedFault && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fault-detail-title"
        >
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setSelectedFault(null)}
          />
          <div className="relative w-full sm:max-w-lg max-h-[92vh] sm:max-h-[88vh] bg-white sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <div className={`h-1.5 w-full shrink-0 ${statusAccentClass(selectedFault.status)}`} />

            <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-slate-100">
              <div className="min-w-0 flex-1">
                <span
                  className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-lg mb-2.5 ${statusBadgeClass(selectedFault.status)}`}
                >
                  {statusLabel(selectedFault.status)}
                </span>
                <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-lg mb-2.5 mr-2 bg-slate-100 text-slate-700">
                  {categoryLabel(getFaultCategory(selectedFault))}
                </span>
                <h2
                  id="fault-detail-title"
                  className="text-2xl font-bold text-slate-900 leading-snug break-words"
                >
                  {selectedFault.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFault(null)}
                className="p-2 -mt-1 -ml-1 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors shrink-0"
                title="סגירה"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              <div className="grid grid-cols-1 gap-3">
                <div className="flex items-start gap-3 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                  <MapPin className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-400 mb-0.5">מיקום</p>
                    <p className="text-base font-semibold text-slate-800 break-words">
                      {selectedFault.location}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                  <User className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-400 mb-0.5">מדווח</p>
                    <p className="text-base font-semibold text-slate-800 break-words">
                      {selectedFault.reporterName}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                  <Clock className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
                  <div className="min-w-0 space-y-1.5">
                    <p className="text-xs font-bold text-slate-400">זמנים</p>
                    <p className="text-sm text-slate-800">
                      <span className="font-medium text-slate-500">נוצר: </span>
                      {formatAbsolute(selectedFault, 'createdAt')}
                    </p>
                    <p className="text-sm font-semibold text-indigo-700">
                      {formatRelative(selectedFault)}
                    </p>
                    <p className="text-sm text-slate-800">
                      <span className="font-medium text-slate-500">עודכן: </span>
                      {formatAbsolute(selectedFault, 'updatedAt')}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-500 mb-2">תיאור התקלה</h3>
                <p className="text-base text-slate-800 leading-relaxed whitespace-pre-wrap break-words">
                  {selectedFault.description}
                </p>
              </div>

              {selectedFault.treatmentNote && (
                <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3.5">
                  <div className="flex items-center gap-1.5 text-sm font-bold text-amber-800 mb-2">
                    <StickyNote className="w-4 h-4 shrink-0" />
                    הערת טיפול
                  </div>
                  <p className="text-base text-amber-950 leading-relaxed whitespace-pre-wrap break-words">
                    {selectedFault.treatmentNote}
                  </p>
                </div>
              )}

              {faultHasImage(selectedFault) && (
                <button
                  type="button"
                  onClick={() => handleViewImage(selectedFault)}
                  disabled={loadingImageId === selectedFault.id}
                  className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-base font-bold hover:bg-indigo-100 transition-colors disabled:opacity-50"
                >
                  {loadingImageId === selectedFault.id ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ImageIcon className="w-5 h-5" />
                  )}
                  <span>
                    {loadingImageId === selectedFault.id ? 'טוען תמונה...' : 'צפייה בתמונה המצורפת'}
                  </span>
                </button>
              )}
            </div>

            <div className="shrink-0 border-t border-slate-100 px-5 py-4 bg-white">
              {renderActions(selectedFault)}
            </div>
          </div>
        </div>
      )}

      {expandedImageUrl && (
        <div
          className="fixed inset-0 bg-black/85 z-[60] flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setExpandedImageUrl(null)}
        >
          <button
            type="button"
            onClick={() => setExpandedImageUrl(null)}
            className="absolute top-4 left-4 p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors"
            title="סגירה"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={expandedImageUrl}
            alt="תמונה של התקלה"
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            loading="lazy"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {treatmentModalActiveFor && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-xl font-semibold text-gray-800">המשך טיפול בתקלה</h2>
              <button
                onClick={() => setTreatmentModalActiveFor(null)}
                className="p-2 -m-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">תיאור המשך הטיפול</label>
              <textarea
                value={treatmentText}
                onChange={(e) => setTreatmentText(e.target.value)}
                className="w-full h-32 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all resize-none mb-4"
                placeholder="פרטו מה נעשה והיכן הטיפול עומד כעת..."
                maxLength={1000}
                required
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setTreatmentModalActiveFor(null)}
                  className="flex-1 py-3 px-4 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                >
                  ביטול
                </button>
                <button
                  onClick={handleSaveTreatment}
                  disabled={!treatmentText.trim() || savingTreatment}
                  className="flex-1 py-3 px-4 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {savingTreatment ? (
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    'שמירה והעברה ל"בטיפול"'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
