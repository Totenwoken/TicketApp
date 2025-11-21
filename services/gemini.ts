import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, Category } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeReceiptImage = async (base64Image: string): Promise<AnalysisResult> => {
  try {
    // Remove header if present
    const cleanBase64 = base64Image.split(',')[1] || base64Image;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: cleanBase64
            }
          },
          {
            text: "Analiza este ticket. Extrae: nombre tienda (NORMALIZADO, ej: 'Zara' no 'Zara España SA'), dominio web aproximado (ej: 'zara.com') para buscar su logo, fecha compra (YYYY-MM-DD), total, moneda, y código de barras/ticket ID. Categoriza."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            storeName: { type: Type.STRING, description: "Nombre comercial limpio y corto (ej: Mercadona, Zara, MediaMarkt)" },
            website: { type: Type.STRING, description: "Dominio web principal de la tienda (ej: mercadona.es, zara.com). Sin https://" },
            totalAmount: { type: Type.NUMBER, description: "Importe total" },
            currency: { type: Type.STRING, description: "Símbolo de moneda" },
            date: { type: Type.STRING, description: "Fecha de COMPRA en formato YYYY-MM-DD" },
            category: { 
              type: Type.STRING, 
              enum: Object.values(Category),
              description: "Categoría"
            },
            barcodeValue: { type: Type.STRING, description: "Valor del código de barras o número de ticket" },
            summary: { type: Type.STRING, description: "Resumen muy breve (ej: '2 Pantalones', 'Compra semanal')" }
          },
          required: ["storeName", "totalAmount", "date", "category"],
        }
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text) as AnalysisResult;
      // Fallback normalization if AI misses it
      data.storeName = data.storeName.trim().toUpperCase();
      return data;
    } else {
      throw new Error("No response text from Gemini");
    }

  } catch (error) {
    console.error("Error analyzing receipt:", error);
    throw error;
  }
};