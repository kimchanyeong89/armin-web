import React, { useState, useRef, useEffect, useId } from 'react';

interface SearchInputWithSuggestionsProps {
    value: string;
    onChange: (value: string) => void;
    suggestions: string[];
    inputId?: string;
    inputName?: string;
    placeholder?: string;
    style?: React.CSSProperties;
    className?: string;
    inputStyle?: React.CSSProperties;
    dropdownStyle?: React.CSSProperties;
    dropdownHeaderStyle?: React.CSSProperties;
    dropdownItemStyle?: React.CSSProperties;
    dropdownItemHoverStyle?: React.CSSProperties;
    dropdownScrollbarTrackColor?: string;
    dropdownScrollbarThumbColor?: string;
    dropdownScrollbarThumbHoverColor?: string;
    recommendedLabel?: string;
    clearButtonStyle?: React.CSSProperties;
}

export const SearchInputWithSuggestions: React.FC<SearchInputWithSuggestionsProps> = ({
    value,
    onChange,
    suggestions,
    inputId,
    inputName,
    placeholder,
    style,
    className,
    inputStyle,
    dropdownStyle,
    dropdownHeaderStyle,
    dropdownItemStyle,
    dropdownItemHoverStyle,
    dropdownScrollbarTrackColor,
    dropdownScrollbarThumbColor,
    dropdownScrollbarThumbHoverColor,
    recommendedLabel = 'RECOMMENDED',
    clearButtonStyle
}) => {
    const [isFocused, setIsFocused] = useState(false);
    const [hoveredSuggestionIndex, setHoveredSuggestionIndex] = useState<number | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const generatedId = useId();
    const resolvedInputId = inputId || `search-${generatedId.replace(/[:]/g, '')}`;
    const resolvedInputName = inputName || resolvedInputId;
    const suggestionDropdownClass = `search-suggestions-${generatedId.replace(/[:]/g, '')}`;
    const scrollbarTrackColor = dropdownScrollbarTrackColor || 'rgba(0, 0, 0, 0.06)';
    const scrollbarThumbColor = dropdownScrollbarThumbColor || 'rgba(60, 60, 60, 0.35)';
    const scrollbarThumbHoverColor = dropdownScrollbarThumbHoverColor || 'rgba(60, 60, 60, 0.55)';

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
            <style>{`
                .${suggestionDropdownClass} {
                    scrollbar-width: thin;
                    scrollbar-color: ${scrollbarThumbColor} ${scrollbarTrackColor};
                }

                .${suggestionDropdownClass}::-webkit-scrollbar {
                    width: 8px;
                }

                .${suggestionDropdownClass}::-webkit-scrollbar-track {
                    background: ${scrollbarTrackColor};
                    border-radius: 999px;
                }

                .${suggestionDropdownClass}::-webkit-scrollbar-thumb {
                    background: ${scrollbarThumbColor};
                    border-radius: 999px;
                    border: 1px solid ${scrollbarTrackColor};
                }

                .${suggestionDropdownClass}::-webkit-scrollbar-thumb:hover {
                    background: ${scrollbarThumbHoverColor};
                }
            `}</style>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                <input
                    type="text"
                    id={resolvedInputId}
                    name={resolvedInputName}
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
                        type="button"
                        aria-label="Clear search"
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
                            zIndex: 10, // Ensure clickable
                            ...clearButtonStyle
                        }}
                    >
                        ✕
                    </button>
                )}
            </div>

            {isFocused && displaySuggestions.length > 0 && (
                <div className={suggestionDropdownClass} style={{
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
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    ...dropdownStyle
                }}>
                    <div style={{ padding: '6px 8px', fontSize: 10, color: '#888', fontWeight: 600, borderBottom: '1px solid #f0f0f0', ...dropdownHeaderStyle }}>
                        {recommendedLabel}
                    </div>
                    {displaySuggestions.map((item, idx) => (
                        <div
                            key={`${item}-${idx}`}
                            onClick={() => handleSelectSuggestion(item)}
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => setHoveredSuggestionIndex(idx)}
                            onMouseLeave={() => setHoveredSuggestionIndex(null)}
                            style={{
                                padding: '6px 8px',
                                fontSize: 11,
                                color: '#333',
                                cursor: 'pointer',
                                borderBottom: idx < displaySuggestions.length - 1 ? '1px solid #f3f3f3' : 'none',
                                ...dropdownItemStyle,
                                ...(hoveredSuggestionIndex === idx ? dropdownItemHoverStyle : null)
                            }}
                        >
                            {item}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
