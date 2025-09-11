import React from 'react';
import { Source } from '@/types/chat';

interface SourceCitationProps {
  sources: Source[];
}

const SourceCitation: React.FC<SourceCitationProps> = ({ sources }) => {
  const getTableMarkerClass = (tableName: string) => {
    const upperTable = tableName?.toUpperCase();
    switch(upperTable) {
      case 'OZELGELER':
        return 'marker-cyan';
      case 'DANISTAYKARARLARI':
        return 'marker-pink';
      case 'MAKALELER':
        return 'marker-green';
      case 'SORUCEVAP':
        return 'marker-yellow';
      default:
        return '';
    }
  };

  const getTableDisplayName = (tableName: string) => {
    const upperTable = tableName?.toUpperCase();
    switch(upperTable) {
      case 'OZELGELER':
        return 'Özelge';
      case 'DANISTAYKARARLARI':
        return 'Danıştay';
      case 'MAKALELER':
        return 'Makale';
      case 'SORUCEVAP':
        return 'S/C';
      default:
        return 'Kaynak';
    }
  };

  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-3 space-y-1.5">
      <div className="text-xs text-gray-500">
        İlgili Konular:
      </div>
      <div className="space-y-1">
        {sources.map((source, idx) => (
          <div key={idx} className="text-xs text-gray-600 flex items-start gap-2">
            <span className="flex items-center justify-center w-5 h-5 text-xs font-medium text-gray-600 bg-gray-100 rounded-full">
              {idx + 1}
            </span>
            <div className="flex-1 flex items-start justify-between">
              <div className="flex-1">
                {source.sourceTable && (
                  <span className={`font-medium ${getTableMarkerClass(source.sourceTable)}`}>
                    [{getTableDisplayName(source.sourceTable)}]
                  </span>
                )}
                {(source.citation || source.title) && (
                  <span className="ml-2">
                    {source.citation || source.title}
                  </span>
                )}
              </div>
              {source.relevanceScore && (
                <span className="text-gray-400 ml-2">
                  {Math.round(source.relevanceScore * 100)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SourceCitation;