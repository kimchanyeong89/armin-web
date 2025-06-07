// src/components/SearchBar.tsx

import React from 'react';

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit?: () => void; // 추가
}

const SearchBar: React.FC<SearchBarProps> = ({
  searchQuery,
  onSearchChange,
  onSearchSubmit
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSearchSubmit) {
      onSearchSubmit();
    }
  };

  return (
    <input
      type="text"
      value={searchQuery}
      onChange={(e) => onSearchChange(e.target.value)}
      onKeyDown={handleKeyDown}  // 추가
      placeholder="검색어를 입력해주세요."
      style={{
        width: '100%',
        padding: '10px',
        fontSize: '16px',
        border: '1px solid #ccc',
        borderRadius: '4px',
        marginBottom: '20px'
      }}
    />
  );
};

export default SearchBar;