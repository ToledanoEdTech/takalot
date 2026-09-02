import { useCallback, useEffect, useState } from 'react';
import {
  Mail,
  Plus,
  Trash2,
  Loader2,
  Bell,
  BellOff,
  Save,
  Wrench,
  Monitor,
  Send,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { EmailRecipient, FaultCategory } from '../types';
import { isValidEmail, recipientCategoriesLabel } from '../types';
import type { FaultNotificationSettings } from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  createRecipientId,
  fetchFaultReminderSettings,
  patchFaultReminderSettings,
  sendTestEmail,
} from '../lib/adminApi';
import {
  buildRecipientsFromRoles,
  emptyRoleContact,
  splitRecipientsByRole,
  type RoleContact,
} from '../lib/recipientRoles';
import { DEFAULT_FAULT_NOTIFICATION_SETTINGS } from '../../shared/notification-types';

export function EmailSettingsPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [settings, setSettings] = useState<FaultNotificationSettings | null>(null);
  const [houseFather, setHouseFather] = useState<RoleContact>(emptyRoleContact());
  const [computerTech, setComputerTech] = useState<RoleContact>(emptyRoleContact());
  const [extraRecipients, setExtraRecipients] = useState<EmailRecipient[]>([]);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const userId = user?.uid;

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFaultReminderSettings(user);
      setSettings(data.settings);
      const split = splitRecipientsByRole(data.settings.recipients);
      setHouseFather(split.houseFatherContact);
      setComputerTech(split.computerTechContact);
      setExtraRecipients(split.extraRecipients);
      setDirty(false);
    } catch (err) {
      setSettings({ ...DEFAULT_FAULT_NOTIFICATION_SETTINGS });
      setHouseFather(emptyRoleContact());
      setComputerTech(emptyRoleContact());
      setExtraRecipients([]);
      setError(
        err instanceof Error
          ? `${err.message} — בפיתוח מקומי הריצו: npx vercel dev`
          : 'שגיאה בטעינת ההגדרות'
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!userId) return;
    load();
  }, [userId, load]);

  const markDirty = () => setDirty(true);

  const validateRoles = (): string | null => {
    if (houseFather.email.trim() && !isValidEmail(houseFather.email)) {
      return 'מייל אב הבית אינו תקין';
    }
    if (computerTech.email.trim() && !isValidEmail(computerTech.email)) {
      return 'מייל איש המחשבים אינו תקין';
    }
    if (!houseFather.email.trim() && !computerTech.email.trim()) {
      return 'יש להזין לפחות מייל אחד — אב הבית או איש המחשבים';
    }
    return null;
  };

  const handleSave = async () => {
    if (!user || !settings) return;
    const validationError = validateRoles();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const recipients = buildRecipientsFromRoles(houseFather, computerTech, extraRecipients);
      const data = await patchFaultReminderSettings(user, {
        ...settings,
        enabled: true,
        instantOnCreate: true,
        recipients,
      });
      setSettings(data.settings);
      const split = splitRecipientsByRole(data.settings.recipients);
      setHouseFather(split.houseFatherContact);
      setComputerTech(split.computerTechContact);
      setExtraRecipients(split.extraRecipients);
      setDirty(false);
      setSuccess('ההגדרות נשמרו — מיילים יישלחו לנמענים שהגדרת');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!user || !testEmailTo.trim()) return;
    setRunning(true);
    setError(null);
    setSuccess(null);
    try {
      await sendTestEmail(user, testEmailTo.trim());
      setSuccess(`מייל בדיקה נשלח ל-${testEmailTo.trim()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשליחת מייל בדיקה');
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 flex justify-center shadow-sm">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!settings) {
    return null;
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-l from-indigo-50 to-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">הגדרות מייל לתקלות חדשות</h2>
              <p className="text-sm text-slate-500">
                כאן קובעים למי נשלח מייל בכל פעם שעולה תקלה באתר
              </p>
            </div>
          </div>
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold ${
              settings.enabled
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {settings.enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            {settings.enabled ? 'שליחת מיילים פעילה' : 'שליחת מיילים כבויה'}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm">{error}</div>
        )}
        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl text-sm">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="p-5 rounded-2xl border-2 border-amber-100 bg-amber-50/50 space-y-4">
            <div className="flex items-center gap-2 text-amber-900">
              <Wrench className="w-5 h-5" />
              <h3 className="font-bold text-lg">אב הבית</h3>
            </div>
            <p className="text-sm text-amber-800/80">
              מקבל מייל על כל <strong>תקלה כללית</strong> חדשה (אחזקה, חשמל, ניקיון וכו׳)
            </p>
            <div className="space-y-3">
              <input
                type="text"
                value={houseFather.name}
                onChange={(e) => {
                  setHouseFather((v) => ({ ...v, name: e.target.value }));
                  markDirty();
                }}
                placeholder="שם (לדוגמה: הרב פלוני)"
                className="w-full px-4 py-2.5 bg-white border border-amber-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-amber-400"
              />
              <input
                type="email"
                value={houseFather.email}
                onChange={(e) => {
                  setHouseFather((v) => ({ ...v, email: e.target.value }));
                  markDirty();
                }}
                placeholder="email@zvialod.com"
                className="w-full px-4 py-2.5 bg-white border border-amber-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="p-5 rounded-2xl border-2 border-violet-100 bg-violet-50/50 space-y-4">
            <div className="flex items-center gap-2 text-violet-900">
              <Monitor className="w-5 h-5" />
              <h3 className="font-bold text-lg">איש המחשבים</h3>
            </div>
            <p className="text-sm text-violet-800/80">
              מקבל מייל על כל <strong>תקלת מחשבים</strong> חדשה (מחשב, רשת, מקרן וכו׳)
            </p>
            <div className="space-y-3">
              <input
                type="text"
                value={computerTech.name}
                onChange={(e) => {
                  setComputerTech((v) => ({ ...v, name: e.target.value }));
                  markDirty();
                }}
                placeholder="שם (לדוגמה: יוסי הטכנאי)"
                className="w-full px-4 py-2.5 bg-white border border-violet-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-violet-400"
              />
              <input
                type="email"
                value={computerTech.email}
                onChange={(e) => {
                  setComputerTech((v) => ({ ...v, email: e.target.value }));
                  markDirty();
                }}
                placeholder="tech@zvialod.com"
                className="w-full px-4 py-2.5 bg-white border border-violet-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-violet-400"
              />
            </div>
          </div>
        </div>

        {extraRecipients.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-slate-600">נמענים נוספים</h4>
            <ul className="space-y-2">
              {extraRecipients.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                >
                  <div>
                    <span className="font-bold text-slate-800">{r.name}</span>
                    <span className="text-slate-500 mx-2">•</span>
                    <span className="text-slate-600">{r.email}</span>
                    <span className="text-indigo-600 mr-2">({recipientCategoriesLabel(r.categories)})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setExtraRecipients((prev) => prev.filter((x) => x.id !== r.id));
                      markDirty();
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            שמירת הגדרות
          </button>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-700"
          >
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            הגדרות מתקדמות ובדיקות
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  value={testEmailTo}
                  onChange={(e) => setTestEmailTo(e.target.value)}
                  placeholder="מייל לבדיקה שה-SMTP עובד"
                  className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                />
                <button
                  type="button"
                  onClick={handleTestEmail}
                  disabled={running || !testEmailTo.trim()}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 text-white text-sm font-bold rounded-lg disabled:opacity-50"
                >
                  {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  שליחת מייל בדיקה
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  const name = prompt('שם הנמען');
                  const email = prompt('מייל');
                  if (!name || !email || !isValidEmail(email)) return;
                  const cats = prompt('סוגים: general, computer, both', 'both');
                  const categories: FaultCategory[] =
                    cats === 'general' ? ['general'] : cats === 'computer' ? ['computer'] : ['general', 'computer'];
                  setExtraRecipients((prev) => [
                    ...prev,
                    { id: createRecipientId(), name, email: email.toLowerCase(), categories },
                  ]);
                  markDirty();
                }}
                className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800"
              >
                <Plus className="w-4 h-4" />
                הוספת נמען נוסף
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
