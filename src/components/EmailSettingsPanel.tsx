import { useEffect, useState } from 'react';
import {
  Mail,
  Plus,
  Trash2,
  Loader2,
  Bell,
  BellOff,
  Save,
  UserPlus,
  Play,
  FlaskConical,
  Zap,
  Send,
} from 'lucide-react';
import type { EmailRecipient, FaultCategory } from '../types';
import { isValidEmail, recipientCategoriesLabel } from '../types';
import type { FaultNotificationSettings } from '../types';
import type { SettingsPreview } from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  createRecipientId,
  fetchFaultReminderSettings,
  patchFaultReminderSettings,
  runFaultRemindersManual,
  sendTestEmail,
} from '../lib/adminApi';

interface DraftRecipient {
  name: string;
  email: string;
  general: boolean;
  computer: boolean;
  reminderOptOut: boolean;
}

const emptyDraft = (): DraftRecipient => ({
  name: '',
  email: '',
  general: true,
  computer: false,
  reminderOptOut: false,
});

function draftToCategories(draft: DraftRecipient): FaultCategory[] {
  const categories: FaultCategory[] = [];
  if (draft.general) categories.push('general');
  if (draft.computer) categories.push('computer');
  return categories;
}

function recipientToDraft(recipient: EmailRecipient): DraftRecipient {
  return {
    name: recipient.name,
    email: recipient.email,
    general: recipient.categories.includes('general'),
    computer: recipient.categories.includes('computer'),
    reminderOptOut: recipient.reminderOptOut ?? false,
  };
}

