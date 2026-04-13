import { OAuthProvider, GoogleAuthProvider } from "firebase/auth";
var c = new OAuthProvider('apple.com').credential({ idToken: 'A', rawNonce: 'B' });
var g = GoogleAuthProvider.credential('idToken', 'accessToken');
