'use client';

import { useMemo, useEffect } from 'react';

// ----------------------------------------------------------------------

// L'anteprima si ricava dal file durante il render (niente setState in un effetto);
// l'effetto serve solo a liberare l'URL temporaneo quando il file cambia o il componente sparisce.

export function useFilePreview(file) {
  const previewUrl = useMemo(() => {
    if (file instanceof File) return URL.createObjectURL(file);
    return typeof file === 'string' ? file : '';
  }, [file]);

  useEffect(() => {
    if (!(file instanceof File)) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [file, previewUrl]);

  return { previewUrl };
}

// ----------------------------------------------------------------------

export function revokeObjectUrls(urls) {
  urls.forEach((url) => URL.revokeObjectURL(url));
}

export function useFilesPreview(files) {
  const filesPreview = useMemo(
    () => files.map((file) => ({ file, previewUrl: file instanceof File ? URL.createObjectURL(file) : file })),
    [files]
  );

  useEffect(
    () => () => revokeObjectUrls(filesPreview.filter((p) => p.file instanceof File).map((p) => p.previewUrl)),
    [filesPreview]
  );

  return { filesPreview };
}
