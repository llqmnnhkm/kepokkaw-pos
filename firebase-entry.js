// Source for firebase.js. Rebuild with: npm i firebase esbuild && npx esbuild firebase-entry.js --bundle --minify --format=iife --target=safari15 --legal-comments=none --outfile=firebase.js
import { initializeApp, deleteApp } from 'firebase/app';
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence,
  onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword,
  sendPasswordResetEmail, connectAuthEmulator
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager, memoryLocalCache,
  doc, collection, onSnapshot, writeBatch, setDoc, getDoc, getDocs, deleteField, increment,
  serverTimestamp, connectFirestoreEmulator, onSnapshotsInSync
} from 'firebase/firestore';

window.KKFB = {
  initializeApp, deleteApp,
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence,
  onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword,
  sendPasswordResetEmail, connectAuthEmulator,
  initializeFirestore, persistentLocalCache, persistentSingleTabManager, memoryLocalCache,
  doc, collection, onSnapshot, writeBatch, setDoc, getDoc, getDocs, deleteField, increment,
  serverTimestamp, connectFirestoreEmulator, onSnapshotsInSync
};
