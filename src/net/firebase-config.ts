// Configuration web Firebase. Ces valeurs sont publiques par nature (elles sont envoyées
// à chaque navigateur) : la sécurité repose sur les règles database.rules.json.
// Remplacez-les par celles de votre projet (console Firebase > Paramètres du projet > Vos applications).
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  databaseURL: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

export const isFirebaseConfigured = () => !!firebaseConfig.apiKey && !!firebaseConfig.databaseURL;