export function EmailSettingsPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [settings, setSettings] = useState<FaultNotificationSettings | null>(null);
  const [preview, setPreview] = useState<SettingsPreview | null>(null);
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);
  const [draft, setDraft] = useState<DraftRecipient>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFaultReminderSettings(user);
      setSettings(data.settings);
      setPreview(data.preview);
      setRecipients(data.settings.recipients);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת ההגדרות');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user]);

  const updateLocalSetting = <K extends keyof FaultNotificationSettings>(
    key: K,
    value: FaultNotificationSettings[K]
  ) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  };

  const validateDraft = (value: DraftRecipient): string | null => {
    if (!value.name.trim()) return 'נא להזין שם';
    if (!value.email.trim()) return 'נא להזין כתובת מייל';
    if (!isValidEmail(value.email)) return 'כתובת המייל אינה תקינה';
    if (!value.general && !value.computer) return 'נא לבחור לפחות סוג תקלה אחד';
    const duplicate = recipients.some(
      (r) => r.email.toLowerCase() === value.email.trim().toLowerCase() && r.id !== editingId
    );
    if (duplicate) return 'כתובת המייל כבר קיימת ברשימה';
    return null;
  };

  const handleAddOrUpdate = () => {
    const validationError = validateDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload: EmailRecipient = {
      id: editingId ?? createRecipientId(),
      name: draft.name.trim(),
      email: draft.email.trim().toLowerCase(),
      categories: draftToCategories(draft),
      reminderOptOut: draft.reminderOptOut,
    };

    if (editingId) {
      setRecipients((prev) => prev.map((r) => (r.id === editingId ? payload : r)));
      setEditingId(null);
    } else {
      setRecipients((prev) => [...prev, payload]);
    }

    setDraft(emptyDraft());
    setError(null);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!user || !settings) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await patchFaultReminderSettings(user, {
        ...settings,
        recipients,
      });
      setSettings(data.settings);
      setPreview(data.preview);
      setRecipients(data.settings.recipients);
      setDirty(false);
      setSuccess('ההגדרות נשמרו בהצלחה');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const handleManualRun = async (dryRun: boolean, force = false) => {
    if (!user) return;
    setRunning(dryRun ? 'dry' : force ? 'force' : 'run');
    setError(null);
    setSuccess(null);
    try {
      const { summary } = await runFaultRemindersManual(user, { dryRun, force });
      setSuccess(
        dryRun
          ? `הרצה יבשה: ${summary.sent} היו נשלחים, ${summary.skipped} דולגו`
          : `נשלחו ${summary.sent}, דולגו ${summary.skipped}, שגיאות ${summary.errors}`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בהרצה');
    } finally {
      setRunning(null);
    }
  };

  const handleTestEmail = async () => {
    if (!user || !testEmailTo.trim()) return;
    setRunning('test');
    setError(null);
    setSuccess(null);
    try {
      await sendTestEmail(user, testEmailTo.trim());
      setSuccess(`מייל בדיקה נשלח ל-${testEmailTo.trim()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשליחת מייל בדיקה');
    } finally {
      setRunning(null);
    }
  };

  if (loading || !settings) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 flex justify-center">
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5 text-indigo-400 shrink-0" />
          <div>
            <h3 className="font-bold text-white">התראות ותזכורות מייל</h3>
            <p className="text-xs text-slate-400">
              מייל מיידי בדיווח חדש + תזכורות יומיות לתקלות פתוחות
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => updateLocalSetting('enabled', !settings.enabled)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors shrink-0 ${
            settings.enabled
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-slate-700 text-slate-400 border border-slate-600'
          }`}
        >
          {settings.enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          {settings.enabled ? 'מערכת פעילה' : 'מערכת כבויה'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-300 rounded-lg text-sm">{error}</div>
      )}
      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-lg text-sm">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-700 rounded-xl cursor-pointer">
          <span className="text-sm text-slate-200">מייל מיידי בדיווח תקלה חדשה</span>
          <input
            type="checkbox"
            checked={settings.instantOnCreate}
            onChange={(e) => updateLocalSetting('instantOnCreate', e.target.checked)}
            className="w-4 h-4"
          />
        </label>
        <label className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-700 rounded-xl cursor-pointer">
          <span className="text-sm text-slate-200">תזכורת יומית — תקלה פתוחה מאתמול</span>
          <input
            type="checkbox"
            checked={settings.postDueEnabled}
            onChange={(e) => updateLocalSetting('postDueEnabled', e.target.checked)}
            className="w-4 h-4"
          />
        </label>
        <label className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-700 rounded-xl cursor-pointer">
          <span className="text-sm text-slate-200">תזכורות לפני (ימים מתאריך הדיווח)</span>
          <input
            type="checkbox"
            checked={settings.preDueReminders.enabled}
            onChange={(e) =>
              updateLocalSetting('preDueReminders', {
                ...settings.preDueReminders,
                enabled: e.target.checked,
              })
            }
            className="w-4 h-4"
          />
        </label>
        <label className="p-3 bg-slate-900/50 border border-slate-700 rounded-xl">
          <span className="text-sm text-slate-200 block mb-2">מינימום תקלות לשליחה</span>
          <input
            type="number"
            min={1}
            max={20}
            value={settings.minThreshold}
            onChange={(e) => updateLocalSetting('minThreshold', Number(e.target.value) || 1)}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
          />
        </label>
      </div>

      {settings.preDueReminders.enabled && (
        <label className="block">
          <span className="text-sm text-slate-300 mb-2 block">ימים לפני (מופרדים בפסיק, למשל: 7,3,1)</span>
          <input
            type="text"
            value={settings.preDueReminders.daysBefore.join(', ')}
            onChange={(e) => {
              const days = e.target.value
                .split(',')
                .map((s) => parseInt(s.trim(), 10))
                .filter((n) => Number.isFinite(n) && n > 0);
              updateLocalSetting('preDueReminders', {
                ...settings.preDueReminders,
                daysBefore: days.length ? days : [7, 3, 1],
              });
            }}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm"
          />
        </label>
      )}

      {preview && (
        <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-sm text-indigo-200 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>תקלות post-due: <strong>{preview.postDueCount}</strong></div>
          <div>תקלות pre-due: <strong>{preview.preDueCount}</strong></div>
          <div>נמענים מתוכננים: <strong>{preview.wouldSend}</strong></div>
          <div>ידולגו: <strong>{preview.wouldSkip}</strong></div>
          {settings.lastRunAt && (
            <div className="col-span-2 md:col-span-3 text-xs text-indigo-300/80">
              הרצה אחרונה: {new Date(settings.lastRunAt).toLocaleString('he-IL')}
              {settings.lastRunSummary &&
                ` — נשלחו ${settings.lastRunSummary.sent}, דולגו ${settings.lastRunSummary.skipped}, שגיאות ${settings.lastRunSummary.errors}`}
            </div>
          )}
        </div>
      )}

      {recipients.length === 0 ? (
        <div className="text-center py-6 text-slate-400 text-sm border border-dashed border-slate-600 rounded-xl">
          <UserPlus className="w-8 h-8 mx-auto mb-2 opacity-50" />
          לא הוגדרו נמענים.
        </div>
      ) : (
        <ul className="space-y-2">
          {recipients.map((recipient) => (
            <li
              key={recipient.id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-slate-900/50 border border-slate-700 rounded-xl"
            >
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white truncate">
                  {recipient.name}
                  {recipient.reminderOptOut && (
                    <span className="mr-2 text-xs text-amber-400">(opt-out)</span>
                  )}
                </p>
                <p className="text-sm text-slate-400 truncate">{recipient.email}</p>
                <p className="text-xs text-indigo-300 mt-1">
                  {recipientCategoriesLabel(recipient.categories)}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(recipient.id);
                    setDraft(recipientToDraft(recipient));
                  }}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600"
                >
                  עריכה
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRecipients((prev) => prev.filter((r) => r.id !== recipient.id));
                    setDirty(true);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-slate-700 pt-5 space-y-4">
        <h4 className="text-sm font-bold text-slate-300">
          {editingId ? 'עריכת נמען' : 'הוספת נמען'}
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="שם"
            className="px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm"
          />
          <input
            type="email"
            value={draft.email}
            onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            placeholder="email@zvialod.com"
            className="px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-slate-300">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.general} onChange={(e) => setDraft((d) => ({ ...d, general: e.target.checked }))} />
            תקלות כלליות
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.computer} onChange={(e) => setDraft((d) => ({ ...d, computer: e.target.checked }))} />
            תקלות מחשבים
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.reminderOptOut} onChange={(e) => setDraft((d) => ({ ...d, reminderOptOut: e.target.checked }))} />
            לא לשלוח תזכורות (opt-out)
          </label>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handleAddOrUpdate} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg">
            <Plus className="w-4 h-4" />
            {editingId ? 'עדכון' : 'הוספה'}
          </button>
          {editingId && (
            <button type="button" onClick={() => { setEditingId(null); setDraft(emptyDraft()); }} className="px-4 py-2 bg-slate-700 text-slate-200 text-sm font-bold rounded-lg">
              ביטול
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-slate-700 pt-5 space-y-3">
        <h4 className="text-sm font-bold text-slate-300">בדיקות והרצות</h4>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={testEmailTo}
            onChange={(e) => setTestEmailTo(e.target.value)}
            placeholder="מייל לבדיקת SMTP"
            className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm"
          />
          <button
            type="button"
            onClick={handleTestEmail}
            disabled={running !== null || !testEmailTo.trim()}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 text-white text-sm font-bold rounded-lg disabled:opacity-50"
          >
            {running === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            בדיקת SMTP
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => handleManualRun(true)} disabled={running !== null} className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white text-sm font-bold rounded-lg disabled:opacity-50">
            {running === 'dry' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
            הרצה יבשה
          </button>
          <button type="button" onClick={() => handleManualRun(false)} disabled={running !== null} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-bold rounded-lg disabled:opacity-50">
            {running === 'run' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            הרצת תזכורות
          </button>
          <button type="button" onClick={() => handleManualRun(false, true)} disabled={running !== null} className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-lg disabled:opacity-50">
            {running === 'force' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            שליחה בכוח
          </button>
        </div>
      </div>

      <div className="flex justify-end pt-2 border-t border-slate-700">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          שמירת הגדרות
        </button>
      </div>
    </div>
  );
}
