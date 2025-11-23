import { ReceiptData, User } from '../types';

const DB_NAME = 'TicketKeeperDB';
const DB_VERSION = 2; // Incremented version to add users store

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Store for Receipts
      if (!db.objectStoreNames.contains('receipts')) {
        const store = db.createObjectStore('receipts', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Store for Users (New in v2)
      if (!db.objectStoreNames.contains('users')) {
        db.createObjectStore('users', { keyPath: 'email' });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

// --- Receipt Operations ---

export const saveReceipt = async (receipt: ReceiptData): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['receipts'], 'readwrite');
    const store = transaction.objectStore('receipts');
    const request = store.put(receipt);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getAllReceipts = async (): Promise<ReceiptData[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['receipts'], 'readonly');
    const store = transaction.objectStore('receipts');
    const index = store.index('createdAt');
    const request = index.getAll();

    request.onsuccess = () => {
      const results = request.result as ReceiptData[];
      resolve(results.reverse()); // Newest first
    };
    request.onerror = () => reject(request.error);
  });
};

export const deleteReceipt = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['receipts'], 'readwrite');
    const store = transaction.objectStore('receipts');
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// --- User Operations ---

export const createUser = async (user: User): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['users'], 'readwrite');
    const store = transaction.objectStore('users');
    
    // Check if email exists first (though keyPath handles uniqueness, we want a clean error)
    const checkRequest = store.get(user.email);
    
    checkRequest.onsuccess = () => {
      if (checkRequest.result) {
        reject(new Error("El usuario ya existe"));
      } else {
        const addRequest = store.add(user);
        addRequest.onsuccess = () => resolve();
        addRequest.onerror = () => reject(addRequest.error);
      }
    };
    checkRequest.onerror = () => reject(checkRequest.error);
  });
};

export const getUser = async (email: string): Promise<User | undefined> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['users'], 'readonly');
    const store = transaction.objectStore('users');
    const request = store.get(email);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};