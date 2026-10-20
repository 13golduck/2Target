// Caricamento di foto e video su una pubblicazione, dal browser: lo usano il pannello Pubblica e «Crea post».

// Instagram accetta solo JPEG: le immagini si convertono nel browser prima del caricamento
export async function prepareImage(file) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  if (file.type === 'image/jpeg') return { blob: file, type: 'image/jpeg', width, height, name: file.name };
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  return { blob, type: 'image/jpeg', width, height, name: file.name.replace(/\.\w+$/, '.jpg') };
}

export function videoSize(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      resolve({ width: v.videoWidth, height: v.videoHeight });
      URL.revokeObjectURL(v.src);
    };
    v.onerror = () => resolve({ width: null, height: null });
    v.src = URL.createObjectURL(file);
  });
}

/** extra: parametri dello Studio (materiale=1 per il materiale di lavoro, origine=grafica per le pagine esportate). */
export function upload(itemId, prepared, onProgress, extra = {}) {
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams({ ...extra, scheda: itemId, nome: prepared.name });
    if (prepared.width) q.set('w', prepared.width);
    if (prepared.height) q.set('h', prepared.height);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/media/carica?${q}`);
    xhr.setRequestHeader('Content-Type', prepared.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* risposta non JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body.error ?? `Caricamento non riuscito (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Connessione interrotta durante il caricamento'));
    xhr.send(prepared.blob);
  });
}

