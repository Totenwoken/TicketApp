import React from 'react';
import { ReceiptData } from '../types';
import { ChevronRight } from 'lucide-react';

interface ReceiptCardProps {
  receipt: ReceiptData;
  onClick: (receipt: ReceiptData) => void;
}

const ReceiptCard: React.FC<ReceiptCardProps> = ({ receipt, onClick }) => {
  const dateObj = new Date(receipt.date);
  const day = dateObj.toLocaleDateString('es-ES', { day: 'numeric' });
  const month = dateObj.toLocaleDateString('es-ES', { month: 'short' });
  const year = dateObj.toLocaleDateString('es-ES', { year: 'numeric' });

  return (
    <div 
      onClick={() => onClick(receipt)}
      className="bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100 flex items-center active:scale-[0.98] transition-transform cursor-pointer"
    >
      {/* Date Box */}
      <div className="flex flex-col items-center justify-center bg-gray-50 rounded-lg w-14 h-14 mr-4 border border-gray-100 shrink-0">
        <span className="text-xs font-bold text-gray-500 uppercase">{month}</span>
        <span className="text-xl font-bold text-gray-800 leading-none">{day}</span>
        <span className="text-[10px] text-gray-400">{year}</span>
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="text-gray-900 font-medium truncate">{receipt.summary || 'Compra'}</p>
        <div className="flex items-center mt-1">
           <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
             {new Date(receipt.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
           </span>
        </div>
      </div>

      <div className="text-right shrink-0 ml-2">
        <p className="font-bold text-lg text-gray-900">{receipt.totalAmount.toFixed(2)} {receipt.currency}</p>
      </div>
      
      <ChevronRight className="w-5 h-5 text-gray-300 ml-2" />
    </div>
  );
};

export default ReceiptCard;