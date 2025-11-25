import { ReceiptData, User } from '../types';

const DB_NAME = 'TicketKeeperDB';
const DB_VERSION = 4;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const transaction = (event.target as IDBOpenDBRequest).transaction;
      
      // Store for Receipts
      let receiptStore;
      if (!db.objectStoreNames.contains('receipts')) {
        receiptStore = db.createObjectStore('receipts', { keyPath: 'id' });
        receiptStore.createIndex('createdAt', 'createdAt', { unique: false });
      } else {
        receiptStore = transaction?.objectStore('receipts');
      }

      if (receiptStore && !receiptStore.indexNames.contains('userEmail')) {
        receiptStore.createIndex('userEmail', 'userEmail', { unique: false });
      }

      // Store for Users
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

export const getReceiptsByUser = async (userEmail: string): Promise<ReceiptData[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['receipts'], 'readonly');
    const store = transaction.objectStore('receipts');
    const index = store.index('userEmail');
    const request = index.getAll(IDBKeyRange.only(userEmail));

    request.onsuccess = () => {
      const results = request.result as ReceiptData[];
      results.sort((a, b) => b.createdAt - a.createdAt);
      resolve(results);
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
    
    // Attempt add directly. If it fails, we handle the error.
    // This avoids race conditions between get() and add()
    const request = store.add(user);

    request.onsuccess = () => resolve();
    
    request.onerror = (event) => {
      // ConstraintError means the key (email) already exists
      if (request.error && request.error.name === 'ConstraintError') {
        reject(new Error("El usuario ya existe"));
      } else {
        console.error("Error creating user DB:", request.error);
        reject(request.error);
      }
    };
  });
};

export const updateUser = async (user: User): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['users'], 'readwrite');
    const store = transaction.objectStore('users');
    const request = store.put(user); 

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
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