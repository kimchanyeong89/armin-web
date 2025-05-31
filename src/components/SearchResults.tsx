// src/components/SearchResults.tsx

import React from 'react';

interface SearchResultsProps {
  searchType: string;
  results: any[];
}

const SearchResults: React.FC<SearchResultsProps> = ({ searchType, results }) => {
  if (!searchType) return <div></div>;

  if (searchType === 'museum') {
    return (
      <div>
        {results.map((exhibition, index) => (
          <div key={index} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '5px' }}>
            <h3>{exhibition.museum} ({exhibition.location})</h3>
            <p>전시 작품:</p>
            {exhibition.works.map((work: any, idx: number) => (
              <div key={idx} style={{ marginLeft: '20px' }}>
                🎨 {work.title} — {work.artist} ({work.artistNationality})
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (searchType === 'artwork') {
    return (
      <div>
        {results.map((work, index) => (
          <div key={index} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '5px' }}>
            <h4>{work.title}</h4>
            <p>{work.artist} ({work.artistNationality})</p>
          </div>
        ))}
      </div>
    );
  }

  if (searchType === 'artist') {
    return (
      <div>
        {results.map((work, index) => (
          <div key={index} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '5px' }}>
            <h4>{work.artist}</h4>
            <p>{work.title}</p>
          </div>
        ))}
      </div>
    );
  }

  return <div>검색 결과가 없습니다.</div>;
};

export default SearchResults;