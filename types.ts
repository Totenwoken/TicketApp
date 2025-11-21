export enum Category {
  GROCERY = 'Alimentación',
  CLOTHING = 'Ropa y Moda',
  ELECTRONICS = 'Electrónica',
  HOME = 'Hogar',
  RESTAURANT = 'Restaurante',
  HEALTH = 'Salud',
  OTHER = 'Otros'
}

export interface ReceiptData {
  id: string;
  storeName: string; // Normalized name (e.g. "ZARA")
  website?: string; // For logo fetching (e.g. "zara.com")
  totalAmount: number;
  currency: string;
  date: string; // ISO Date YYYY-MM-DD
  category: Category;
  barcodeValue?: string; // The value to generate QR/Barcode
  summary?: string;
  imageBase64: string;
  createdAt: number;
}

export interface AnalysisResult {
  storeName: string;
  website?: string;
  totalAmount: number;
  currency: string;
  date: string;
  category: Category;
  barcodeValue?: string;
  summary?: string;
}