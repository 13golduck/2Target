'use client';

import 'dayjs/locale/it';

import dayjs from 'dayjs';

import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';

dayjs.locale('it');

export function DateProvider({ children }) {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="it">
      {children}
    </LocalizationProvider>
  );
}
