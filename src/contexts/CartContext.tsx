import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { calculateUnitPrice } from "../features/cart/productCatalog";

export type CartSizeOption = {
  id: string;
  name: string;
  multiplier: number;
};

export type CartItem = {
  id: string;
  artworkId: string;
  artworkName: string;
  artist: string;
  year?: number;
  image: string;
  dimension?: string;
  selectedType: string;
  selectedSizeId: string;
  quantity: number;
  sizeOptions: CartSizeOption[];
  createdAt: number;
};

type AddCartItemInput = Omit<CartItem, "id" | "createdAt">;

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  addItem: (input: AddCartItemInput) => void;
  updateItem: (id: string, patch: Partial<CartItem>) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  getItemTotalPrice: (item: CartItem) => number;
};

const CART_STORAGE_KEY = "armin:cart:v1";

const CartContext = createContext<CartContextValue | null>(null);

function normalizeQuantity(value: number): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(99, parsed));
}

function normalizeSizeOptions(options: CartSizeOption[]): CartSizeOption[] {
  if (!Array.isArray(options) || options.length === 0) {
    return [{ id: "M", name: "M", multiplier: 1.5 }];
  }
  return options
    .filter((option) => option && option.id && option.name)
    .map((option) => ({
      id: String(option.id),
      name: String(option.name),
      multiplier: Number(option.multiplier) || 1,
    }));
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as CartItem[];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => item && item.id && item.artworkId)
        .map((item) => ({
          ...item,
          quantity: normalizeQuantity(item.quantity),
          sizeOptions: normalizeSizeOptions(item.sizeOptions),
          createdAt: Number(item.createdAt) || Date.now(),
        }));
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore storage failure
    }
  }, [items]);

  const addItem = useCallback((input: AddCartItemInput) => {
    setItems((prev) => {
      const compositeKey = `${input.artworkId}__${input.selectedType}__${input.selectedSizeId}`;
      const existing = prev.find((item) => `${item.artworkId}__${item.selectedType}__${item.selectedSizeId}` === compositeKey);

      if (existing) {
        return prev.map((item) => {
          if (item.id !== existing.id) return item;
          return {
            ...item,
            quantity: normalizeQuantity(item.quantity + input.quantity),
            sizeOptions: normalizeSizeOptions(input.sizeOptions),
          };
        });
      }

      const nextItem: CartItem = {
        ...input,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        quantity: normalizeQuantity(input.quantity),
        sizeOptions: normalizeSizeOptions(input.sizeOptions),
        createdAt: Date.now(),
      };

      return [nextItem, ...prev];
    });
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<CartItem>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const merged = { ...item, ...patch };
        return {
          ...merged,
          quantity: normalizeQuantity(merged.quantity),
          sizeOptions: normalizeSizeOptions(merged.sizeOptions),
        };
      }),
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const itemCount = useMemo(() => items.reduce((sum, item) => sum + normalizeQuantity(item.quantity), 0), [items]);

  const getItemTotalPrice = useCallback((item: CartItem) => {
    const size = item.sizeOptions.find((option) => option.id === item.selectedSizeId);
    const multiplier = size?.multiplier || 1;
    return calculateUnitPrice(item.selectedType, multiplier) * normalizeQuantity(item.quantity);
  }, []);

  const value = useMemo<CartContextValue>(() => ({
    items,
    itemCount,
    addItem,
    updateItem,
    removeItem,
    clearCart,
    getItemTotalPrice,
  }), [items, itemCount, addItem, updateItem, removeItem, clearCart, getItemTotalPrice]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
}
