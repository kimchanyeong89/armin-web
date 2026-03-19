import React, { useState, useRef, useEffect } from 'react';

interface SearchInputWithSuggestionsProps {
    value: string;
    onChange: (value: string) => void;
    suggestions: string[];
    placeholder?: string;
    style?: React.CSSProperties;
    className?: string;
    inputStyle?: React.CSSProperties;
}

export const SearchInputWithSuggestions: React.FC<SearchInputWithSuggestionsProps> = ({
    value,
    onChange,
    suggestions,
    placeholder,
    style,
    className,
    inputStyle
}) => {
    const [isFocused, setIsFocused] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Filter suggestions based on current value if provided? 
    // The user said "make the search terms inside the modal page appear as recommended".
    // Usually this means "autocomplete". 
    // We will show "suggestions" that match the input if input > 0.
    // If input == 0, maybe show top popular ones?
    // The parent component will pass the full list or filtered list?
    // Let's assume parent passes the full list of "Top Terms" or "All Terms" and we filter here?
    // Or parent creates the list.
    // Let's filter here for simplicity if the list is passed.
    // Actually, passing computed suggestions from parent is more flexible.

    // Handle click outside to close suggestions
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsFocused(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
        setIsFocused(true);
    };

    const handleSelectSuggestion = (suggestion: string) => {
        onChange(suggestion);
        setIsFocused(false);
    };

    const displaySuggestions = suggestions.filter(s =>
        !value || s.toLowerCase().includes(value.toLowerCase())
    ).slice(0, 10);

    return (
        <div ref={wrapperRef} style={{ ...style, position: 'relative' }} className={className}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    placeholder={placeholder}
                    style={{
                        ...inputStyle,
                        width: '100%',
                        paddingRight: value ? 20 : 0, // Space for X button
                        boxSizing: 'border-box'
                    }}
                />
                {value && (
                    <button
                        onClick={handleClear}
                        style={{
                            position: 'absolute',
                            right: 0,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'transparent',
                            border: 'none',
                            color: '#999',
                            cursor: 'pointer',
                            padding: 2,
                            fontSize: 12,
                            lineHeight: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            zIndex: 10 // Ensure clickable
                        }}
                    >
                        ✕
                    </button>
                )}
            </div>

            {isFocused && displaySuggestions.length > 0 && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'rgba(255, 255, 255, 0.65)',
                    backdropFilter: 'blur(30px) saturate(200%)',
                    border: '1px solid #eee',
                    borderRadius: 4,
                    marginTop: 4,
                    zIndex: 1000,
                    maxHeight: 200,
                    overflowY: 'auto',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}>
                    <div style={{ padding: '6px 8px', fontSize: 10, color: '#888', fontWeight: 600, borderBottom: '1px solid #f0f0f0' }}>
                        RECOMMENDED
                    </div>
                    {displaySuggestions.map((item, idx) => (
                        <div
                            key={`${item}-${idx}`}
                            onClick={() => handleSelectSuggestion(item)}
                            onMouseDown={(e) => e.preventDefault()}
                            style={{
                                padding: '6px 8px',
                                fontSize: 11,
                                color: '#333',
                                cursor: 'pointer',
                                borderBottom: idx < displaySuggestions.length - 1 ? '1px solid #f3f3f3' : 'none'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            {item}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
