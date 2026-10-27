// Configuration web Firebase. Ces valeurs sont publiques par nature (elles sont envoyées
// à chaque navigateur) : la sécurité repose sur les règles database.rules.json.
export const firebaseConfig = {
  apiKey: 'AIzaSyDWmPbWNbmc_qN0AOZsYYhFm-SrRgj276M',
  authDomain: 'toc-voisins.firebaseapp.com',
  databaseURL: 'https://toc-voisins-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'toc-voisins',
  storageBucket: 'toc-voisins.firebasestorage.app',
  messagingSenderId: '263304558925',
  appId: '1:263304558925:web:2b16cacad5063c91e81f04',
};

export const isFirebaseConfigured = () => !!firebaseConfig.apiKey && !!firebaseConfig.databaseURL;
