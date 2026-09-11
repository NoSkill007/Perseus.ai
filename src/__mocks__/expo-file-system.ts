export const documentDirectory = 'file:///data/user/0/ai.perseus.app/files/';

export const getInfoAsync = async (uri: string) => ({
  exists: true,
  isDirectory: uri.endsWith('/'),
  size: 1024,
  uri,
});

export const makeDirectoryAsync = async (dir: string, options?: { intermediates?: boolean }) => {};

export const readAsStringAsync = async (uri: string) => '';
export const writeAsStringAsync = async (uri: string, contents: string) => {};
export const deleteAsync = async (uri: string) => {};
