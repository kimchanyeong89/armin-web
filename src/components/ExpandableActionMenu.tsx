import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookmarkPlus, ShoppingBag } from "lucide-react";
import { LikeIcon } from "./like/LikeIcon";
import { SHOW_SALES_UI } from '../config/features';
import { useLanguage } from '../contexts/LanguageContext';
import { hasNativeAr, openNativeAr } from '../utils/nativeAr';

interface ExpandableActionMenuProps {
  isMobile: boolean;
  isLiked: boolean;
  onToggleLike: (e: React.MouseEvent) => void;
  onOpenProduct?: (e: React.MouseEvent) => void;
  onOpenPlaylist?: (e: React.MouseEvent) => void;
  /** the artwork's picture: with it, and inside the app, an AR button joins the row */
  arImage?: string | null;
  iconSize?: number;
  buttonSize?: number;
  buttonBg?: string;
  buttonColor?: string;
}

export function ExpandableActionMenu({
  isMobile,
  isLiked,
  onToggleLike,
  onOpenProduct,
  onOpenPlaylist,
  arImage,
  iconSize = 13,
  buttonSize = 29,
  buttonBg = "rgba(0,0,0,0.58)",
  buttonColor = "#fff"
}: ExpandableActionMenuProps) {
  const [expanded, setExpanded] = useState(false);
  const { language } = useLanguage();
  const showAr = Boolean(arImage) && hasNativeAr();

  const btnStyle = {
    width: buttonSize,
    height: buttonSize,
    borderRadius: '50%',
    border: 'none',
    background: buttonBg,
    color: buttonColor,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0
  };

  const handleToggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  // On Web, or if expanded on Mobile, show all 3 icons.
  const showAll = !isMobile || expanded;

  return (
    <div
      style={{
        position: 'absolute',
        right: 8,
        bottom: 8,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 6,
        pointerEvents: 'auto',
      }}
    >
      <AnimatePresence>
        {showAll && (
          <>
            {SHOW_SALES_UI && onOpenProduct && (
              <motion.button
                key="product"
                initial={isMobile ? { opacity: 0, x: 70, scale: 0.8, zIndex: 1 } : { opacity: 1, x: 0, scale: 1, zIndex: 1 }}
                animate={{ opacity: 1, x: 0, scale: 1, zIndex: 1 }}
                exit={{ opacity: 0, x: 70, scale: 0.8, zIndex: 1 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenProduct(e);
                  if (isMobile) setExpanded(false);
                }}
                style={btnStyle}
                title="Purchase Frame"
              >
                <ShoppingBag size={iconSize} strokeWidth={2.1} />
              </motion.button>
            )}

            {showAr && (
              <motion.button
                key="ar"
                initial={isMobile ? { opacity: 0, x: 35, scale: 0.8, zIndex: 2 } : { opacity: 1, x: 0, scale: 1, zIndex: 2 }}
                animate={{ opacity: 1, x: 0, scale: 1, zIndex: 2 }}
                exit={{ opacity: 0, x: 35, scale: 0.8, zIndex: 2 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                onClick={(e) => {
                  e.stopPropagation();
                  openNativeAr(String(arImage), language);
                  if (isMobile) setExpanded(false);
                }}
                style={{ ...btnStyle, fontFamily: "'Space Mono', monospace", fontSize: Math.round(iconSize * 0.72), fontWeight: 700, letterSpacing: '0.04em' }}
                title="AR"
              >
                AR
              </motion.button>
            )}

            {onOpenPlaylist && (
              <motion.button
                key="playlist"
                initial={isMobile ? { opacity: 0, x: 35, scale: 0.8, zIndex: 2 } : { opacity: 1, x: 0, scale: 1, zIndex: 2 }}
                animate={{ opacity: 1, x: 0, scale: 1, zIndex: 2 }}
                exit={{ opacity: 0, x: 35, scale: 0.8, zIndex: 2 }}
                transition={{ duration: 0.25, ease: "easeOut", delay: isMobile ? 0.05 : 0 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPlaylist(e);
                  if (isMobile) setExpanded(false);
                }}
                style={btnStyle}
                title="Save to Playlist"
              >
                <BookmarkPlus size={iconSize} strokeWidth={2.2} />
              </motion.button>
            )}
          </>
        )}
      </AnimatePresence>

      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={(e) => {
          e.stopPropagation();
          if (isMobile) {
            // Always fire like immediately; toggle expand state
            onToggleLike(e);
            setExpanded(prev => !prev);
          } else {
            onToggleLike(e);
          }
        }}
        style={{ ...btnStyle, zIndex: 10, position: 'relative' }}
        title={isMobile && !expanded ? "Open menu" : "Like"}
      >
        <LikeIcon liked={isLiked} size={iconSize + 1} strokeWidth={2.2} color="#D4A547" emptyColor={buttonColor} />
      </motion.button>
    </div>
  );
}
