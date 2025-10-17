export const tokenStore = {
  get: () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null),
  set: (t: string) => localStorage.setItem('token', t),
  clear: () => localStorage.removeItem('token'),
};

