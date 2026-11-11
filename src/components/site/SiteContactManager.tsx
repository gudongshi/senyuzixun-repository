import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Upload } from 'lucide-react';
import { uploadImageToStorage } from '../../lib/upload';

// ============================================================
// 类型
// ============================================================
interface ContactForm {
  phone: string;
  address: string;
  website: string;
  email: string;
  qrcode: string;
  map_coords: string;
}

const EMPTY: ContactForm = { phone: '', address: '', website: '', email: '', qrcode: '', map_coords: '' };

export default function SiteContactManager() {
  const [form, setForm] = useState<ContactForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/site/contact', { credentials: 'same-origin' })
      .then(r => r.json())
      .then(result => {
        if (result.success && result.data) {
          const d = result.data;
          setForm({
            phone: d.phone || '',
            address: d.address || '',
            website: d.website || '',
            email: d.email || '',
            qrcode: d.qrcode || '',
            map_coords: d.map_coords || '',
          });
        }
      })
      .catch(() => toast.error('加载联系信息失败'))
      .finally(() => setLoading(false));
  }, []);

  const handleQrUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('请选择图片文件'); return; }
    setQrUploading(true);
    try {
      const url = await uploadImageToStorage(file);
      setForm(f => ({ ...f, qrcode: url }));
      toast.success('二维码上传成功');
    } catch (err: any) { toast.error(err.message || '上传失败'); }
    finally { setQrUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const resp = await fetch('/api/site/contact', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: form.phone.trim(),
          address: form.address.trim(),
          website: form.website.trim(),
          email: form.email.trim(),
          qrcode: form.qrcode.trim(),
          map_coords: form.map_coords.trim(),
        }),
      });
      const result = await resp.json();
      if (result.success) toast.success('保存成功');
      else toast.error(result.error || '保存失败');
    } catch { toast.error('网络异常'); }
    finally { setSaving(false); }
  };

  const update = (field: keyof ContactForm, value: string) => {
    setForm(f => ({ ...f, [field]: value }));
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="size-8 text-purple-400 animate-spin" /></div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1.5">☎️ 电话</label>
          <input type="text" value={form.phone} onChange={e => update('phone', e.target.value)}
            className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-purple-500/50" placeholder="如：400-xxx-xxxx" />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1.5">🌐 网址</label>
          <input type="text" value={form.website} onChange={e => update('website', e.target.value)}
            className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-purple-500/50" placeholder="如：https://www.example.com" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm text-slate-400 mb-1.5">📍 地址</label>
          <input type="text" value={form.address} onChange={e => update('address', e.target.value)}
            className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-purple-500/50" placeholder="如：成都市高新区天府大道 xxx 号" />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1.5">📧 邮箱</label>
          <input type="text" value={form.email} onChange={e => update('email', e.target.value)}
            className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-purple-500/50" placeholder="如：contact@example.com" />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1.5">🗺️ 经纬度</label>
          <input type="text" value={form.map_coords} onChange={e => update('map_coords', e.target.value)}
            className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-purple-500/50" placeholder="如：104.06,30.57" />
        </div>
      </div>

      {/* 二维码 */}
      <div>
        <label className="block text-sm text-slate-400 mb-1.5">📱 二维码图片</label>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleQrUpload} className="hidden" />
        {form.qrcode ? (
          <div className="relative inline-block">
            <img src={form.qrcode} alt="二维码" className="size-28 rounded-xl object-cover border border-slate-600" />
            <button type="button" onClick={() => update('qrcode', '')} className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-red-500 text-white flex items-center justify-center">
              <span className="text-xs leading-none">×</span>
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={qrUploading}
            className="border-2 border-dashed border-slate-600 rounded-xl px-4 py-6 text-slate-500 hover:border-purple-500/50 hover:text-purple-400 transition-all flex flex-col items-center gap-1 disabled:opacity-50">
            {qrUploading ? <><Loader2 className="size-6 animate-spin text-purple-400" /><span className="text-xs">上传中...</span></> : <><Upload size={20} /><span className="text-xs">点击上传二维码图片</span></>}
          </button>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <button type="submit" disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium hover:from-purple-500 hover:to-pink-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save size={16} />}
          保存联系信息
        </button>
      </div>
    </form>
  );
}