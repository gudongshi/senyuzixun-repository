import { supabase } from './supabase';

// ============================================================
// Canvas 图片压缩（最大宽度 1200px，JPEG quality 0.85）
// ============================================================
export function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_W = 1200;
      let w = img.width;
      let h = img.height;
      if (w > MAX_W) {
        h = Math.round(h * (MAX_W / w));
        w = MAX_W;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas 不可用')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('压缩失败')),
        'image/jpeg',
        0.85,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')); };
    img.src = url;
  });
}

// ============================================================
// 上传到 Supabase Storage site_images 桶，返回 public URL
// ============================================================
export async function uploadImageToStorage(file: File): Promise<string> {
  const compressed = await compressImage(file);
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { data, error } = await supabase.storage
    .from('site_images')
    .upload(filename, compressed, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from('site_images')
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

// ============================================================
// 可复用的图片上传按钮 Hook（返回组件 + 状态）
// ============================================================
export type ImageUploadState = {
  loading: boolean;
  url: string;
  setUrl: (u: string) => void;
};

export function createImageUploadHandlers(
  setLoading: (v: boolean) => void,
  setUrl: (v: string) => void,
  currentUrl: string,
) {
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      throw new Error('请选择图片文件');
    }
    setLoading(true);
    try {
      const publicUrl = await uploadImageToStorage(file);
      setUrl(publicUrl);
    } finally {
      setLoading(false);
    }
  };
  return { handleFileChange };
}